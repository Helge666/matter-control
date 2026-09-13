/**
 * Ask the lamp directly whether it honours LevelControl, independent of the UI.
 *
 * Sends a few brightness commands with generous spacing and reads back what the device
 * reports, so we can tell "our command never arrives", "the device rejects it" and
 * "the device accepts it but does not act" apart.
 *
 * Usage: node tools/level-probe.mjs [peerId]
 */
import { ControllerBehavior, Environment, LogLevel, Logger, ServerNode } from "@matter/main";
import path from "node:path";
import process from "node:process";

const DATA_DIR =
    process.env.MATTER_DATA_DIR ?? path.join(process.env.APPDATA ?? ".", "matter-control", "matter");

Logger.level = LogLevel.WARN;

const wanted = process.argv[2];

function snapshot(ep) {
    const lc = ep.state?.levelControl ?? {};
    const cc = ep.state?.colorControl ?? {};
    return {
        onOff: ep.state?.onOff?.onOff,
        currentLevel: lc.currentLevel,
        minLevel: lc.minLevel,
        maxLevel: lc.maxLevel,
        options: lc.options,
        onLevel: lc.onLevel,
        remainingTime: lc.remainingTime,
        colorMode: cc.colorMode,
        enhancedColorMode: cc.enhancedColorMode,
        currentHue: cc.currentHue,
        currentSaturation: cc.currentSaturation,
    };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const env = Environment.default;
env.vars.set("storage.path", DATA_DIR);

const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
    id: "controller",
    controller: { adminFabricLabel: "matter-control (PC)" },
});
await node.start();

try {
    const peers = [...node.peers].filter(p => p.state.commissioning?.peerAddress);
    const peer = wanted ? peers.find(p => p.id === wanted) : peers[0];
    if (!peer) {
        console.log("peers:", peers.map(p => p.id).join(", ") || "(none)");
        throw new Error(`peer ${wanted ?? "(first)"} not found`);
    }

    const ep = [...peer.endpoints].find(e => e.state?.levelControl !== undefined);
    if (!ep) throw new Error(`${peer.id} has no LevelControl endpoint`);

    console.log(`\n=== ${peer.id} endpoint ${ep.number} ===`);
    console.log("before:", JSON.stringify(snapshot(ep)));

    // Make sure the lamp is on; level changes are invisible otherwise.
    await ep.act(agent => agent.onOff.on());
    await sleep(1000);
    console.log("after on:", JSON.stringify(snapshot(ep)));

    for (const [label, run] of [
        ["moveToLevelWithOnOff(40, t=1)", a => a.levelControl.moveToLevelWithOnOff({ level: 40, transitionTime: 1, optionsMask: {}, optionsOverride: {} })],
        ["moveToLevelWithOnOff(230, t=1)", a => a.levelControl.moveToLevelWithOnOff({ level: 230, transitionTime: 1, optionsMask: {}, optionsOverride: {} })],
        ["moveToLevelWithOnOff(90, t=0)", a => a.levelControl.moveToLevelWithOnOff({ level: 90, transitionTime: 0, optionsMask: {}, optionsOverride: {} })],
        ["moveToLevel(200, t=0, execIfOff)", a => a.levelControl.moveToLevel({ level: 200, transitionTime: 0, optionsMask: { executeIfOff: true }, optionsOverride: { executeIfOff: true } })],
        ["moveToLevelWithOnOff(60, t=null)", a => a.levelControl.moveToLevelWithOnOff({ level: 60, transitionTime: null, optionsMask: {}, optionsOverride: {} })],
    ]) {
        process.stdout.write(`\n${label}\n`);
        try {
            await ep.act(agent => run(agent));
            console.log("  sent ok");
        } catch (e) {
            console.log(`  SEND FAILED: ${e.message}`);
            continue;
        }
        await sleep(2500);
        console.log("  reported:", JSON.stringify(snapshot(ep)));
    }
} finally {
    await node.close();
}

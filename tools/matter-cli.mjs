/**
 * matter-cli -- proof harness for the matter.js controller stack.
 *
 * Subcommands:
 *   discover [secs]                  scan for commissionable devices (_matterc._udp)
 *   peers                            list nodes commissioned into our fabric
 *   commission <pairingCode> [name]  commission a device into our fabric
 *   info <nodeId>                    dump endpoints / clusters of a paired node
 *   onoff <nodeId> <on|off|toggle>   drive the OnOff cluster
 *   level <nodeId> <0-254>           drive the LevelControl cluster
 *   forget <nodeId>                  remove node from our fabric
 */
import {
    ControllerBehavior,
    Environment,
    LogFormat,
    LogLevel,
    Logger,
    Seconds,
    ServerNode,

} from "@matter/main";
import path from "node:path";
import process from "node:process";

/**
 * Share one fabric with the Electron app by defaulting to its userData directory. Only one
 * process may hold the store at a time; matter.js enforces that with a lock file, so close the
 * app before running the CLI (and vice versa).
 */
function defaultDataDir() {
    if (process.platform === "win32" && process.env.APPDATA) {
        return path.join(process.env.APPDATA, "matter-control", "matter");
    }
    const home = process.env.HOME ?? process.cwd();
    return process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "matter-control", "matter")
        : path.join(home, ".config", "matter-control", "matter");
}

const DATA_DIR = process.env.MATTER_DATA_DIR ?? defaultDataDir();
const [cmd, ...args] = process.argv.slice(2);

Logger.level = process.env.MATTER_LOG ? LogLevel[process.env.MATTER_LOG.toUpperCase()] : LogLevel.INFO;
Logger.format = LogFormat.ANSI;

function die(msg) {
    console.error(`\n[x] ${msg}\n`);
    process.exit(1);
}

async function withController(fn) {
    const env = Environment.default;
    // NodeJsEnvironment resolves this lazily, so setting it before first use is enough.
    env.vars.set("storage.path", DATA_DIR);

    const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
        id: "controller",
        controller: { adminFabricLabel: "matter-control (PC)" },
        basicInformation: { vendorName: "matter-control", productName: "Windows Controller" },
    });

    await node.start();
    try {
        return await fn(node);
    } finally {
        await node.close();
    }
}

function describe(n) {
    const c = n.state.commissioning;
    const addrs = (c.addresses ?? []).map(a =>
        a.type === "udp" ? `${a.ip}:${a.port}` : `${a.type}:${a.peripheralAddress ?? ""}`,
    );
    return {
        id: n.id,
        nodeId: c.peerAddress ? `0x${c.peerAddress.nodeId.toString(16)}` : "(uncommissioned)",
        vendorId: c.vendorId !== undefined ? `0x${c.vendorId.toString(16)}` : "?",
        productId: c.productId !== undefined ? `0x${c.productId.toString(16)}` : "?",
        name: c.deviceName ?? "",
        discriminator: c.discriminator ?? "",
        commissioningMode: c.commissioningMode ?? "",
        addresses: addrs,
    };
}

function table(rows) {
    if (!rows.length) {
        console.log("  (none)");
        return;
    }
    for (const r of rows) {
        console.log(
            `  ${String(r.id).padEnd(10)} node=${String(r.nodeId).padEnd(14)} vid=${String(r.vendorId).padEnd(8)} pid=${String(r.productId).padEnd(8)} D=${String(r.discriminator).padEnd(5)} CM=${String(r.commissioningMode).padEnd(2)} ${r.name}`,
        );
        if (r.addresses.length) console.log(`${" ".repeat(12)} ${r.addresses.join(", ")}`);
    }
}

function findPeer(node, id) {
    return node.peers.get(id) ?? node.peers.get(Number(id));
}

const commands = {
    async discover() {
        const secs = Number(args[0] ?? 10);
        console.log(`\nScanning ${secs}s for commissionable devices...\n`);
        await withController(async node => {
            const discovery = node.peers.discover({ timeout: Seconds(secs) });
            discovery.discovered.on(n => console.log(`  + found ${n.id}`));
            const found = await discovery;
            console.log(`\n=== commissionable (${found.length}) ===`);
            table(found.map(describe));
        });
    },

    async peers() {
        await withController(async node => {
            const all = [...node.peers];
            // Discovery leaves behind candidates that were never commissioned; those are not
            // fabric members and only add noise here.
            const members = all.filter(p => p.state.commissioning?.peerAddress);
            console.log(`\n=== nodes in our fabric (${members.length}) ===`);
            table(members.map(describe));
            const pending = all.length - members.length;
            if (pending) console.log(`\n  (${pending} discovered but uncommissioned candidate(s) not shown)`);
        });
    },

    async commission() {
        const pairingCode = (args[0] ?? "").replace(/[\s-]/g, "");
        if (!pairingCode) die("usage: commission <pairingCode> [name]");
        const label = args[1];
        console.log(`\nCommissioning with code ${pairingCode}...\n`);
        await withController(async node => {
            const started = Date.now();
            const peer = await node.peers.commission({
                pairingCode,
                ...(label ? { id: label } : {}),
                timeout: Seconds(90),
                // A lamp already joined to WiFi needs no network credentials.
                regulatoryCountryCode: "DE",
            });
            console.log(`\n[ok] commissioned in ${((Date.now() - started) / 1000).toFixed(1)}s`);
            table([describe(peer)]);
        });
    },

    async info() {
        const id = args[0];
        if (!id) die("usage: info <nodeId>");
        await withController(async node => {
            const peer = findPeer(node, id);
            if (!peer) die(`node ${id} not found -- run "peers"`);
            console.log(`\n=== ${peer.id} ===`);
            table([describe(peer)]);
            for (const ep of peer.endpoints) {
                console.log(`\n  endpoint ${ep.number} (${ep.type?.name ?? "?"})`);
                for (const name of Object.keys(ep.state ?? {})) {
                    const st = ep.state[name];
                    if (st && typeof st === "object") {
                        const keys = Object.keys(st).slice(0, 8);
                        console.log(`    ${name}: ${keys.map(k => `${k}=${JSON.stringify(st[k])}`).join(" ")}`);
                    }
                }
            }
        });
    },

    async onoff() {
        const [id, action = "toggle"] = args;
        if (!id) die("usage: onoff <nodeId> <on|off|toggle>");
        await withController(async node => {
            const peer = findPeer(node, id);
            if (!peer) die(`node ${id} not found`);
            for (const ep of peer.endpoints) {
                if (ep.state?.onOff === undefined) continue;
                await ep.act(agent => agent.onOff[action]());
                console.log(`[ok] onOff.${action} on endpoint ${ep.number}`);
                return;
            }
            die("no endpoint with an OnOff cluster found");
        });
    },

    async level() {
        const [id, value] = args;
        if (!id || value === undefined) die("usage: level <nodeId> <0-254>");
        await withController(async node => {
            const peer = findPeer(node, id);
            if (!peer) die(`node ${id} not found`);
            for (const ep of peer.endpoints) {
                if (ep.state?.levelControl === undefined) continue;
                await ep.act(agent =>
                    agent.levelControl.moveToLevelWithOnOff({
                        level: Number(value),
                        transitionTime: 5,
                        optionsMask: {},
                        optionsOverride: {},
                    }),
                );
                console.log(`[ok] level=${value} on endpoint ${ep.number}`);
                return;
            }
            die("no endpoint with a LevelControl cluster found");
        });
    },

    async forget() {
        const id = args[0];
        if (!id) die("usage: forget <nodeId>");
        await withController(async node => {
            const peer = findPeer(node, id);
            if (!peer) die(`node ${id} not found`);
            try {
                await peer.decommission();
                console.log("[ok] decommissioned");
            } catch (e) {
                console.log(`[!] decommission failed (${e.message}); deleting locally`);
                await peer.delete();
            }
        });
    },
};

if (!cmd || !commands[cmd]) {
    console.log(`\nmatter-cli -- data dir: ${DATA_DIR}\n`);
    console.log("  discover [secs]                  scan for commissionable devices");
    console.log("  peers                            list nodes in our fabric");
    console.log("  commission <pairingCode> [name]  commission a device");
    console.log("  info <nodeId>                    dump endpoints / clusters");
    console.log("  onoff <nodeId> <on|off|toggle>   drive OnOff");
    console.log("  level <nodeId> <0-254>           drive LevelControl");
    console.log("  forget <nodeId>                  remove from our fabric\n");
    process.exit(cmd ? 1 : 0);
}

try {
    await commands[cmd]();
    process.exit(0);
} catch (e) {
    console.error(`\n[x] ${cmd} failed: ${e?.message ?? e}`);
    if (process.env.MATTER_TRACE) console.error(e);
    process.exit(1);
}

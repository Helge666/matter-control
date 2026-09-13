/**
 * Dump everything a paired device exposes, with emphasis on manufacturer-specific clusters.
 *
 * Matter forms a vendor cluster id as (vendorId << 16) | 0xFCxx, and matter.js surfaces clusters
 * it has no model for as `cluster$<hex id>` with synthetic `attr$<hex>` members. Those are where
 * vendor features live that the standard clusters cannot express.
 *
 * Usage: node tools/vendor-probe.mjs [peerId]
 */
import { ControllerBehavior, Environment, LogLevel, Logger, ServerNode } from "@matter/main";
import path from "node:path";
import process from "node:process";

const DATA_DIR =
    process.env.MATTER_DATA_DIR ?? path.join(process.env.APPDATA ?? ".", "matter-control", "matter");

Logger.level = LogLevel.WARN;
const wanted = process.argv[2];

/** Global attributes every cluster carries; useful for discovering what an unknown one supports. */
const GLOBAL = {
    0xfff8: "GeneratedCommandList",
    0xfff9: "AcceptedCommandList",
    0xfffa: "EventList",
    0xfffb: "AttributeList",
    0xfffc: "FeatureMap",
    0xfffd: "ClusterRevision",
};

function render(value, depth = 0) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === "bigint") return `${value}n`;
    if (value instanceof Uint8Array || Array.isArray(value?.data)) {
        const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value.data);
        return `bytes(${bytes.length}) ${Buffer.from(bytes).toString("hex")}`;
    }
    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return `[${value.map(v => render(v, depth + 1)).join(", ")}]`;
    }
    if (typeof value === "object") {
        if (depth > 2) return "{…}";
        return `{ ${Object.entries(value)
            .map(([k, v]) => `${k}: ${render(v, depth + 1)}`)
            .join(", ")} }`;
    }
    return JSON.stringify(value);
}

function decodeSyntheticKey(key) {
    const m = /^attr\$([0-9a-f]+)$/i.exec(key);
    if (!m) return key;
    const id = parseInt(m[1], 16);
    const global = GLOBAL[id];
    return `attr 0x${id.toString(16).padStart(4, "0")}${global ? ` (${global})` : ""}`;
}

const env = Environment.default;
env.vars.set("storage.path", DATA_DIR);

const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
    id: "controller",
    controller: { adminFabricLabel: "matter-control (PC)" },
});
await node.start();

try {
    const peers = [...node.peers].filter(p => p.state.commissioning?.peerAddress);
    const targets = wanted ? peers.filter(p => p.id === wanted) : peers;
    if (!targets.length) throw new Error(`no peers (have: ${peers.map(p => p.id).join(", ") || "none"})`);

    for (const peer of targets) {
        console.log(`\n${"=".repeat(72)}\n${peer.id}  ${peer.state.commissioning?.peerAddress?.nodeId}\n${"=".repeat(72)}`);

        for (const ep of peer.endpoints) {
            const clusters = Object.keys(ep.state ?? {});
            if (!clusters.length) continue;
            console.log(`\n-- endpoint ${ep.number} --`);
            console.log(`   clusters: ${clusters.join(", ")}`);

            for (const name of clusters) {
                const isVendor = name.startsWith("cluster$");
                if (!isVendor) continue;

                const id = parseInt(name.slice("cluster$".length), 16);
                const vendorId = id >>> 16;
                console.log(
                    `\n   >>> ${name}  =  cluster 0x${id.toString(16)} ` +
                        `(vendor 0x${vendorId.toString(16)}, cluster 0x${(id & 0xffff).toString(16)})`,
                );
                const state = ep.state[name] ?? {};
                for (const [key, value] of Object.entries(state)) {
                    console.log(`       ${decodeSyntheticKey(key).padEnd(34)} ${render(value)}`);
                }
            }
        }

        // Standard colour/level detail, for comparison with whatever the vendor cluster holds.
        const light = [...peer.endpoints].find(e => e.state?.colorControl !== undefined);
        if (light) {
            const cc = light.state.colorControl;
            console.log(`\n-- colorControl on endpoint ${light.number} --`);
            for (const key of [
                "colorMode",
                "enhancedColorMode",
                "colorCapabilities",
                "currentHue",
                "currentSaturation",
                "colorTemperatureMireds",
                "numberOfPrimaries",
            ]) {
                if (cc[key] !== undefined) console.log(`       ${key.padEnd(26)} ${render(cc[key])}`);
            }
        }
    }
} finally {
    await node.close();
}

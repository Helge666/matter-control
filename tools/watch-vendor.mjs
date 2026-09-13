/**
 * Record what a manufacturer-specific cluster does while someone drives the device elsewhere.
 *
 * Start this, then use the vendor's phone app (switch a mood on, change its speed, switch it
 * off). Every attribute that changes is printed with a timestamp and a byte-level diff, so the
 * encoding of a vendor feature can be reconstructed from observation rather than guesswork.
 *
 * Usage: node tools/watch-vendor.mjs [peerId]   (Ctrl+C to stop)
 */
import { ControllerBehavior, Environment, LogLevel, Logger, ServerNode } from "@matter/main";
import path from "node:path";
import process from "node:process";

const DATA_DIR =
    process.env.MATTER_DATA_DIR ?? path.join(process.env.APPDATA ?? ".", "matter-control", "matter");
const POLL_MS = 400;

Logger.level = LogLevel.WARN;
const wanted = process.argv[2];

/** Watch vendor clusters plus the standard light clusters, to see how they interact. */
const isWatched = name =>
    name.startsWith("cluster$") || ["onOff", "levelControl", "colorControl"].includes(name);

function toHex(value) {
    if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
    if (Array.isArray(value?.data)) return Buffer.from(Uint8Array.from(value.data)).toString("hex");
    return undefined;
}

function show(value) {
    const hex = toHex(value);
    if (hex !== undefined) return `bytes(${hex.length / 2}) ${hex || "(empty)"}`;
    if (typeof value === "bigint") return `${value}n`;
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/** Byte-level diff of two hex strings, so a changing field inside a blob is obvious. */
function diffHex(a, b) {
    if (!a && !b) return undefined;
    if (a.length !== b.length) return `length ${a.length / 2} -> ${b.length / 2} bytes`;
    const changed = [];
    for (let i = 0; i < a.length; i += 2) {
        if (a.slice(i, i + 2) !== b.slice(i, i + 2)) changed.push(i / 2);
    }
    if (!changed.length) return undefined;
    return (
        `changed at [${changed.join(", ")}]: ` +
        changed.map(i => `#${i} ${a.slice(i * 2, i * 2 + 2)}->${b.slice(i * 2, i * 2 + 2)}`).join("  ")
    );
}

const stamp = () => new Date().toLocaleTimeString("de-DE", { hour12: false });

const env = Environment.default;
env.vars.set("storage.path", DATA_DIR);

const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
    id: "controller",
    controller: { adminFabricLabel: "matter-control (PC)" },
});
await node.start();

const peers = [...node.peers].filter(p => p.state.commissioning?.peerAddress);
const targets = wanted ? peers.filter(p => p.id === wanted) : peers;
if (!targets.length) {
    console.error(`no peers (have: ${peers.map(p => p.id).join(", ") || "none"})`);
    await node.close();
    process.exit(1);
}

const snapshots = new Map();

function scan(report) {
    for (const peer of targets) {
        for (const ep of peer.endpoints) {
            for (const cluster of Object.keys(ep.state ?? {})) {
                if (!isWatched(cluster)) continue;
                const state = ep.state[cluster] ?? {};

                for (const [attr, value] of Object.entries(state)) {
                    if (typeof value === "function") continue;

                    const hex = toHex(value);
                    const current = hex ?? JSON.stringify(value ?? null);
                    const key = `${peer.id}/${ep.number}/${cluster}/${attr}`;
                    const previous = snapshots.get(key);

                    if (previous === undefined) {
                        snapshots.set(key, current);
                        continue;
                    }
                    if (previous === current) continue;
                    snapshots.set(key, current);
                    if (!report) continue;

                    console.log(`\n[${stamp()}] ${peer.id} ep${ep.number} ${cluster}.${attr}`);
                    console.log(`    before: ${previous.length > 140 ? `${previous.slice(0, 140)}…` : previous}`);
                    console.log(`    after : ${show(value)}`);
                    if (hex !== undefined) {
                        const detail = diffHex(previous, hex);
                        if (detail) console.log(`    ${detail}`);
                    }
                }
            }
        }
    }
}

scan(false);
console.log(`Watching ${targets.map(p => p.id).join(", ")} — drive the device from the vendor app now.`);
console.log(`Baseline captured for ${snapshots.size} attributes. Ctrl+C to stop.\n`);

const timer = setInterval(() => scan(true), POLL_MS);

const stop = async () => {
    clearInterval(timer);
    await node.close().catch(() => {});
    process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

/**
 * Write any attribute of the Tuya vendor cluster, for exploring what we do not model yet.
 *
 * matter.js has no schema for a manufacturer cluster, so writes go through `TlvAny`, which wants
 * a parsed TLV element stream. Round-tripping a typed value through its codec produces that.
 *
 * Usage:
 *   node tools/vendor-set.mjs <peer>                       list the cluster's attributes
 *   node tools/vendor-set.mjs <peer> <attr> uint <n>       write an unsigned integer
 *   node tools/vendor-set.mjs <peer> <attr> bytes <hex>    write an octet string
 *
 *   <attr> is hex without prefix, e.g. 2, 33, 3d.
 */
import { ControllerBehavior, Environment, LogLevel, Logger, ServerNode } from "@matter/main";
import { TlvAny, TlvByteString, TlvUInt32 } from "@matter/types";
import path from "node:path";
import process from "node:process";
import { MOOD_CLUSTER } from "../src/shared/mood.ts";

const DATA_DIR =
    process.env.MATTER_DATA_DIR ?? path.join(process.env.APPDATA ?? ".", "matter-control", "matter");

Logger.level = process.env.MATTER_LOG ? LogLevel[process.env.MATTER_LOG.toUpperCase()] : LogLevel.WARN;

const [peerId, attrHex, type, raw] = process.argv.slice(2);
if (!peerId) {
    console.error("usage: node tools/vendor-set.mjs <peer> [<attr-hex> uint|bytes <value>]");
    process.exit(1);
}

const show = value => {
    if (value instanceof Uint8Array) return `bytes(${value.length}) ${Buffer.from(value).toString("hex")}`;
    if (Array.isArray(value?.data)) {
        const b = Buffer.from(Uint8Array.from(value.data));
        return `bytes(${b.length}) ${b.toString("hex")}`;
    }
    if (typeof value === "number") return `${value}  (0x${value.toString(16)})`;
    return JSON.stringify(value);
};

const env = Environment.default;
env.vars.set("storage.path", DATA_DIR);

const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
    id: "controller",
    controller: { adminFabricLabel: "matter-control (PC)" },
});
await node.start();

try {
    const peer = node.peers.get(peerId);
    if (!peer) throw new Error(`peer ${peerId} not found`);

    process.stdout.write("verbinde");
    await peer.start().catch(() => {});
    for (let i = 0; i < 40 && !peer.lifecycle.isOnline; i++) {
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, 1500));
    if (!peer.lifecycle.isOnline) throw new Error("Gerät kam nicht online — Lampe eingeschaltet?");
    console.log(" online");

    const endpoint = [...peer.endpoints].find(ep => ep.state?.[MOOD_CLUSTER] !== undefined);
    if (!endpoint) throw new Error(`${peerId} hat keinen ${MOOD_CLUSTER}`);
    const state = endpoint.state[MOOD_CLUSTER];

    if (!attrHex) {
        console.log(`\n=== ${peerId} · ${MOOD_CLUSTER} ===`);
        for (const [key, value] of Object.entries(state)) {
            if (typeof value === "function") continue;
            console.log(`  ${key.padEnd(22)} ${show(value)}`);
        }
        console.log("\n(nur gelesen — Attribut, Typ und Wert angeben zum Schreiben)");
    } else {
        const key = `attr$${attrHex.toLowerCase()}`;
        if (!(key in state)) throw new Error(`${key} gibt es auf diesem Gerät nicht`);

        const encoded =
            type === "uint"
                ? TlvAny.decodeTlv(TlvUInt32.encodeTlv(Number(raw)))
                : TlvAny.decodeTlv(TlvByteString.encodeTlv(Uint8Array.from(Buffer.from(raw.replace(/[\s-]/g, ""), "hex"))));

        console.log(`\nvorher   ${key}  ${show(state[key])}`);
        console.log(`schreibe ${key}  ${type} ${raw}`);

        await endpoint.setStateOf(MOOD_CLUSTER, { [key]: encoded });
        console.log("[ok] angenommen");

        await new Promise(r => setTimeout(r, 2500));
        console.log(`nachher  ${key}  ${show(endpoint.state[MOOD_CLUSTER][key])}`);
    }
} catch (e) {
    console.error(`\n[x] ${e?.message ?? e}`);
    if (process.env.MATTER_TRACE) console.error(e);
} finally {
    await node.close();
}

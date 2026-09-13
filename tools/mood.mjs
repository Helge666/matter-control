/**
 * Read, decode and write the Tuya dynamic-mood attribute from the command line.
 *
 * The format itself lives in src/shared/mood.ts, which the app uses too — Node strips the types
 * on import, so there is one codec rather than two that can drift apart.
 *
 * Usage:
 *   node tools/mood.mjs <peer>                          read and decode
 *   node tools/mood.mjs <peer> --write --raw <hex>      write raw bytes
 *   node tools/mood.mjs <peer> --write [--mode N] [--speed N] [--brightness N]
 *                                      [--segmented 0|1] [--topdown 0|1] [--colors 0:100,240:100]
 */
import { ControllerBehavior, Environment, LogLevel, Logger, ServerNode } from "@matter/main";
import { TlvAny, TlvByteString } from "@matter/types";
import path from "node:path";
import process from "node:process";
import { translate } from "../src/shared/i18n/index.ts";
import { MOOD_ATTRIBUTE, MOOD_CLUSTER, MOOD_MODE_IDS, decodeMood, encodeMood } from "../src/shared/mood.ts";

const DATA_DIR =
    process.env.MATTER_DATA_DIR ?? path.join(process.env.APPDATA ?? ".", "matter-control", "matter");

Logger.level = process.env.MATTER_LOG ? LogLevel[process.env.MATTER_LOG.toUpperCase()] : LogLevel.WARN;

const argv = process.argv.slice(2);
const peerId = argv[0];
const flag = name => argv.includes(`--${name}`);
const value = name => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
};

if (!peerId || peerId.startsWith("--")) {
    console.error("usage: node tools/mood.mjs <peer> [--write …]  (see header of this file)");
    process.exit(1);
}

/**
 * matter.js has no schema for a manufacturer cluster, so it encodes writes through `TlvAny`,
 * which expects a parsed TLV element stream rather than raw octets. Round-tripping through the
 * byte-string codec produces exactly that shape.
 */
function asTlvOctetString(bytes) {
    return TlvAny.decodeTlv(TlvByteString.encodeTlv(new Uint8Array(bytes)));
}

function toBytes(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (Array.isArray(value?.data)) return Uint8Array.from(value.data);
    if (Array.isArray(value)) return Uint8Array.from(value);
    return undefined;
}

function describe(bytes) {
    const mood = decodeMood(bytes);
    const lines = [
        `  roh          ${Buffer.from(bytes).toString("hex")}  (${bytes.length} Byte)`,
        `  Modus        ${mood.mode}  ${MOOD_MODE_IDS.includes(mood.mode) ? translate("de", `moodMode.${mood.mode}`) : "(unbekannt)"}`,
        `  Tempo        ${mood.speed} %`,
        `  Segmentiert  ${mood.segmented ? "ja" : "nein"}`,
        `  Richtung     ${mood.topDown ? "oben nach unten" : "unten nach oben"}`,
        `  Helligkeit   ${mood.brightness} %  (gilt für die ganze Stimmung)`,
        `  Farben       ${mood.colors.length}`,
    ];
    mood.colors.forEach((c, i) =>
        lines.push(`     ${i + 1}.  H=${String(c.hue).padStart(3)}°  S=${String(c.saturation).padStart(3)} %`),
    );
    return { mood, text: lines.join("\n") };
}

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

    // Endpoint state is restored from storage before the subscription refreshes it, so reading
    // straight after start would decode the previous session's mood.
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

    const current = toBytes(endpoint.state[MOOD_CLUSTER][MOOD_ATTRIBUTE]);
    if (!current?.length) throw new Error(`${MOOD_ATTRIBUTE} ist leer — erst eine Stimmung einschalten`);

    console.log(`\n=== ${peerId} · aktuell ===`);
    const { mood, text } = describe(current);
    console.log(text);

    if (!flag("write")) {
        console.log("\n(nur gelesen — --write zum Schreiben)");
    } else {
        const raw = value("raw");
        const next = raw
            ? Uint8Array.from(Buffer.from(raw.replace(/[\s-]/g, ""), "hex"))
            : encodeMood({
                  ...mood,
                  mode: value("mode") !== undefined ? Number(value("mode")) : mood.mode,
                  speed: value("speed") !== undefined ? Number(value("speed")) : mood.speed,
                  brightness:
                      value("brightness") !== undefined ? Number(value("brightness")) : mood.brightness,
                  segmented: value("segmented") !== undefined ? value("segmented") === "1" : mood.segmented,
                  topDown: value("topdown") !== undefined ? value("topdown") === "1" : mood.topDown,
                  colors: value("colors")
                      ? value("colors")
                            .split(",")
                            .map(spec => {
                                const [h, v = "100"] = spec.split(":");
                                return { hue: Number(h), saturation: Number(v) };
                            })
                      : mood.colors,
              });

        console.log("\n=== schreibe ===");
        console.log(describe(next).text);

        await endpoint.setStateOf(MOOD_CLUSTER, { [MOOD_ATTRIBUTE]: asTlvOctetString(next) });
        console.log("\n[ok] Schreibvorgang angenommen");

        await new Promise(r => setTimeout(r, 2500));
        const after = toBytes(endpoint.state[MOOD_CLUSTER][MOOD_ATTRIBUTE]);
        const same = after && Buffer.from(after).equals(Buffer.from(next));
        console.log(`\n=== Rücklesung ===\n  ${Buffer.from(after ?? []).toString("hex")}`);
        console.log(same ? "  [ok] Gerät meldet exakt das Geschriebene zurück" : "  [!] Gerät meldet etwas anderes");
    }
} catch (e) {
    console.error(`\n[x] ${e?.message ?? e}`);
    if (process.env.MATTER_TRACE) console.error(e);
} finally {
    await node.close();
}

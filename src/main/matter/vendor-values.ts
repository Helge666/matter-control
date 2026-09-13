/**
 * Reading and writing attributes of the manufacturer cluster, which matter.js has no schema for.
 */

import { TlvAny, TlvByteString, type TlvStream, TlvUInt32 } from "@matter/types";

/**
 * A vendor attribute as matter.js caches it: a decoded value when it came in a report, or the
 * TLV element stream we wrote, when it came from our own write.
 *
 * The second shape is easy to miss. matter.js makes the written working value canonical on
 * commit, and for a cluster without a schema that value is the `TlvAny` stream from
 * {@link asTlvOctetString} / {@link asTlvUnsignedInt}. Until the lamp's next report replaces it,
 * reading the attribute returns `[{ typeLength, value }]` — which is why the mode switch lost its
 * highlight right after being clicked, and why a mood read back straight after writing one
 * came back empty.
 */
export function isTlvStream(raw: unknown): raw is TlvStream {
    return (
        Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && "typeLength" in raw[0]
    );
}

/** Normalize whatever shape matter.js hands back for an octet-string attribute. */
export function bytesOf(raw: unknown): Uint8Array | undefined {
    if (raw instanceof Uint8Array) return raw;
    if (isTlvStream(raw)) {
        try {
            return TlvByteString.decodeTlv(raw);
        } catch {
            return undefined;
        }
    }
    if (Array.isArray((raw as { data?: number[] })?.data)) {
        return Uint8Array.from((raw as { data: number[] }).data);
    }
    return undefined;
}

/** Normalize a numeric vendor attribute; see {@link isTlvStream} for why this is needed. */
export function vendorNumberOf(raw: unknown): number | undefined {
    if (isTlvStream(raw)) {
        try {
            return TlvUInt32.decodeTlv(raw);
        } catch {
            return undefined;
        }
    }
    if (typeof raw === "number") return raw;
    if (typeof raw === "bigint") return Number(raw);
    return undefined;
}

/**
 * matter.js has no schema for a manufacturer cluster, so it encodes writes through `TlvAny`,
 * which expects a parsed TLV element stream rather than raw octets. Round-tripping through the
 * byte-string codec produces exactly that shape; handing it a Uint8Array fails at commit time.
 */
export function asTlvOctetString(bytes: Uint8Array) {
    return TlvAny.decodeTlv(TlvByteString.encodeTlv(bytes));
}

/** Same reason as {@link asTlvOctetString}, for the numeric attributes of the cluster. */
export function asTlvUnsignedInt(value: number) {
    return TlvAny.decodeTlv(TlvUInt32.encodeTlv(value));
}

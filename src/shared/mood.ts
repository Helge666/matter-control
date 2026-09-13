/**
 * Codec for the Tuya dynamic-mood attribute: cluster 0x125DFC01, attribute 0x33, endpoint 1.
 *
 * No standard Matter cluster can express a moving light pattern, so these lamps carry a
 * manufacturer cluster for it. The layout below was derived by observation — changing one
 * control at a time in the vendor app and diffing the bytes — and then verified by writing
 * moods from here and watching the lamp obey. See docs/findings.md for the evidence.
 *
 *   [0]     01            version; constant across every capture
 *   [1]     ?             changes when a mood is saved; no observed effect
 *   [2]     mode          1-based index into the vendor app's mode list
 *   [3]     speed %       what the vendor app displays
 *   [4]     speed %       what the lamp actually follows; the app keeps both equal
 *   [5]     bit 7         splits the lamp into zones, where the mode leaves that a choice
 *   [5]     bit 4         direction: set means top-down, clear means bottom-up
 *   [5]     rest          unexplained; carried through untouched
 *   [6][7]  00 00         always zero
 *   [8]     brightness %  0-100, for the whole mood
 *   [9…]    N × { hue: uint16 BE 0-360, saturation: uint8 0-100 }
 *
 * A colour carries hue and saturation; brightness belongs to the mood as a whole. That is what
 * makes white reachable in a mood at all — no hue produces it, low saturation does. The second
 * byte was first read as a per-colour brightness; a lamp showing pale pink for hue 360 at 1 and
 * saturated red for the same hue at 98 settled it.
 */

export const MOOD_CLUSTER = "cluster$125dfc01";
export const MOOD_ATTRIBUTE = "attr$33";
/** Carries the operating mode in its lowest byte. */
export const MODE_ATTRIBUTE = "attr$2";

/**
 * Settings for the microphone mode.
 *
 * Byte 1 arms it: a lamp that had never run the mode reported mode 3 and stayed dark until this
 * was raised to 1. Byte 2 picks how the level is drawn — 0x00 flashes the whole lamp on a
 * transient without decaying, 0x02 behaves like a VU meter with a slow fallback. The device
 * resets byte 3 when byte 2 changes, so the two belong together.
 */
export const MIC_ATTRIBUTE = "attr$34";
export const MIC_ARMED_BYTE = 1;
export const MIC_PATTERN_BYTE = 2;
export const MIC_PATTERN_SUB_BYTE = 3;

/**
 * How the microphone mode draws the level.
 *
 * Four patterns, matching the four music keys on the lamp's infrared remote. Writing a fifth
 * value makes the device correct itself back to the first, which is how we know the list is
 * complete.
 *
 * Byte 3 belongs to byte 2 and has to be written with it: setting the pattern alone leaves the
 * display frozen on its last frame.
 *
 * Names and descriptions live with the other texts, under `micPattern.<id>`.
 */
export type MicPatternId = "transient" | "wave" | "vuMeter" | "beam";

export const MIC_PATTERNS: readonly { id: MicPatternId; value: number; sub: number }[] = [
    { id: "transient", value: 0x00, sub: 0x03 },
    { id: "wave", value: 0x01, sub: 0x00 },
    { id: "vuMeter", value: 0x02, sub: 0x00 },
    { id: "beam", value: 0x03, sub: 0x00 },
];

/**
 * What the lamp is currently doing.
 *
 * All four values were verified by writing them: the lamp switches immediately, and a mood
 * stored in {@link MOOD_ATTRIBUTE} survives a switch away and back.
 */
export type LampMode = "white" | "color" | "mood" | "microphone";

/** Names and descriptions live with the other texts, under `lampMode.<id>`. */
export const LAMP_MODES: readonly { id: LampMode; value: number }[] = [
    { id: "white", value: 0x00 },
    { id: "color", value: 0x01 },
    { id: "mood", value: 0x02 },
    { id: "microphone", value: 0x03 },
];

export function decodeLampMode(raw: unknown): LampMode | undefined {
    if (typeof raw !== "number") return undefined;
    return LAMP_MODES.find(m => m.value === (raw & 0xff))?.id;
}

/**
 * The value to write for a mode.
 *
 * The device reported 0x0100 for white and 0x0102 for a mood, so the byte above the mode is set
 * to 1 here as well. Writing that form switched the lamp reliably in every test.
 */
export function encodeLampMode(mode: LampMode): number {
    const entry = LAMP_MODES.find(m => m.id === mode);
    if (!entry) throw new Error(`Unknown lamp mode ${mode}`);
    return 0x0100 | entry.value;
}

/** The vendor app allows eight colours per mood. */
export const MAX_COLORS = 8;

/**
 * The movement modes, by the index the device stores.
 *
 * Names live with the other texts, under `moodMode.<id>`, as the vendor app lists them in each
 * language. Index 1 and 3 really do carry the same label there, in German and in English alike —
 * the duplicate is in the vendor's list, not a translation slip. They are kept apart by number,
 * which is what actually reaches the lamp.
 */
export const MOOD_MODE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

export type MoodModeId = (typeof MOOD_MODE_IDS)[number];

export interface MoodColor {
    /** Degrees, 0-360. */
    hue: number;
    /** Percent, 0-100, where 0 is white whatever the hue. Brightness is the mood's, not a colour's. */
    saturation: number;
}

export interface Mood {
    mode: number;
    /** Percent, 0-100. */
    speed: number;
    /** Percent, 0-100. */
    brightness: number;
    /**
     * Whether the lamp splits itself into zones rather than acting as one surface.
     *
     * How many zones appear is decided by the mode and the hardware, not by this flag or by the
     * length of {@link colors}: "Stapeln" lights 19 distinct zones on these lamps whether it is
     * given two colours or eight. The palette is distributed across whatever the mode uses.
     */
    segmented: boolean;
    /**
     * Run the movement top-down rather than bottom-up.
     *
     * The vendor app only offers this for modes where it means something — it appears as
     * "positiv / negativ" once "Stapeln" is selected.
     */
    topDown: boolean;
    colors: MoodColor[];
    /** Bytes and bits we do not interpret, preserved across a read/write round trip. */
    opaque?: { version: number; tag: number; flagBits: number };
}

const HEADER_BYTES = 9;
const COLOR_BYTES = 3;

/** Byte 5, bit 7: split the lamp into zones. Modes that are inherently spatial ignore it. */
const SEGMENTED_BIT = 0x80;
/** Byte 5, bit 4: run the movement top-down. Proven by reproducing it on the second lamp. */
const TOP_DOWN_BIT = 0x10;

function clamp(n: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function decodeMood(bytes: Uint8Array): Mood {
    if (bytes.length < HEADER_BYTES) {
        throw new Error(`Mood data too short: ${bytes.length} bytes`);
    }
    if ((bytes.length - HEADER_BYTES) % COLOR_BYTES !== 0) {
        throw new Error(`Length ${bytes.length} does not fit 9 + 3·N — unknown variant`);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const colors: MoodColor[] = [];
    for (let i = HEADER_BYTES; i < bytes.length; i += COLOR_BYTES) {
        colors.push({ hue: view.getUint16(i), saturation: bytes[i + 2] });
    }

    return {
        mode: bytes[2],
        // Byte 4 is the one the lamp follows, so that is the value worth reporting.
        speed: bytes[4],
        segmented: (bytes[5] & SEGMENTED_BIT) !== 0,
        topDown: (bytes[5] & TOP_DOWN_BIT) !== 0,
        brightness: bytes[8],
        colors,
        opaque: { version: bytes[0], tag: bytes[1], flagBits: bytes[5] & ~(SEGMENTED_BIT | TOP_DOWN_BIT) },
    };
}

export function encodeMood(mood: Mood): Uint8Array {
    if (!mood.colors.length) throw new Error("A mood needs at least one colour");
    if (mood.colors.length > MAX_COLORS) {
        throw new Error(`At most ${MAX_COLORS} colours, ${mood.colors.length} given`);
    }

    const bytes = new Uint8Array(HEADER_BYTES + mood.colors.length * COLOR_BYTES);
    const view = new DataView(bytes.buffer);
    const speed = clamp(mood.speed, 0, 100);

    bytes[0] = mood.opaque?.version ?? 1;
    bytes[1] = mood.opaque?.tag ?? 0;
    bytes[2] = clamp(mood.mode, 1, 16);
    // Write both speed bytes: the lamp follows [4], the vendor app shows [3], and keeping them
    // equal is what the app itself does.
    bytes[3] = speed;
    bytes[4] = speed;
    // Two bits of this byte are understood; the rest is carried through rather than invented.
    bytes[5] =
        (mood.segmented ? SEGMENTED_BIT : 0) |
        (mood.topDown ? TOP_DOWN_BIT : 0) |
        ((mood.opaque?.flagBits ?? 0) & ~(SEGMENTED_BIT | TOP_DOWN_BIT) & 0xff);
    bytes[6] = 0;
    bytes[7] = 0;
    bytes[8] = clamp(mood.brightness, 0, 100);

    mood.colors.forEach((color, i) => {
        const at = HEADER_BYTES + i * COLOR_BYTES;
        view.setUint16(at, clamp(color.hue, 0, 360));
        bytes[at + 2] = clamp(color.saturation, 0, 100);
    });

    return bytes;
}

/**
 * CSS colour for a mood entry, drawn at full brightness.
 *
 * The stored pair is HSV with V left to the mood, and at V = 1 the conversion to HSL is always
 * fully saturated with the lightness carrying the saturation: 0 % white, 100 % the pure hue.
 * Swatches ignore the mood's brightness on purpose, so a dimmed mood still shows its colours.
 */
export function moodColorCss(color: MoodColor): string {
    const s = clamp(color.saturation, 0, 100) / 100;
    return `hsl(${clamp(color.hue, 0, 360)} 100% ${(100 - s * 50).toFixed(1)}%)`;
}

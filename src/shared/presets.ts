/**
 * Named moods, stored so a favourite can be recalled onto any lamp.
 *
 * Two sources share one list. Factory presets ship with the app and are mirrored into the user's
 * file on every start, so corrections reach existing installations. Anything the user saves is
 * appended and stays untouched by updates.
 *
 * A preset deliberately carries no device-specific bytes: the header fields we do not interpret
 * belong to the lamp that produced them, and applying a preset keeps the target lamp's own.
 */

import type { Mood, MoodColor } from "./mood.ts";

export interface MoodPreset {
    /** Stable across renames; what the dropdown and the file agree on. */
    id: string;
    name: string;
    /** Optional note — this is what a comment would be in a YAML file. */
    description?: string;
    /**
     * Shipped with the app or hand-marked in the file. The app never edits or deletes these,
     * which is what makes editing the file by hand safe.
     */
    factory?: boolean;
    mood: Omit<Mood, "opaque">;
}

export interface PresetFile {
    /** Bumped only if the shape ever changes, so an old file can still be read. */
    version: 1;
    moods: MoodPreset[];
}

export const PRESET_FILE_VERSION = 1;

/**
 * Presets that ship with the app.
 *
 * Built by hand on the lamps and copied out of moods.json, which is the intended way to extend
 * this list. The store marks every entry as factory and mirrors it into the user's file on each
 * start, so an entry corrected here reaches existing installations. Removing an entry here does
 * not remove it from files that already contain it.
 *
 * Saturation 1 rather than 0 in the white entries is how they were tuned; the difference is not
 * visible on the lamp.
 */
export const FACTORY_PRESETS: MoodPreset[] = [
    {
        id: "travel-tubes-down",
        name: "Travel Tubes Down",
        mood: {
            mode: 9, // Flutter
            speed: 0,
            brightness: 100,
            segmented: true,
            topDown: true,
            colors: [{ hue: 0, saturation: 1 }, { hue: 230, saturation: 100 }],
        },
    },
    {
        id: "travel-tubes-up",
        name: "Travel Tubes Up",
        mood: {
            mode: 9, // Flutter
            speed: 0,
            brightness: 100,
            segmented: true,
            topDown: false,
            colors: [{ hue: 0, saturation: 1 }, { hue: 230, saturation: 100 }],
        },
    },
    {
        id: "luke-vs-vader",
        name: "Luke vs. Vader",
        mood: {
            mode: 15, // Random
            speed: 29,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 0, saturation: 1 },
                { hue: 117, saturation: 100 },
                { hue: 117, saturation: 100 },
                { hue: 117, saturation: 100 },
                { hue: 0, saturation: 100 },
                { hue: 0, saturation: 100 },
                { hue: 0, saturation: 100 },
            ],
        },
    },
    {
        id: "tetris",
        name: "Tetris",
        mood: {
            mode: 6, // PileUp
            speed: 5,
            brightness: 100,
            segmented: true,
            topDown: true,
            colors: [
                { hue: 0, saturation: 100 },
                { hue: 105, saturation: 100 },
                { hue: 220, saturation: 100 },
                { hue: 0, saturation: 1 },
                { hue: 35, saturation: 100 },
                { hue: 60, saturation: 100 },
                { hue: 315, saturation: 100 },
            ],
        },
    },
    {
        id: "red-alert",
        name: "Red Alert",
        mood: {
            mode: 4, // Blink
            speed: 80,
            brightness: 100,
            segmented: false,
            topDown: true,
            colors: [{ hue: 0, saturation: 100 }],
        },
    },
    {
        id: "slawa-ukrajini",
        name: "Slawa Ukrajini",
        mood: {
            mode: 8, // Follow
            speed: 50,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 240, saturation: 100 }, { hue: 60, saturation: 100 }],
        },
    },
    {
        id: "lab-light-on",
        name: "Lab Light On",
        mood: {
            mode: 12, // Flash
            speed: 10,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 0, saturation: 1 }],
        },
    },
    {
        id: "protomolecule",
        name: "Protomolecule",
        mood: {
            mode: 3, // Gradient (B)
            speed: 55,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 240, saturation: 100 }],
        },
    },
    {
        id: "eye-of-aldhani",
        name: "Eye of Aldhani",
        mood: {
            mode: 5, // Meteor
            speed: 5,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 99, saturation: 100 },
                { hue: 209, saturation: 100 },
                { hue: 277, saturation: 100 },
                { hue: 203, saturation: 43 },
                { hue: 327, saturation: 77 },
                { hue: 229, saturation: 100 },
                { hue: 0, saturation: 1 },
                { hue: 60, saturation: 63 },
            ],
        },
    },
    {
        id: "synthwave",
        name: "Synthwave",
        mood: {
            mode: 4, // Blink
            speed: 90,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 130, saturation: 100 },
                { hue: 290, saturation: 100 },
                { hue: 240, saturation: 100 },
            ],
        },
    },
    {
        id: "epilepsy",
        name: "Epilepsy",
        mood: {
            mode: 15, // Random
            speed: 100,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 130, saturation: 100 },
                { hue: 290, saturation: 100 },
                { hue: 240, saturation: 100 },
                { hue: 200, saturation: 100 },
                { hue: 360, saturation: 100 },
                { hue: 60, saturation: 100 },
                { hue: 360, saturation: 1 },
                { hue: 30, saturation: 100 },
            ],
        },
    },
    {
        id: "wine-gums-up",
        name: "Wine Gums Up",
        mood: {
            mode: 10, // Flow
            speed: 50,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 130, saturation: 100 },
                { hue: 240, saturation: 100 },
                { hue: 360, saturation: 100 },
                { hue: 60, saturation: 100 },
                { hue: 360, saturation: 1 },
                { hue: 30, saturation: 100 },
            ],
        },
    },
    {
        id: "wine-gums-down",
        name: "Wine Gums Down",
        mood: {
            mode: 10, // Flow
            speed: 50,
            brightness: 100,
            segmented: false,
            topDown: true,
            colors: [
                { hue: 130, saturation: 100 },
                { hue: 240, saturation: 100 },
                { hue: 360, saturation: 100 },
                { hue: 60, saturation: 100 },
                { hue: 360, saturation: 1 },
                { hue: 30, saturation: 100 },
            ],
        },
    },
    {
        id: "space-lift",
        name: "Space Lift",
        mood: {
            mode: 11, // Rainbow
            speed: 10,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 240, saturation: 100 }, { hue: 200, saturation: 100 }],
        },
    },
    {
        id: "red-team-blue-team",
        name: "Red Team, Blue Team",
        mood: {
            mode: 14, // Shuttle
            speed: 50,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 0, saturation: 100 }, { hue: 240, saturation: 100 }],
        },
    },
    {
        id: "cylon-knight-rider",
        name: "Cylon Knight Rider",
        mood: {
            mode: 13, // Rebound
            speed: 10,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 0, saturation: 100 }],
        },
    },
    {
        id: "but-can-it-rgb",
        name: "But Can it RGB?",
        mood: {
            mode: 2, // Jump
            speed: 80,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 360, saturation: 100 },
                { hue: 108, saturation: 100 },
                { hue: 240, saturation: 100 },
            ],
        },
    },
    {
        id: "white-wedding",
        name: "White Wedding",
        mood: {
            mode: 1, // Gradient (A)
            speed: 70,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 360, saturation: 1 }, { hue: 360, saturation: 10 }],
        },
    },
    {
        id: "mint-condition",
        name: "Mint Condition",
        mood: {
            mode: 10, // Flow
            speed: 10,
            brightness: 100,
            segmented: false,
            topDown: false,
            colors: [{ hue: 190, saturation: 100 }, { hue: 190, saturation: 80 }],
        },
    },
    {
        id: "the-martian",
        name: "The Martian",
        mood: {
            mode: 11, // Rainbow
            speed: 5,
            brightness: 50,
            segmented: false,
            topDown: false,
            colors: [
                { hue: 25, saturation: 100 },
                { hue: 30, saturation: 80 },
                { hue: 5, saturation: 100 },
            ],
        },
    },
];

/** A filename-safe, readable id derived from the name, made unique against {@link taken}. */
export function presetId(name: string, taken: Iterable<string> = []): string {
    const base =
        name
            .toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48) || "mood";

    const used = new Set(taken);
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!used.has(candidate)) return candidate;
    }
}

/**
 * Read a preset from the file, accepting the field name used before saturation was understood.
 *
 * Files written by 0.1.4 call the second colour field "value" and mean the same byte. Translating
 * on load keeps an existing or hand-edited moods.json working; the file is rewritten under the
 * current name the next time anything is saved.
 */
export function normalizePreset(preset: MoodPreset): MoodPreset {
    const colors = (preset.mood?.colors ?? []).map(color => {
        const legacy = (color as MoodColor & { value?: number }).value;
        return {
            hue: Number(color.hue) || 0,
            saturation: Number(color.saturation ?? legacy ?? 100),
        };
    });
    return { ...preset, mood: { ...preset.mood, colors } };
}

/**
 * The preset a lamp is currently running, if its mood matches one exactly.
 *
 * Lets the editor show the name again after it was closed or the app restarted, and recognise a
 * preset applied from the other lamp. A mood edited after applying no longer matches, which is
 * the honest answer.
 */
export function findPreset(presets: readonly MoodPreset[], mood: Mood | undefined): MoodPreset | undefined {
    if (!mood) return undefined;
    const running = toPresetMood(mood);
    return presets.find(({ mood: p }) =>
        p.mode === running.mode &&
        p.speed === running.speed &&
        p.brightness === running.brightness &&
        p.segmented === running.segmented &&
        p.topDown === running.topDown &&
        p.colors.length === running.colors.length &&
        p.colors.every((c, i) => c.hue === running.colors[i].hue && c.saturation === running.colors[i].saturation),
    );
}

/** Strip the device-specific header bytes so a preset applies cleanly to any lamp. */
export function toPresetMood(mood: Mood): Omit<Mood, "opaque"> {
    return {
        mode: mood.mode,
        speed: mood.speed,
        brightness: mood.brightness,
        segmented: mood.segmented,
        topDown: mood.topDown,
        colors: mood.colors.map(c => ({ hue: c.hue, saturation: c.saturation })),
    };
}

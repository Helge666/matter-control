import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    FACTORY_PRESETS,
    type MoodPreset,
    PRESET_FILE_VERSION,
    type PresetFile,
    normalizePreset,
} from "../shared/presets";
import { t } from "./i18n";

/**
 * The named moods, in a file meant to be opened in an editor.
 *
 * Written with indentation and stable key order so a hand edit produces a small, readable diff.
 * Factory entries are mirrored in from the app on every load: that way a corrected factory preset
 * reaches an existing installation, while everything the user saved stays exactly as it was.
 */
export class PresetStore {
    #file: string;
    #presets: MoodPreset[] = [];

    constructor(private readonly dataDir: string) {
        this.#file = join(dataDir, "moods.json");
        this.#presets = this.#load();
    }

    get all(): MoodPreset[] {
        return this.#presets;
    }

    #load(): MoodPreset[] {
        let stored: MoodPreset[] = [];
        try {
            const parsed = JSON.parse(readFileSync(this.#file, "utf8")) as Partial<PresetFile>;
            if (Array.isArray(parsed.moods)) {
                stored = parsed.moods
                    .filter(p => p && typeof p.id === "string" && p.mood)
                    .map(normalizePreset);
            }
        } catch {
            // No file yet, or someone left it unparseable. Starting from the factory list is
            // better than refusing to run, and the file is rewritten only on the next save.
        }

        // Factory entries win on id; user entries keep their place after them.
        const factoryIds = new Set(FACTORY_PRESETS.map(p => p.id));
        const userEntries = stored.filter(p => !factoryIds.has(p.id));
        return [...FACTORY_PRESETS.map(p => ({ ...p, factory: true as const })), ...userEntries];
    }

    #save() {
        try {
            mkdirSync(this.dataDir, { recursive: true });
            const file: PresetFile = { version: PRESET_FILE_VERSION, moods: this.#presets };
            writeFileSync(this.#file, `${JSON.stringify(file, undefined, 2)}\n`);
        } catch (e) {
            console.error("Could not save moods:", e);
        }
    }

    /** Add a preset, or replace one the user saved before under the same id. */
    save(preset: MoodPreset): MoodPreset[] {
        if (this.#presets.some(p => p.id === preset.id && p.factory)) {
            throw new Error(t("error.presetFactoryOverwrite", { name: preset.name }));
        }
        const index = this.#presets.findIndex(p => p.id === preset.id);
        if (index >= 0) this.#presets[index] = { ...preset, factory: false };
        else this.#presets.push({ ...preset, factory: false });
        this.#save();
        return this.#presets;
    }

    remove(id: string): MoodPreset[] {
        const preset = this.#presets.find(p => p.id === id);
        if (!preset) return this.#presets;
        if (preset.factory) {
            throw new Error(t("error.presetFactoryDelete", { name: preset.name }));
        }
        this.#presets = this.#presets.filter(p => p.id !== id);
        this.#save();
        return this.#presets;
    }

    /** Where the file is, so the UI can point at it for hand editing. */
    get path(): string {
        return this.#file;
    }
}

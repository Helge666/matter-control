import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SCHEDULE } from "../shared/schedule";
import type { AppSettings } from "../shared/types";

export type { AppSettings };

const DEFAULTS: AppSettings = {
    autostart: false,
    startHidden: true,
    schedule: DEFAULT_SCHEDULE,
    language: "system",
};

/**
 * Settings live next to the fabric rather than in Electron's own store, so everything this app
 * knows about a household sits in one directory that can be backed up or deleted as a unit.
 */
export class SettingsStore {
    #file: string;
    #value: AppSettings;

    constructor(private readonly dataDir: string) {
        this.#file = join(dataDir, "settings.json");
        this.#value = this.#load();
    }

    get value(): AppSettings {
        return this.#value;
    }

    #load(): AppSettings {
        try {
            const parsed = JSON.parse(readFileSync(this.#file, "utf8")) as Partial<AppSettings>;
            return {
                ...DEFAULTS,
                ...parsed,
                schedule: { ...DEFAULTS.schedule, ...(parsed.schedule ?? {}) },
            };
        } catch {
            return { ...DEFAULTS, schedule: { ...DEFAULTS.schedule } };
        }
    }

    update(patch: Partial<AppSettings>): AppSettings {
        this.#value = {
            ...this.#value,
            ...patch,
            schedule: { ...this.#value.schedule, ...(patch.schedule ?? {}) },
        };
        this.#save();
        this.#applyAutostart();
        return this.#value;
    }

    #save() {
        try {
            mkdirSync(this.dataDir, { recursive: true });
            writeFileSync(this.#file, JSON.stringify(this.#value, undefined, 2));
        } catch (e) {
            console.error("Could not save settings:", e);
        }
    }

    /** Register or remove the Windows login item to match {@link AppSettings.autostart}. */
    #applyAutostart() {
        if (!app.isPackaged) return; // A dev run would register the Electron binary itself.
        app.setLoginItemSettings({
            openAtLogin: this.#value.autostart,
            args: this.#value.startHidden ? ["--hidden"] : [],
        });
    }

    /** Bring the login item in line with the stored setting at startup. */
    syncAutostart() {
        this.#applyAutostart();
    }
}

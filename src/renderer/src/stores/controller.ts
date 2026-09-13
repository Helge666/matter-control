import type { LampMode, Mood } from "@shared/mood";
import type { MoodPreset } from "@shared/presets";
import type { AppSettings, CommissionableDevice, ControllerStatus, DeviceState, LogEntry } from "@shared/types";
import { computed, reactive, readonly } from "vue";
import { setLanguagePreference, t } from "../i18n";
import { api } from "../lib/api";

interface State {
    status: ControllerStatus;
    devices: DeviceState[];
    logs: LogEntry[];
    candidates: CommissionableDevice[];
    scanning: boolean;
    commissioning: boolean;
    commissionStage: string;
    lastError: string;
    ready: boolean;
    settings?: AppSettings;
    presets: MoodPreset[];
}

const state = reactive<State>({
    status: { phase: "starting", fabricLabel: "", dataDir: "", version: "" },
    devices: [],
    logs: [],
    candidates: [],
    scanning: false,
    commissioning: false,
    commissionStage: "",
    lastError: "",
    ready: false,
    presets: [],
});

function upsert(device: DeviceState) {
    const i = state.devices.findIndex(d => d.id === device.id);
    if (i >= 0) state.devices[i] = device;
    else state.devices.push(device);
}

api.onEvent(event => {
    switch (event.type) {
        case "status":
            state.status = event.status;
            break;
        case "devices":
            state.devices = event.devices;
            break;
        case "device":
            upsert(event.device);
            break;
        case "log":
            state.logs.push(event.entry);
            if (state.logs.length > 2000) state.logs.splice(0, state.logs.length - 2000);
            break;
        case "commissioning":
            state.commissionStage = event.stage;
            break;
    }
});

export const controller = {
    state: readonly(state) as Readonly<State>,

    /** Devices that expose at least one controllable endpoint. */
    controllable: computed(() =>
        state.devices.filter(d => d.endpoints.some(e => Object.values(e.capabilities).some(Boolean))),
    ),

    /**
     * Load what the main process already knows.
     *
     * Each call stands on its own: a single failure used to reject the whole batch and leave the
     * window blank with nothing assigned, which looked exactly like "no devices found".
     */
    async init() {
        const [status, devices, logs, settings, presets] = await Promise.allSettled([
            api.getStatus(),
            api.listDevices(),
            api.getLogs(),
            api.getSettings(),
            api.listPresets(),
        ]);

        if (status.status === "fulfilled") state.status = status.value;
        if (devices.status === "fulfilled") state.devices = devices.value;
        if (logs.status === "fulfilled") state.logs = logs.value;
        if (settings.status === "fulfilled") {
            state.settings = settings.value;
            setLanguagePreference(settings.value.language);
        }
        if (presets.status === "fulfilled") state.presets = presets.value;

        const failed = [status, devices, logs, settings, presets].filter(r => r.status === "rejected");
        if (failed.length) {
            state.lastError = t("error.loadFailed", {
                count: failed.length,
                message: message((failed[0] as PromiseRejectedResult).reason),
            });
        }
        state.ready = true;
    },

    async scan(seconds = 10) {
        state.scanning = true;
        state.lastError = "";
        state.candidates = [];
        try {
            state.candidates = await api.discover(seconds);
        } catch (e) {
            state.lastError = message(e);
        } finally {
            state.scanning = false;
        }
    },

    async commission(pairingCode: string, label?: string, wifi?: { ssid: string; password: string }) {
        state.commissioning = true;
        state.lastError = "";
        state.commissionStage = "starting";
        try {
            const device = await api.commission({
                pairingCode,
                label,
                wifiSsid: wifi?.ssid,
                wifiPassword: wifi?.password,
            });
            upsert(device);
            return device;
        } catch (e) {
            state.lastError = message(e);
            throw e;
        } finally {
            state.commissioning = false;
            state.commissionStage = "";
        }
    },

    async forget(id: string) {
        await api.forget(id);
        state.devices = state.devices.filter(d => d.id !== id);
    },

    async rename(id: string, name: string) {
        await api.rename(id, name);
    },

    async refresh(id: string) {
        const device = await api.refresh(id);
        if (device) upsert(device);
    },

    async setOnOff(id: string, endpoint: number, on: boolean) {
        optimistic(id, endpoint, ep => (ep.onOff = on));
        await guard(() => api.setOnOff(id, endpoint, on));
    },

    setLevel(id: string, endpoint: number, level: number) {
        optimistic(id, endpoint, ep => {
            ep.level = level;
            ep.onOff = true;
        });
        sendLatest(`${id}:${endpoint}:level`, () => api.setLevel(id, endpoint, level));
    },

    setColorTemperature(id: string, endpoint: number, mireds: number) {
        optimistic(id, endpoint, ep => (ep.colorTemperatureMireds = mireds));
        sendLatest(`${id}:${endpoint}:ct`, () => api.setColorTemperature(id, endpoint, mireds));
    },

    setHueSaturation(id: string, endpoint: number, hue: number, saturation: number) {
        optimistic(id, endpoint, ep => {
            ep.hue = hue;
            ep.saturation = saturation;
        });
        sendLatest(`${id}:${endpoint}:hue`, () => api.setHueSaturation(id, endpoint, hue, saturation));
    },

    async identify(id: string, endpoint: number) {
        await guard(() => api.identify(id, endpoint, 10));
    },

    readMood(id: string, endpoint: number) {
        return api.readMood(id, endpoint);
    },

    async setLampMode(id: string, endpoint: number, mode: LampMode) {
        optimistic(id, endpoint, ep => (ep.lampMode = mode));
        await guard(() => api.setLampMode(id, endpoint, mode));
    },

    async setMicPattern(id: string, endpoint: number, pattern: number) {
        optimistic(id, endpoint, ep => (ep.micPattern = pattern));
        await guard(() => api.setMicPattern(id, endpoint, pattern));
    },

    /** Rate-limited like the other controls: the editor writes on every slider move. */
    writeMood(id: string, endpoint: number, mood: Mood) {
        const payload = plain(mood);
        sendLatest(`${id}:${endpoint}:mood`, () => api.writeMood(id, endpoint, payload));
    },

    async clearLogs() {
        await api.clearLogs();
        state.logs = [];
    },

    async savePreset(name: string, mood: Mood) {
        try {
            state.presets = await api.savePreset(name, plain(mood));
        } catch (e) {
            state.lastError = message(e);
        }
    },

    async deletePreset(id: string) {
        try {
            state.presets = await api.deletePreset(id);
        } catch (e) {
            state.lastError = message(e);
        }
    },

    openDataDir: () => api.openDataDir(),

    async updateSettings(patch: Partial<AppSettings>) {
        // Switch the window's language at once rather than after the round trip.
        if (patch.language) setLanguagePreference(patch.language);
        try {
            state.settings = await api.updateSettings(plain(patch));
            setLanguagePreference(state.settings.language);
        } catch (e) {
            state.lastError = message(e);
        }
    },

    dismissError() {
        state.lastError = "";
    },
};

/**
 * Rate-limited, latest-wins sender: one command per control at a time, at most one every
 * {@link MIN_INTERVAL_MS}, and the newest value always gets delivered.
 *
 * Sliders emit on every pointer move so the lamp tracks the finger. Waiting only for the
 * previous round trip is not enough of a brake: a lamp answers in ~15ms, which let bursts of
 * 77 commands per second through. At that rate every MoveToLevel restarts the lamp's ramp
 * before it has travelled anywhere, so brightness appears frozen, and the device eventually
 * stops answering altogether ("Channel is closed").
 *
 * Roughly eight commands per second per control is smooth to the eye and calm on the wire.
 * The trailing edge guarantees the value the user let go on is the one that lands.
 */
const MIN_INTERVAL_MS = 120;

interface SendSlot {
    busy: boolean;
    lastSentAt: number;
    pending?: () => Promise<unknown>;
    timer?: ReturnType<typeof setTimeout>;
}

const sendSlots = new Map<string, SendSlot>();

function sendLatest(key: string, run: () => Promise<unknown>): void {
    let slot = sendSlots.get(key);
    if (!slot) {
        slot = { busy: false, lastSentAt: 0 };
        sendSlots.set(key, slot);
    }
    slot.pending = run;
    scheduleSend(key, slot);
}

function scheduleSend(key: string, slot: SendSlot): void {
    if (slot.busy || slot.timer !== undefined || !slot.pending) return;
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - slot.lastSentAt));
    slot.timer = setTimeout(() => {
        slot.timer = undefined;
        void fireSend(key, slot);
    }, wait);
}

async function fireSend(key: string, slot: SendSlot): Promise<void> {
    const run = slot.pending;
    if (!run) return;
    slot.pending = undefined;
    slot.busy = true;
    slot.lastSentAt = Date.now();
    try {
        await guard(run);
    } finally {
        slot.busy = false;
        slot.lastSentAt = Date.now();
        scheduleSend(key, slot);
    }
}

/**
 * Strip Vue's reactive proxies before anything crosses the IPC boundary.
 *
 * Structured clone rejects a Proxy with "An object could not be cloned", and a spread copy only
 * unwraps the top level — nested objects and arrays stay reactive. Doing this once here, at the
 * boundary, keeps every caller from having to remember it.
 */
function plain<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/** Apply a control change locally so the UI responds instantly; the device confirms via events. */
function optimistic(id: string, endpoint: number, mutate: (ep: DeviceState["endpoints"][number]) => void) {
    const ep = state.devices.find(d => d.id === id)?.endpoints.find(e => e.number === endpoint);
    if (ep) mutate(ep);
}

async function guard(fn: () => Promise<unknown>) {
    try {
        await fn();
    } catch (e) {
        state.lastError = message(e);
    }
}

function message(e: unknown): string {
    if (e instanceof Error) {
        // Electron wraps main-process errors; strip the IPC prefix for readability.
        return e.message.replace(/^Error invoking remote method '[^']+':\s*/, "");
    }
    return String(e);
}

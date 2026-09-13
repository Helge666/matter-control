/** Contract between the Electron main process (matter.js) and the Vue renderer. */

import type { LampMode, Mood } from "./mood";
import type { LanguagePreference } from "./i18n";
import type { MoodPreset } from "./presets";
import type { Schedule } from "./schedule";

export type ControllerPhase = "starting" | "online" | "offline" | "error";

export interface ControllerStatus {
    phase: ControllerPhase;
    /** Our fabric's admin label, as written to every commissioned device. */
    fabricLabel: string;
    /** Where fabric keys and the device registry live on disk. */
    dataDir: string;
    /** Shown in the title bar so the running build is always visible. */
    version: string;
    error?: string;
}

/** What an endpoint can actually be driven with. */
export interface EndpointCapabilities {
    onOff: boolean;
    level: boolean;
    colorTemperature: boolean;
    colorHueSat: boolean;
    /** The manufacturer cluster that carries dynamic moods is present on this endpoint. */
    mood: boolean;
}

export interface EndpointState {
    number: number;
    /** What the lamp is doing, for devices with the vendor cluster. */
    lampMode?: LampMode;
    /** How the microphone mode draws the level; see MIC_PATTERNS. */
    micPattern?: number;
    /** Human-readable device type, e.g. "Extended Color Light". */
    deviceType?: string;
    capabilities: EndpointCapabilities;
    onOff?: boolean;
    /** 0-254 as defined by LevelControl. */
    level?: number;
    /** Mireds; lower is cooler. */
    colorTemperatureMireds?: number;
    colorTempMinMireds?: number;
    colorTempMaxMireds?: number;
    hue?: number;
    saturation?: number;
}

export interface DeviceState {
    /** Stable local id assigned by matter.js (e.g. "peer1"). */
    id: string;
    /** Operational node id, hex formatted. */
    nodeId: string;
    /** User-assigned label, falls back to the advertised product name. */
    name: string;
    vendorName?: string;
    productName?: string;
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
    softwareVersion?: string;
    online: boolean;
    /** Last known operational addresses, formatted for display. */
    addresses: string[];
    endpoints: EndpointState[];
}

export interface CommissionableDevice {
    id: string;
    name?: string;
    vendorId?: number;
    productId?: number;
    discriminator?: number;
    commissioningMode?: number;
    addresses: string[];
    /** Textual hint from the device on how to put it into pairing mode. */
    pairingInstructions?: string;
}

/** Everything the app remembers about itself, as opposed to about the devices. */
export interface AppSettings {
    autostart: boolean;
    startHidden: boolean;
    schedule: Schedule;
    language: LanguagePreference;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
    id: number;
    at: number;
    level: LogLevel;
    facility: string;
    message: string;
}

export interface CommissionRequest {
    pairingCode: string;
    label?: string;
    /** Only needed for a device that is not yet on the network (BLE path). */
    wifiSsid?: string;
    wifiPassword?: string;
}

/** Everything the renderer may call. Mirrored by the preload bridge. */
export interface MatterApi {
    getStatus(): Promise<ControllerStatus>;
    listDevices(): Promise<DeviceState[]>;
    discover(seconds: number): Promise<CommissionableDevice[]>;
    commission(request: CommissionRequest): Promise<DeviceState>;
    forget(id: string): Promise<void>;
    rename(id: string, name: string): Promise<void>;
    refresh(id: string): Promise<DeviceState | undefined>;
    setOnOff(id: string, endpoint: number, on: boolean): Promise<void>;
    setLevel(id: string, endpoint: number, level: number): Promise<void>;
    setColorTemperature(id: string, endpoint: number, mireds: number): Promise<void>;
    setHueSaturation(id: string, endpoint: number, hue: number, saturation: number): Promise<void>;
    identify(id: string, endpoint: number, seconds: number): Promise<void>;
    /** Reads the dynamic mood, or undefined when no mood is active on the device. */
    readMood(id: string, endpoint: number): Promise<Mood | undefined>;
    writeMood(id: string, endpoint: number, mood: Mood): Promise<Mood>;
    setLampMode(id: string, endpoint: number, mode: LampMode): Promise<void>;
    setMicPattern(id: string, endpoint: number, pattern: number): Promise<void>;
    getLogs(): Promise<LogEntry[]>;
    clearLogs(): Promise<void>;
    openDataDir(): Promise<void>;
    getSettings(): Promise<AppSettings>;
    updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
    listPresets(): Promise<MoodPreset[]>;
    savePreset(name: string, mood: Mood, description?: string): Promise<MoodPreset[]>;
    deletePreset(id: string): Promise<MoodPreset[]>;
    /** Push channel. Returns an unsubscribe function. */
    onEvent(handler: (event: MatterEvent) => void): () => void;
}

export type MatterEvent =
    | { type: "status"; status: ControllerStatus }
    | { type: "devices"; devices: DeviceState[] }
    | { type: "device"; device: DeviceState }
    | { type: "log"; entry: LogEntry }
    | { type: "commissioning"; stage: string; detail?: string };

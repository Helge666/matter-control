import type { LampMode, Mood } from "@shared/mood";
import { t } from "../i18n";
import type { MoodPreset } from "@shared/presets";
import { DEFAULT_SCHEDULE } from "@shared/schedule";
import type { AppSettings } from "@shared/types";
import type { CommissionableDevice, DeviceState, LogEntry, MatterApi, MatterEvent } from "@shared/types";

declare global {
    interface Window {
        matter?: MatterApi;
    }
}

export const isElectron = typeof window !== "undefined" && Boolean(window.matter);

/**
 * Demo backend used when the renderer runs in a plain browser (`vite` without Electron).
 *
 * It exists so the UI can be developed and reviewed without a live Matter fabric. It is never
 * reachable in the packaged app, where the preload bridge provides `window.matter`.
 */
function createDemoApi(): MatterApi {
    const listeners = new Set<(e: MatterEvent) => void>();
    const emit = (e: MatterEvent) => listeners.forEach(l => l(e));

    let logId = 0;
    const logs: LogEntry[] = [
        ["info", "ServerNodeStore", "Opened controller storage driver: file"],
        ["info", "Node", "controller is online"],
        ["info", "CertificateAuthority", "Loaded credentials with ID 0"],
        ["info", "Discovery", "Initiating discovery of node discovery"],
    ].map(([level, facility, message]) => ({
        id: ++logId,
        at: Date.now() - (4 - logId) * 1400,
        level: level as LogEntry["level"],
        facility: facility as string,
        message: message as string,
    }));

    let demoPresets: MoodPreset[] = [
        {
            id: "abendrot",
            name: "Abendrot",
            factory: true,
            mood: {
                mode: 3,
                speed: 30,
                brightness: 100,
                segmented: true,
                topDown: false,
                colors: [
                    { hue: 10, saturation: 100 },
                    { hue: 35, saturation: 90 },
                    { hue: 330, saturation: 70 },
                ],
            },
        },
    ];

    let demoSettings: AppSettings = {
        autostart: false,
        startHidden: true,
        schedule: { ...DEFAULT_SCHEDULE, enabled: true },
        language: "system",
    };

    let demoMood: Mood = {
        mode: 2,
        speed: 35,
        brightness: 100,
        segmented: true,
        topDown: false,
        colors: [
            { hue: 0, saturation: 100 },
            { hue: 120, saturation: 100 },
            { hue: 240, saturation: 100 },
            { hue: 60, saturation: 100 },
        ],
    };

    const devices: DeviceState[] = [
        {
            id: "peer1",
            nodeId: "0x1F2A",
            name: "Wohnzimmer Stehlampe",
            vendorName: "LEDVANCE",
            productName: "SMART+ Classic A60",
            vendorId: 0x1189,
            productId: 0x0201,
            serialNumber: "D8C80C3CEEC6",
            softwareVersion: "1.4.2",
            online: true,
            addresses: ["192.168.178.44:5540", "[fd00:b703:89f2::dac8:cff:fe3c:eec6]:5540"],
            endpoints: [
                { number: 0, capabilities: { onOff: false, level: false, colorTemperature: false, colorHueSat: false, mood: false } },
                {
                    number: 1,
                    deviceType: "Extended Color Light",
                    capabilities: { onOff: true, level: true, colorTemperature: true, colorHueSat: true, mood: true },
                    lampMode: "mood",
                    micPattern: 2,
                    onOff: true,
                    level: 203,
                    colorTemperatureMireds: 313,
                    colorTempMinMireds: 153,
                    colorTempMaxMireds: 500,
                    hue: 28,
                    saturation: 140,
                },
            ],
        },
        {
            id: "peer2",
            nodeId: "0x1F2B",
            name: "Flur Deckenlampe",
            vendorName: "LEDVANCE",
            productName: "SMART+ Classic A60",
            vendorId: 0x1189,
            productId: 0x0201,
            serialNumber: "D8C80C3CFBAB",
            softwareVersion: "1.4.2",
            online: true,
            addresses: ["192.168.178.46:5540"],
            endpoints: [
                { number: 0, capabilities: { onOff: false, level: false, colorTemperature: false, colorHueSat: false, mood: false } },
                {
                    number: 1,
                    deviceType: "Color Temperature Light",
                    capabilities: { onOff: true, level: true, colorTemperature: true, colorHueSat: false, mood: false },
                    onOff: false,
                    level: 96,
                    colorTemperatureMireds: 400,
                    colorTempMinMireds: 153,
                    colorTempMaxMireds: 500,
                },
            ],
        },
    ];

    const find = (id: string, endpoint: number) => devices.find(d => d.id === id)?.endpoints.find(e => e.number === endpoint);
    const push = (id: string) => {
        const device = devices.find(d => d.id === id);
        if (device) emit({ type: "device", device: structuredClone(device) });
    };

    const log = (message: string) => {
        const entry: LogEntry = { id: ++logId, at: Date.now(), level: "info", facility: "Demo", message };
        logs.push(entry);
        emit({ type: "log", entry });
    };

    return {
        getStatus: async () => ({
            phase: "online",
            fabricLabel: "matter-control (PC)",
            dataDir: "C:\\Users\\you\\AppData\\Roaming\\matter-control\\matter",
            version: "demo",
        }),
        listDevices: async () => structuredClone(devices),
        discover: async (seconds): Promise<CommissionableDevice[]> => {
            log(`Demo scan for ${seconds}s`);
            await new Promise(r => setTimeout(r, Math.min(seconds, 2) * 1000));
            return [
                {
                    id: "candidate1",
                    name: "LEDVANCE A60",
                    vendorId: 0x1189,
                    productId: 0x0201,
                    discriminator: 3840,
                    commissioningMode: 2,
                    addresses: ["192.168.178.44:5540"],
                    pairingInstructions: "Pairing window open",
                },
            ];
        },
        commission: async request => {
            log(`Demo commissioning with ${request.pairingCode}`);
            await new Promise(r => setTimeout(r, 1500));
            throw new Error(t("error.demoCommission"));
        },
        forget: async id => {
            const i = devices.findIndex(d => d.id === id);
            if (i >= 0) devices.splice(i, 1);
            emit({ type: "devices", devices: structuredClone(devices) });
        },
        rename: async (id, name) => {
            const device = devices.find(d => d.id === id);
            if (device) device.name = name;
            push(id);
        },
        refresh: async id => structuredClone(devices.find(d => d.id === id)),
        setOnOff: async (id, endpoint, on) => {
            const ep = find(id, endpoint);
            if (ep) ep.onOff = on;
            push(id);
        },
        setLevel: async (id, endpoint, level) => {
            const ep = find(id, endpoint);
            if (ep) {
                ep.level = level;
                ep.onOff = true;
            }
            push(id);
        },
        setColorTemperature: async (id, endpoint, mireds) => {
            const ep = find(id, endpoint);
            if (ep) ep.colorTemperatureMireds = mireds;
            push(id);
        },
        setHueSaturation: async (id, endpoint, hue, saturation) => {
            const ep = find(id, endpoint);
            if (ep) {
                ep.hue = hue;
                ep.saturation = saturation;
            }
            push(id);
        },
        identify: async (id, endpoint, seconds) => log(`Identify ${id}/${endpoint} for ${seconds}s`),
        setLampMode: async (id, endpoint, mode: LampMode) => {
            const ep = find(id, endpoint);
            if (ep) ep.lampMode = mode;
            push(id);
        },
        setMicPattern: async (id, endpoint, pattern) => {
            const ep = find(id, endpoint);
            if (ep) ep.micPattern = pattern;
            push(id);
        },
        readMood: async () => demoMood,
        writeMood: async (id, endpoint, mood: Mood) => {
            demoMood = structuredClone(mood);
            log(`Demo mood: mode ${mood.mode}, ${mood.colors.length} Farben`);
            return demoMood;
        },
        getLogs: async () => [...logs],
        clearLogs: async () => void logs.splice(0, logs.length),
        openDataDir: async () => log("openDataDir is a no-op in the browser"),
        listPresets: async () => demoPresets,
        savePreset: async (name, mood) => {
            demoPresets = [...demoPresets.filter(p => p.name !== name), { id: name, name, mood }];
            return demoPresets;
        },
        deletePreset: async id => {
            demoPresets = demoPresets.filter(p => p.id !== id);
            return demoPresets;
        },
        getSettings: async () => demoSettings,
        updateSettings: async patch => {
            demoSettings = { ...demoSettings, ...patch, schedule: { ...demoSettings.schedule, ...(patch.schedule ?? {}) } };
            return demoSettings;
        },
        onEvent: handler => {
            listeners.add(handler);
            return () => listeners.delete(handler);
        },
    };
}

export const api: MatterApi = window.matter ?? createDemoApi();

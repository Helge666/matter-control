import { BrowserWindow, type Tray, app, ipcMain, shell } from "electron";
import { join } from "node:path";
import type { LampMode, Mood } from "../shared/mood";
import { type MoodPreset, presetId, toPresetMood } from "../shared/presets";
import type { CommissionRequest } from "../shared/types";
import { setLanguage, t } from "./i18n";
import { MatterService } from "./matter/service";
import { PresetStore } from "./presets";
import { Scheduler } from "./scheduler";
import { type AppSettings, SettingsStore } from "./settings";
import { createTray } from "./tray";

const DATA_DIR = join(app.getPath("userData"), "matter");

/** Started by the login item: come up in the tray without showing a window. */
const START_HIDDEN = process.argv.includes("--hidden");

let mainWindow: BrowserWindow | undefined;
let matter: MatterService | undefined;
let tray: Tray | undefined;
let scheduler: Scheduler | undefined;
let quitting = false;

/** Chrome colours for the native window-control overlay; kept in step with the renderer theme. */
const TITLEBAR = { color: "#11151c", symbolColor: "#aab4c2", height: 40 } as const;

function createWindow(show: boolean) {
    const window = new BrowserWindow({
        // Sized to two lamp cards side by side, tried by hand on the real window. Wider, the
        // card grid reserves an empty third column; taller, it leaves a band of nothing below.
        width: 980,
        height: 740,
        minWidth: 980,
        minHeight: 620,
        show: false,
        backgroundColor: "#0b0e13",
        // Win11 translucency. Ignored on older Windows, where the solid backgroundColor shows.
        backgroundMaterial: "mica",
        titleBarStyle: "hidden",
        titleBarOverlay: TITLEBAR,
        autoHideMenuBar: true,
        icon: join(__dirname, "../../build/icon.png"),
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: false,
            contextIsolation: true,
        },
    });

    window.on("ready-to-show", () => {
        if (show) window.show();
    });

    // Closing the window leaves the app in the tray; only an explicit quit really exits.
    window.on("close", event => {
        if (quitting) return;
        event.preventDefault();
        window.hide();
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        void window.loadFile(join(__dirname, "../renderer/index.html"));
    }

    return window;
}

/**
 * Send the current status and device list to the renderer.
 *
 * Needed because the two start in parallel and the renderer can win. Loading from an asar is
 * much faster than from a dev server, so the packaged app would query an empty list and then
 * miss the event announcing the real one — leaving a window that never filled in. Pushing again
 * once the page has finished loading closes that gap, and covers reloads too.
 */
function pushStateToRenderer() {
    if (!mainWindow || mainWindow.isDestroyed() || !matter) return;
    mainWindow.webContents.send("matter:event", { type: "status", status: matter.status });
    mainWindow.webContents.send("matter:event", { type: "devices", devices: matter.listDevices() });
}

function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow(true);
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
}

function registerIpc(service: MatterService, settings: SettingsStore, presets: PresetStore) {
    const handle = <T extends unknown[], R>(channel: string, fn: (...args: T) => R | Promise<R>) =>
        ipcMain.handle(channel, (_event, ...args) => fn(...(args as T)));

    handle("matter:getStatus", () => service.status);
    handle("matter:listDevices", () => service.listDevices());
    handle("matter:discover", (seconds: number) => service.discover(seconds));
    handle("matter:commission", (request: CommissionRequest) => service.commission(request));
    handle("matter:forget", (id: string) => service.forget(id));
    handle("matter:rename", (id: string, name: string) => service.rename(id, name));
    handle("matter:refresh", (id: string) => service.refresh(id));
    handle("matter:setOnOff", (id: string, ep: number, on: boolean) => service.setOnOff(id, ep, on));
    handle("matter:setLevel", (id: string, ep: number, level: number) => service.setLevel(id, ep, level));
    handle("matter:setColorTemperature", (id: string, ep: number, mireds: number) =>
        service.setColorTemperature(id, ep, mireds),
    );
    handle("matter:setHueSaturation", (id: string, ep: number, hue: number, sat: number) =>
        service.setHueSaturation(id, ep, hue, sat),
    );
    handle("matter:identify", (id: string, ep: number, seconds: number) => service.identify(id, ep, seconds));
    handle("matter:readMood", (id: string, ep: number) => service.readMood(id, ep));
    handle("matter:writeMood", (id: string, ep: number, mood: Mood) => service.writeMood(id, ep, mood));
    handle("matter:setLampMode", (id: string, ep: number, mode: LampMode) => service.setLampMode(id, ep, mode));
    handle("matter:setMicPattern", (id: string, ep: number, pattern: number) =>
        service.setMicPattern(id, ep, pattern),
    );
    handle("matter:getLogs", () => service.getLogs());
    handle("matter:clearLogs", () => service.clearLogs());
    handle("matter:openDataDir", () => shell.openPath(DATA_DIR));

    handle("app:getSettings", () => settings.value);
    handle("app:updateSettings", (patch: Partial<AppSettings>) => {
        const next = settings.update(patch);
        if (patch.schedule) scheduler?.update(next.schedule);
        if (patch.language) setLanguage(next.language);
        (tray as { rebuild?: () => void } | undefined)?.rebuild?.();
        return next;
    });

    handle("app:listPresets", () => presets.all);
    handle("app:savePreset", (name: string, mood: Mood, description?: string) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error(t("error.presetNameMissing"));
        // Reuse the id when the user saves under an existing name, so saving twice updates
        // rather than piling up near-duplicates.
        const existing = presets.all.find(p => p.name.toLowerCase() === trimmed.toLowerCase() && !p.factory);
        const preset: MoodPreset = {
            id: existing?.id ?? presetId(trimmed, presets.all.map(p => p.id)),
            name: trimmed,
            description,
            mood: toPresetMood(mood),
        };
        return presets.save(preset);
    });
    handle("app:deletePreset", (id: string) => presets.remove(id));

    service.on("event", event => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("matter:event", event);
    });
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", showWindow);

    void app.whenReady().then(async () => {
        const settings = new SettingsStore(DATA_DIR);
        setLanguage(settings.value.language);
        settings.syncAutostart();

        // A hidden start still builds the window, so opening it later is instant.
        mainWindow = createWindow(!(START_HIDDEN && settings.value.startHidden));
        mainWindow.webContents.on("did-finish-load", pushStateToRenderer);

        const presets = new PresetStore(DATA_DIR);
        matter = new MatterService(DATA_DIR, app.getVersion());
        registerIpc(matter, settings, presets);
        tray = createTray(matter, settings, showWindow, () => mainWindow);

        try {
            await matter.start();
        } catch (e) {
            // The window still opens: the renderer shows the error from the status channel.
            console.error("Matter controller failed to start:", e);
        }

        pushStateToRenderer();

        scheduler = new Scheduler(matter, settings.value.schedule, message =>
            console.log(`[scheduler] ${message}`),
        );
        scheduler.start();

        app.on("activate", showWindow);
    });

    // With a tray icon the app outlives its window on purpose.
    app.on("window-all-closed", () => {});

    app.on("before-quit", event => {
        quitting = true;
        scheduler?.stop();
        if (!matter) return;
        const service = matter;
        matter = undefined;
        // Close the fabric cleanly so storage locks are released and sessions are torn down.
        event.preventDefault();
        void service.stop().finally(() => app.quit());
    });
}

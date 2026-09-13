import { type BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { join } from "node:path";
import { describeSchedule } from "../shared/schedule";
import { t, tn } from "./i18n";
import type { MatterService } from "./matter/service";
import type { SettingsStore } from "./settings";

/**
 * The tray is the app's real home: it is meant to sit there from login onwards, with the window
 * as something you open when you want to change more than on and off.
 */
export function createTray(
    service: MatterService,
    settings: SettingsStore,
    showWindow: () => void,
    getWindow: () => BrowserWindow | undefined,
): Tray {
    // Two sizes so Windows picks the crisp one for the current scaling.
    const icon = nativeImage.createFromPath(join(__dirname, "../../build/tray-32.png"));
    icon.addRepresentation({
        scaleFactor: 1,
        buffer: nativeImage.createFromPath(join(__dirname, "../../build/tray-16.png")).toPNG(),
    });

    const tray = new Tray(icon);
    tray.setToolTip("Matter Control");

    const switchAll = async (on: boolean) => {
        for (const device of service.listDevices()) {
            for (const endpoint of device.endpoints) {
                if (endpoint.capabilities.onOff) {
                    await service.setOnOff(device.id, endpoint.number, on).catch(() => {});
                }
            }
        }
    };

    const rebuild = () => {
        const devices = service.listDevices();
        const schedule = settings.value.schedule;

        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: tn("tray.devices", devices.length), enabled: false },
                {
                    label: schedule.enabled
                        ? t("tray.schedule", { description: describeSchedule(schedule, t) })
                        : t("tray.scheduleOff"),
                    enabled: false,
                },
                { type: "separator" },
                { label: t("tray.allOn"), click: () => void switchAll(true) },
                { label: t("tray.allOff"), click: () => void switchAll(false) },
                { type: "separator" },
                { label: t("tray.open"), click: showWindow },
                { label: t("tray.quit"), click: () => app.quit() },
            ]),
        );
    };

    rebuild();
    // Keep the counts and the schedule line honest as things change.
    service.on("event", event => {
        if (event.type === "devices" || event.type === "status") rebuild();
    });

    tray.on("double-click", showWindow);
    tray.on("click", () => {
        const window = getWindow();
        if (window?.isVisible() && !window.isMinimized()) window.hide();
        else showWindow();
    });

    return Object.assign(tray, { rebuild });
}

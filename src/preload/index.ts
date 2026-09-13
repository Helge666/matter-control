import { contextBridge, ipcRenderer } from "electron";
import type { CommissionRequest, MatterApi, MatterEvent } from "../shared/types";

const api: MatterApi = {
    getStatus: () => ipcRenderer.invoke("matter:getStatus"),
    listDevices: () => ipcRenderer.invoke("matter:listDevices"),
    discover: seconds => ipcRenderer.invoke("matter:discover", seconds),
    commission: (request: CommissionRequest) => ipcRenderer.invoke("matter:commission", request),
    forget: id => ipcRenderer.invoke("matter:forget", id),
    rename: (id, name) => ipcRenderer.invoke("matter:rename", id, name),
    refresh: id => ipcRenderer.invoke("matter:refresh", id),
    setOnOff: (id, endpoint, on) => ipcRenderer.invoke("matter:setOnOff", id, endpoint, on),
    setLevel: (id, endpoint, level) => ipcRenderer.invoke("matter:setLevel", id, endpoint, level),
    setColorTemperature: (id, endpoint, mireds) =>
        ipcRenderer.invoke("matter:setColorTemperature", id, endpoint, mireds),
    setHueSaturation: (id, endpoint, hue, saturation) =>
        ipcRenderer.invoke("matter:setHueSaturation", id, endpoint, hue, saturation),
    identify: (id, endpoint, seconds) => ipcRenderer.invoke("matter:identify", id, endpoint, seconds),
    readMood: (id, endpoint) => ipcRenderer.invoke("matter:readMood", id, endpoint),
    writeMood: (id, endpoint, mood) => ipcRenderer.invoke("matter:writeMood", id, endpoint, mood),
    setLampMode: (id, endpoint, mode) => ipcRenderer.invoke("matter:setLampMode", id, endpoint, mode),
    setMicPattern: (id, endpoint, pattern) => ipcRenderer.invoke("matter:setMicPattern", id, endpoint, pattern),
    getLogs: () => ipcRenderer.invoke("matter:getLogs"),
    clearLogs: () => ipcRenderer.invoke("matter:clearLogs"),
    openDataDir: () => ipcRenderer.invoke("matter:openDataDir"),
    getSettings: () => ipcRenderer.invoke("app:getSettings"),
    updateSettings: patch => ipcRenderer.invoke("app:updateSettings", patch),
    listPresets: () => ipcRenderer.invoke("app:listPresets"),
    savePreset: (name, mood, description) => ipcRenderer.invoke("app:savePreset", name, mood, description),
    deletePreset: id => ipcRenderer.invoke("app:deletePreset", id),
    onEvent: handler => {
        const listener = (_event: unknown, payload: MatterEvent) => handler(payload);
        ipcRenderer.on("matter:event", listener);
        return () => ipcRenderer.removeListener("matter:event", listener);
    },
};

contextBridge.exposeInMainWorld("matter", api);

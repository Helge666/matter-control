import {
    ControllerBehavior,
    Environment,
    LogDestination,
    LogFormat,
    LogLevel,
    Logger,
    Seconds,
    ServerNode,
} from "@matter/main";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { asTlvOctetString, asTlvUnsignedInt, bytesOf, vendorNumberOf } from "./vendor-values";
import { t } from "../i18n";
import { installCryptoCompat } from "./crypto-compat";
import {
    type LampMode,
    MIC_ARMED_BYTE,
    MIC_ATTRIBUTE,
    MIC_PATTERNS,
    MIC_PATTERN_BYTE,
    MIC_PATTERN_SUB_BYTE,
    MODE_ATTRIBUTE,
    MOOD_ATTRIBUTE,
    MOOD_CLUSTER,
    type Mood,
    decodeLampMode,
    decodeMood,
    encodeLampMode,
    encodeMood,
} from "../../shared/mood";
import type {
    CommissionRequest,
    CommissionableDevice,
    ControllerStatus,
    DeviceState,
    EndpointCapabilities,
    EndpointState,
    LogEntry,
    MatterEvent,
} from "../../shared/types";

const FABRIC_LABEL = "matter-control (PC)";
const MAX_LOG_ENTRIES = 2000;

/**
 * Apply changes immediately rather than asking the device to fade.
 *
 * Measured on a LEDVANCE/Tuya bulb: a MoveToLevelWithOnOff from 40 to 230 with transitionTime 1
 * (100ms per spec) was still ramping 2.5s later, sitting at 77 with remainingTime set — the
 * device substitutes its own long fade for short transition times. With 0 the same jump lands
 * at once. Since the sliders stream values while dragging, instant application is also what
 * makes the light track the control instead of chasing a stale target.
 */
const TRANSITION_IMMEDIATE = 0;

/** Device type ids we want to show with a friendly name. Anything else falls back to hex. */
const DEVICE_TYPE_NAMES: Record<number, string> = {
    0x0100: "On/Off Light",
    0x0101: "Dimmable Light",
    0x010c: "Color Temperature Light",
    0x010d: "Extended Color Light",
    0x0103: "On/Off Light Switch",
    0x010a: "On/Off Plug-in Unit",
    0x010b: "Dimmable Plug-in Unit",
    0x0302: "Temperature Sensor",
    0x0307: "Humidity Sensor",
    0x0015: "Contact Sensor",
    0x0107: "Occupancy Sensor",
    0x000a: "Door Lock",
    0x0202: "Window Covering",
    0x0301: "Thermostat",
    0x0016: "Root Node",
    0x0011: "Power Source",
    0x0013: "Bridged Node",
    0x000f: "Generic Switch",
};

function deviceTypeName(id: number): string {
    return DEVICE_TYPE_NAMES[id] ?? `Device type 0x${id.toString(16).padStart(4, "0")}`;
}

/**
 * Owns the matter.js controller node and exposes a flat, serializable API.
 *
 * Everything crossing the IPC boundary is reduced to plain JSON here: matter.js state objects
 * contain class instances, BigInt node ids and observables that cannot be structured-cloned.
 */
export class MatterService extends EventEmitter {
    #node?: ServerNode;
    #status: ControllerStatus;
    #logs: LogEntry[] = [];
    #nextLogId = 1;
    /** User-assigned labels, keyed by local node id. Persisted to {@link #labelsFile}. */
    #labels = new Map<string, string>();
    #labelsFile: string;

    constructor(
        private readonly dataDir: string,
        version: string,
    ) {
        super();
        this.#status = { phase: "starting", fabricLabel: FABRIC_LABEL, dataDir, version };
        this.#labelsFile = join(dataDir, "device-labels.json");
    }

    #loadLabels() {
        try {
            const raw = readFileSync(this.#labelsFile, "utf8");
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                for (const [id, label] of Object.entries(parsed as Record<string, unknown>)) {
                    if (typeof label === "string") this.#labels.set(id, label);
                }
            }
        } catch {
            // No labels yet, or the file is unreadable. Falling back to advertised names is fine.
        }
    }

    #saveLabels() {
        try {
            mkdirSync(this.dataDir, { recursive: true });
            writeFileSync(this.#labelsFile, JSON.stringify(Object.fromEntries(this.#labels), undefined, 2));
        } catch (e) {
            this.#log("warn", "Labels", `Could not save device names: ${errorMessage(e)}`);
        }
    }

    get status(): ControllerStatus {
        return this.#status;
    }

    // ---------------------------------------------------------------- lifecycle

    async start(): Promise<void> {
        this.#installLogCapture();
        this.#loadLabels();

        // A start that never finishes is the worst case for the window: it would sit there empty
        // with nothing to explain itself. The usual cause is another process holding the storage.
        const watchdog = setTimeout(() => {
            if (this.#status.phase === "starting") {
                this.#setStatus({
                    error: t("error.slowStart"),
                });
            }
        }, 15_000);

        try {
            // Must happen before the first node is built: the certificate authority is created
            // during controller initialization.
            const cryptoNote = installCryptoCompat();
            if (cryptoNote) this.#log("info", "Crypto", cryptoNote);

            const env = Environment.default;
            env.vars.set("storage.path", this.dataDir);

            const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
                id: "controller",
                controller: { adminFabricLabel: FABRIC_LABEL },
                basicInformation: {
                    vendorName: "matter-control",
                    productName: "Windows Controller",
                    nodeLabel: "matter-control",
                },
            });

            this.#node = node;
            await node.start();

            // ControllerBehavior initializes lazily. Force it now so a failure surfaces as a
            // startup error the UI can show, instead of as a "crashed-dependency" on first scan.
            await node.act(agent => agent.load(ControllerBehavior));

            node.peers.added.on(peer => {
                this.#watchPeer(peer);
                this.#pushDevices();
            });
            node.peers.deleted.on(() => this.#pushDevices());
            for (const peer of node.peers) this.#watchPeer(peer);

            this.#setStatus({ phase: "online", error: undefined });
            this.#pushDevices();
        } catch (e) {
            this.#setStatus({ phase: "error", error: errorMessage(e) });
            throw e;
        } finally {
            clearTimeout(watchdog);
        }
    }

    async stop(): Promise<void> {
        const node = this.#node;
        this.#node = undefined;
        if (node) await node.close().catch(() => {});
        this.#setStatus({ phase: "offline" });
    }

    #node_(): ServerNode {
        if (!this.#node) throw new Error("Controller is not running");
        return this.#node;
    }

    #setStatus(patch: Partial<ControllerStatus>) {
        this.#status = { ...this.#status, ...patch };
        this.#emit({ type: "status", status: this.#status });
    }

    #emit(event: MatterEvent) {
        this.emit("event", event);
    }

    // ----------------------------------------------------------------- devices

    listDevices(): DeviceState[] {
        if (!this.#node) return [];
        return [...this.#node.peers].filter(p => p.state.commissioning?.peerAddress).map(p => this.#describe(p));
    }

    async refresh(id: string): Promise<DeviceState | undefined> {
        const peer = this.#peer(id);
        if (!peer) return undefined;
        if (!peer.lifecycle.isOnline) await peer.start().catch(() => {});
        const device = this.#describe(peer);
        this.#emit({ type: "device", device });
        return device;
    }

    rename(id: string, name: string): void {
        const trimmed = name.trim();
        if (trimmed) this.#labels.set(id, trimmed);
        else this.#labels.delete(id);
        this.#saveLabels();
        this.#pushDevices();
    }

    async forget(id: string): Promise<void> {
        const peer = this.#peer(id);
        if (!peer) throw new Error(`Unknown device ${id}`);
        try {
            await peer.decommission();
        } catch (e) {
            this.#log("warn", "Commissioning", `Decommission failed (${errorMessage(e)}); removing locally`);
            await peer.delete();
        }
        this.#labels.delete(id);
        this.#saveLabels();
        this.#pushDevices();
    }

    // ----------------------------------------------------------- commissioning

    async discover(seconds: number): Promise<CommissionableDevice[]> {
        const node = this.#node_();
        const discovery = node.peers.discover({ timeout: Seconds(clamp(seconds, 2, 60)) });
        const found = await discovery;
        return found.map(peer => {
            const c = peer.state.commissioning ?? {};
            return {
                id: peer.id,
                name: c.deviceName,
                vendorId: numberOf(c.vendorId),
                productId: numberOf(c.productId),
                discriminator: numberOf(c.discriminator),
                commissioningMode: numberOf(c.commissioningMode),
                addresses: formatAddresses(c.addresses),
                pairingInstructions: c.pairingInstructions,
            };
        });
    }

    async commission(request: CommissionRequest): Promise<DeviceState> {
        const node = this.#node_();
        const pairingCode = request.pairingCode.replace(/[\s-]/g, "");
        if (!/^\d{11}(\d{10})?$/.test(pairingCode) && !/^MT:/i.test(request.pairingCode.trim())) {
            throw new Error("Pairing code must be 11 or 21 digits, or a QR payload starting with MT:");
        }

        this.#emit({ type: "commissioning", stage: "discovering", detail: `code ${pairingCode}` });

        const wifi =
            request.wifiSsid && request.wifiPassword
                ? { wifiSsid: request.wifiSsid, wifiCredentials: request.wifiPassword }
                : undefined;

        const peer = await node.peers.commission({
            pairingCode,
            timeout: Seconds(90),
            regulatoryCountryCode: "DE",
            ...(wifi ? { wifiNetwork: wifi } : {}),
        });

        if (request.label) {
            this.#labels.set(peer.id, request.label.trim());
            this.#saveLabels();
        }
        this.#watchPeer(peer);
        this.#emit({ type: "commissioning", stage: "done", detail: peer.id });
        const device = this.#describe(peer);
        this.#pushDevices();
        return device;
    }

    // ------------------------------------------------------------------ control

    async setOnOff(id: string, endpoint: number, on: boolean): Promise<void> {
        await this.#actOn(id, endpoint, agent => (on ? agent.onOff.on() : agent.onOff.off()));
    }

    async setLevel(id: string, endpoint: number, level: number): Promise<void> {
        await this.#actOn(id, endpoint, agent =>
            agent.levelControl.moveToLevelWithOnOff({
                level: clamp(Math.round(level), 1, 254),
                transitionTime: TRANSITION_IMMEDIATE,
                optionsMask: {},
                optionsOverride: {},
            }),
        );
    }

    async setColorTemperature(id: string, endpoint: number, mireds: number): Promise<void> {
        await this.#actOn(id, endpoint, agent =>
            agent.colorControl.moveToColorTemperature({
                colorTemperatureMireds: Math.round(mireds),
                transitionTime: TRANSITION_IMMEDIATE,
                optionsMask: {},
                optionsOverride: {},
            }),
        );
    }

    async setHueSaturation(id: string, endpoint: number, hue: number, saturation: number): Promise<void> {
        await this.#actOn(id, endpoint, agent =>
            agent.colorControl.moveToHueAndSaturation({
                hue: clamp(Math.round(hue), 0, 254),
                saturation: clamp(Math.round(saturation), 0, 254),
                transitionTime: TRANSITION_IMMEDIATE,
                optionsMask: {},
                optionsOverride: {},
            }),
        );
    }

    // ------------------------------------------------------------------- moods

    async readMood(id: string, endpointNumber: number): Promise<Mood | undefined> {
        const bytes = this.#moodBytes(id, endpointNumber);
        if (!bytes?.length) return undefined;
        try {
            return decodeMood(bytes);
        } catch (e) {
            this.#log("warn", "Mood", `Could not read the mood of ${id}: ${errorMessage(e)}`);
            return undefined;
        }
    }

    async writeMood(id: string, endpointNumber: number, mood: Mood): Promise<Mood> {
        const peer = this.#peer(id);
        if (!peer) throw new Error(t("error.unknownDevice", { id }));
        const endpoint: any = [...peer.endpoints].find((ep: any) => ep.number === endpointNumber);
        if (!endpoint) throw new Error(t("error.noEndpoint", { id, endpoint: endpointNumber }));
        if (endpoint.state?.[MOOD_CLUSTER] === undefined) {
            throw new Error(t("error.noMoods", { id }));
        }

        // Preserve the two header bytes we do not interpret, so a write stays as close to what
        // the vendor app produces as we can manage.
        const current = this.#moodBytes(id, endpointNumber);
        const opaque = current?.length ? decodeMood(current).opaque : undefined;

        const bytes = encodeMood({ ...mood, opaque: mood.opaque ?? opaque });
        await endpoint.setStateOf(MOOD_CLUSTER, { [MOOD_ATTRIBUTE]: asTlvOctetString(bytes) });

        this.#emit({ type: "device", device: this.#describe(peer) });
        return decodeMood(bytes);
    }

    async setLampMode(id: string, endpointNumber: number, mode: LampMode): Promise<void> {
        const peer = this.#peer(id);
        if (!peer) throw new Error(t("error.unknownDevice", { id }));
        const endpoint: any = [...peer.endpoints].find((ep: any) => ep.number === endpointNumber);
        if (!endpoint?.state?.[MOOD_CLUSTER]) {
            throw new Error(t("error.noModes", { id }));
        }

        // Selecting the mode is not enough for the microphone: attribute 0x34 carries an arm
        // flag that must be set as well. A lamp that had never run the mode reported mode 3 and
        // did nothing until that byte was raised.
        if (mode === "microphone") {
            const config = this.#vendorBytes(id, endpointNumber, MIC_ATTRIBUTE);
            if (config?.length && config[MIC_ARMED_BYTE] !== 1) {
                const armed = Uint8Array.from(config);
                armed[MIC_ARMED_BYTE] = 1;
                await endpoint.setStateOf(MOOD_CLUSTER, { [MIC_ATTRIBUTE]: asTlvOctetString(armed) });
            }
        }

        await endpoint.setStateOf(MOOD_CLUSTER, {
            [MODE_ATTRIBUTE]: asTlvUnsignedInt(encodeLampMode(mode)),
        });
        this.#emit({ type: "device", device: this.#describe(peer) });
    }

    async setMicPattern(id: string, endpointNumber: number, pattern: number): Promise<void> {
        const peer = this.#peer(id);
        if (!peer) throw new Error(t("error.unknownDevice", { id }));
        const endpoint: any = [...peer.endpoints].find((ep: any) => ep.number === endpointNumber);
        if (!endpoint?.state?.[MOOD_CLUSTER]) throw new Error(t("error.noMicrophone", { id }));

        const config = this.#vendorBytes(id, endpointNumber, MIC_ATTRIBUTE);
        if (!config?.length) throw new Error(t("error.micNotRead"));

        const entry = MIC_PATTERNS.find(p => p.value === pattern);
        if (!entry) throw new Error(t("error.unknownMicPattern", { pattern }));

        const next = Uint8Array.from(config);
        next[MIC_PATTERN_BYTE] = entry.value;
        // Byte 3 goes with byte 2; writing the pattern alone freezes the display.
        next[MIC_PATTERN_SUB_BYTE] = entry.sub;
        await endpoint.setStateOf(MOOD_CLUSTER, { [MIC_ATTRIBUTE]: asTlvOctetString(next) });
        this.#emit({ type: "device", device: this.#describe(peer) });
    }

    #moodBytes(id: string, endpointNumber: number): Uint8Array | undefined {
        return this.#vendorBytes(id, endpointNumber, MOOD_ATTRIBUTE);
    }

    #vendorBytes(id: string, endpointNumber: number, attribute: string): Uint8Array | undefined {
        const peer = this.#peer(id);
        const endpoint: any = peer && [...peer.endpoints].find((ep: any) => ep.number === endpointNumber);
        return bytesOf(endpoint?.state?.[MOOD_CLUSTER]?.[attribute]);
    }

    async identify(id: string, endpoint: number, seconds: number): Promise<void> {
        await this.#actOn(id, endpoint, agent => agent.identify.identify({ identifyTime: clamp(seconds, 1, 60) }));
    }

    async #actOn(id: string, endpointNumber: number, action: (agent: any) => unknown): Promise<void> {
        const peer = this.#peer(id);
        if (!peer) throw new Error(`Unknown device ${id}`);

        const resolve = () => {
            const endpoint = [...peer.endpoints].find((ep: any) => ep.number === endpointNumber);
            if (!endpoint) throw new Error(`Device ${id} has no endpoint ${endpointNumber}`);
            return endpoint;
        };

        try {
            await resolve().act((agent: any) => action(agent));
        } catch (e) {
            if (!isChannelClosed(e)) throw e;

            // The operational channel died: the device rebooted, dropped the session, or stopped
            // answering. Bring the node back and try once more before surfacing a failure.
            this.#log("warn", "Peer", `Channel to ${id} closed; reconnecting`);
            try {
                await peer.start();
                await resolve().act((agent: any) => action(agent));
            } catch (retryError) {
                const name = this.#labels.get(id) ?? id;
                throw new Error(
                    `Verbindung zu "${name}" abgebrochen, Neuverbindung fehlgeschlagen: ${errorMessage(retryError)}`,
                );
            }
        }

        // The device reports the new value through its subscription; read back so the UI is
        // correct even when the subscription is slow or the attribute is not reportable.
        this.#emit({ type: "device", device: this.#describe(peer) });
    }

    // ------------------------------------------------------------------- logs

    getLogs(): LogEntry[] {
        return this.#logs;
    }

    clearLogs(): void {
        this.#logs = [];
    }

    // -------------------------------------------------------------- internals

    #peer(id: string) {
        return this.#node?.peers.get(id);
    }

    #pushDevices() {
        this.#emit({ type: "devices", devices: this.listDevices() });
    }

    /** Re-emit this peer whenever matter.js reports a change, so the UI tracks the device live. */
    #watchPeer(peer: any) {
        const push = () => {
            try {
                this.#emit({ type: "device", device: this.#describe(peer) });
            } catch {
                /* peer torn down mid-update */
            }
        };

        try {
            peer.lifecycle.online.on(push);
            peer.lifecycle.offline.on(push);
        } catch {
            /* older lifecycle shape */
        }

        // Attribute-level change events, where the cluster exposes them.
        const attach = (endpoint: any) => {
            for (const [cluster, attrs] of [
                ["onOff", ["onOff"]],
                ["levelControl", ["currentLevel"]],
                ["colorControl", ["colorTemperatureMireds", "currentHue", "currentSaturation"]],
                // matter.js names change events after the attribute, so the vendor cluster's
                // read "attr$2$Changed" and so on. Mode and microphone settings show on the card.
                [MOOD_CLUSTER, [MODE_ATTRIBUTE, MIC_ATTRIBUTE]],
            ] as const) {
                for (const attr of attrs) {
                    try {
                        endpoint.events?.[cluster]?.[`${attr}$Changed`]?.on(push);
                    } catch {
                        /* cluster not present on this endpoint */
                    }
                }
            }
        };

        try {
            for (const endpoint of peer.endpoints) attach(endpoint);
            peer.endpoints.added?.on?.((endpoint: any) => {
                attach(endpoint);
                push();
            });
        } catch {
            /* endpoints not initialized yet; the next refresh will pick them up */
        }
    }

    #describe(peer: any): DeviceState {
        const c = peer.state?.commissioning ?? {};
        const basic = peer.state?.basicInformation ?? {};
        const nodeId = c.peerAddress?.nodeId;

        const endpoints: EndpointState[] = [];
        try {
            for (const ep of peer.endpoints) {
                const state = ep.state ?? {};
                const capabilities: EndpointCapabilities = {
                    onOff: state.onOff !== undefined,
                    level: state.levelControl !== undefined,
                    colorTemperature: state.colorControl?.colorTemperatureMireds !== undefined,
                    colorHueSat: state.colorControl?.currentHue !== undefined,
                    mood: state[MOOD_CLUSTER] !== undefined,
                };
                // Endpoint 0 is the root node; it carries no controllable function.
                if (ep.number !== 0 && !Object.values(capabilities).some(Boolean)) continue;

                const types: number[] = (state.descriptor?.deviceTypeList ?? [])
                    .map((t: any) => numberOf(t?.deviceType))
                    .filter((n: unknown): n is number => typeof n === "number");

                endpoints.push({
                    number: ep.number,
                    lampMode: decodeLampMode(vendorNumberOf(state[MOOD_CLUSTER]?.[MODE_ATTRIBUTE])),
                    micPattern: bytesOf(state[MOOD_CLUSTER]?.[MIC_ATTRIBUTE])?.[MIC_PATTERN_BYTE],
                    deviceType: types.length ? deviceTypeName(types[types.length - 1]) : undefined,
                    capabilities,
                    onOff: state.onOff?.onOff,
                    level: numberOf(state.levelControl?.currentLevel),
                    colorTemperatureMireds: numberOf(state.colorControl?.colorTemperatureMireds),
                    colorTempMinMireds: numberOf(state.colorControl?.colorTempPhysicalMinMireds),
                    colorTempMaxMireds: numberOf(state.colorControl?.colorTempPhysicalMaxMireds),
                    hue: numberOf(state.colorControl?.currentHue),
                    saturation: numberOf(state.colorControl?.currentSaturation),
                });
            }
        } catch {
            /* endpoint tree still initializing */
        }

        const fallbackName = basic.productName ?? c.deviceName ?? peer.id;

        return {
            id: peer.id,
            nodeId: nodeId === undefined ? "—" : `0x${BigInt(nodeId).toString(16).toUpperCase()}`,
            name: this.#labels.get(peer.id) ?? fallbackName,
            vendorName: basic.vendorName,
            productName: basic.productName,
            vendorId: numberOf(basic.vendorId ?? c.vendorId),
            productId: numberOf(basic.productId ?? c.productId),
            serialNumber: basic.serialNumber,
            softwareVersion: basic.softwareVersionString ?? stringOf(basic.softwareVersion),
            online: Boolean(peer.lifecycle?.isOnline),
            addresses: formatAddresses(c.addresses),
            endpoints,
        };
    }

    /**
     * Mirror matter.js's logger into our ring buffer so the UI can show protocol detail.
     *
     * This adds a destination rather than replacing the default one: the default keeps writing to
     * stdout, which is where startup failures are readable when the window cannot render them.
     */
    #installLogCapture() {
        Logger.level = LogLevel.INFO;
        Logger.format = LogFormat.PLAIN;
        Logger.destinations.ui = LogDestination({
            name: "ui",
            level: LogLevel.DEBUG,
            write: (text: string, message: any) => {
                const level = (["debug", "debug", "info", "info", "warn", "error", "error"][message?.level ?? 2] ??
                    "info") as LogEntry["level"];
                this.#log(level, String(message?.facility ?? "matter"), text);
            },
        });
    }

    #log(level: LogEntry["level"], facility: string, message: string) {
        const entry: LogEntry = { id: this.#nextLogId++, at: Date.now(), level, facility, message };
        this.#logs.push(entry);
        if (this.#logs.length > MAX_LOG_ENTRIES) this.#logs.splice(0, this.#logs.length - MAX_LOG_ENTRIES);
        this.#emit({ type: "log", entry });
    }
}

// ------------------------------------------------------------------- helpers

function clamp(n: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, n));
}

function numberOf(v: unknown): number | undefined {
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    return undefined;
}

function stringOf(v: unknown): string | undefined {
    return v === undefined || v === null ? undefined : String(v);
}

function formatAddresses(addresses: unknown): string[] {
    if (!Array.isArray(addresses)) return [];
    return addresses
        .map(a => {
            if (!a || typeof a !== "object") return undefined;
            const addr = a as { type?: string; ip?: string; port?: number; peripheralAddress?: string };
            if (addr.type === "ble") return `BLE ${addr.peripheralAddress ?? ""}`.trim();
            if (!addr.ip) return undefined;
            const host = addr.ip.includes(":") ? `[${addr.ip}]` : addr.ip;
            return addr.port ? `${host}:${addr.port}` : host;
        })
        .filter((s): s is string => Boolean(s));
}

/**
 * Flatten an error and its causes into one line.
 *
 * matter.js reports initialization failures as a "crashed-dependency" wrapper whose message says
 * nothing useful; the actionable error sits several `cause` levels down.
 */
/** Matter.js reports a dead operational channel as a "closed" error on the exchange. */
function isChannelClosed(e: unknown): boolean {
    const message = e instanceof Error ? e.message : String(e);
    return /channel is closed|\[closed\]/i.test(message);
}

function errorMessage(e: unknown): string {
    const parts: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = e;
    while (current && !seen.has(current) && parts.length < 6) {
        seen.add(current);
        const message = current instanceof Error ? current.message : String(current);
        if (message && parts[parts.length - 1] !== message) parts.push(message);
        current = (current as { cause?: unknown }).cause;
    }
    return parts.join(" ← ") || String(e);
}

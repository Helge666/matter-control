/**
 * Minimal Electron main process that starts the matter.js controller and runs one discovery,
 * with matter.js logging left on stdout and full error causes printed.
 *
 * Run:  node_modules/electron/dist/electron.exe tools/electron-probe.cjs
 */
const { app } = require("electron");
const path = require("node:path");

function dump(label, e, depth = 0) {
    const pad = "  ".repeat(depth);
    console.error(`${pad}${label}: ${e?.constructor?.name ?? typeof e} — ${e?.message ?? e}`);
    if (e?.stack) console.error(e.stack.split("\n").slice(1, 6).map(l => pad + l).join("\n"));
    if (e?.cause) dump("caused by", e.cause, depth + 1);
    if (Array.isArray(e?.errors)) e.errors.forEach((sub, i) => dump(`aggregate[${i}]`, sub, depth + 1));
}

app.disableHardwareAcceleration();

void app.whenReady().then(async () => {
    const { Environment, ServerNode, ControllerBehavior, Seconds, Logger, LogLevel, LogFormat, Crypto, Entropy, NodeJsStyleCrypto } = await import(
        "@matter/main"
    );
    const nodeCrypto = require("node:crypto");

    const ALIASES = { "SHA-1": "sha1", "SHA-224": "sha224", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512" };
    const norm = a => (typeof a === "string" ? (ALIASES[a] ?? a) : a);
    let patched = false;
    try { nodeCrypto.createHash("SHA-256"); } catch {
        const shim = new Proxy(nodeCrypto, {
            get(t, p, r) {
                if (p === "createHash") return (a, o) => t.createHash(norm(a), o);
                if (p === "createHmac") return (a, k, o) => t.createHmac(norm(a), k, o);
                return Reflect.get(t, p, r);
            },
        });
        const c = new NodeJsStyleCrypto(shim);
        Environment.default.set(Crypto, c);
        Environment.default.set(Entropy, c);
        patched = true;
    }
    console.log("crypto compat installed:", patched);

    Logger.level = LogLevel.DEBUG;
    Logger.format = LogFormat.PLAIN;

    const dataDir = path.join(app.getPath("userData"), "probe");
    Environment.default.vars.set("storage.path", dataDir);
    console.log("storage.path =", dataDir);
    console.log("process.versions =", JSON.stringify({ node: process.versions.node, electron: process.versions.electron }));

    let node;
    try {
        node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
            id: "controller",
            controller: { adminFabricLabel: "probe" },
        });
        await node.start();
        console.log("### controller started");
    } catch (e) {
        dump("START FAILED", e);
        app.exit(1);
        return;
    }

    try {
        const found = await node.peers.discover({ timeout: Seconds(5) });
        console.log(`### discovery returned ${found.length} candidate(s)`);
    } catch (e) {
        dump("DISCOVER FAILED", e);
    }

    try {
        await node.close();
    } catch (e) {
        dump("CLOSE FAILED", e);
    }
    app.exit(0);
});

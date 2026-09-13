import { Crypto, Entropy, Environment, StandardCrypto } from "@matter/main";
import nodeCrypto from "node:crypto";

/**
 * Electron links BoringSSL instead of OpenSSL, and BoringSSL omits two primitives matter.js
 * relies on when it runs on Node:
 *
 *   1. Hyphenated digest names. `createHash("SHA-256")` throws "Digest method not supported"
 *      while `createHash("sha256")` works. matter.js uses the WebCrypto spelling when it builds
 *      the fabric's certificate authority, so the controller crashes during initialization.
 *   2. AES-CCM. `aes-128-ccm` is absent entirely, and that is Matter's message cipher — without
 *      it no CASE session can be established ("Unknown cipher").
 *
 * matter.js already solves this for browsers and React Native: `StandardCrypto` runs on
 * WebCrypto (present in Electron) and carries its own JS implementation of AES-CCM. Selecting it
 * on Electron is the supported path, and avoids patching around a native library.
 *
 * The trade-off is real: `StandardCrypto` is slower than the native backend and matter.js labels
 * its AES-CCM code unaudited. It is therefore installed only when the runtime actually lacks the
 * native primitives, so plain Node (the CLI) keeps the native backend.
 */

function hasHyphenatedDigests(): boolean {
    try {
        nodeCrypto.createHash("SHA-256");
        return true;
    } catch {
        return false;
    }
}

function hasAesCcm(): boolean {
    return nodeCrypto.getCiphers().includes("aes-128-ccm");
}

/** True when the native crypto backend cannot serve matter.js on this runtime. */
export function needsPortableCrypto(): boolean {
    return !hasHyphenatedDigests() || !hasAesCcm();
}

/**
 * Install the portable crypto backend into {@link Environment.default} when required.
 *
 * Returns a short description of what was done, or undefined when the runtime needs no help.
 * Must run before the first ServerNode is constructed: the certificate authority is built during
 * controller initialization.
 */
export function installCryptoCompat(): string | undefined {
    if (!needsPortableCrypto()) return undefined;

    const missing = [
        hasHyphenatedDigests() ? undefined : "hyphenated digest names",
        hasAesCcm() ? undefined : "aes-128-ccm",
    ].filter(Boolean);

    const webCrypto = globalThis.crypto;
    if (!webCrypto?.subtle) {
        throw new Error(
            `Native crypto lacks ${missing.join(" and ")}, and no WebCrypto is available to fall back on`,
        );
    }

    const crypto = new StandardCrypto(webCrypto);
    Environment.default.set(Crypto, crypto);
    Environment.default.set(Entropy, crypto);

    return `native crypto lacks ${missing.join(" and ")}; using portable WebCrypto backend`;
}

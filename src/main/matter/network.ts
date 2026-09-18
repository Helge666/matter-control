import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import type { NetworkInterfaceInfo } from "../../shared/types";

/** Stand-ins for a real interface name in {@link AppSettings.networkInterface}. */
const INTERFACE_AUTO = "auto";
const INTERFACE_ALL = "all";

/**
 * Addresses that only prove an adapter exists, not that it can reach a lamp: an interface with
 * nothing but a link-local address has no router behind it.
 */
function isRoutable(address: string, family: string): boolean {
    if (family !== "IPv6") return false;
    return !address.toLowerCase().startsWith("fe80:");
}

/**
 * Adapters that could carry Matter, for the settings dropdown.
 *
 * Matter is IPv6-only on the wire, so an adapter without IPv6 is never the right answer and is
 * left out rather than offered and then quietly failing.
 */
export function listNetworkInterfaces(): NetworkInterfaceInfo[] {
    const result: NetworkInterfaceInfo[] = [];
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
        if (!addresses) continue;
        const ipv6 = addresses.filter(a => a.family === "IPv6" && !a.internal);
        if (!ipv6.length) continue;
        result.push({
            name,
            addresses: ipv6.map(a => a.address),
            routable: ipv6.some(a => isRoutable(a.address, a.family)),
        });
    }
    return result.sort((a, b) => Number(b.routable) - Number(a.routable) || a.name.localeCompare(b.name));
}

/**
 * Ask the routing table which local address would be used to leave the machine, then map it back
 * to an adapter name.
 *
 * `connect` on a UDP socket sends nothing; it only fixes the destination, which makes the OS do
 * the route lookup and bind a source address. That is the one question we actually care about —
 * "which adapter is this machine's way out" — answered without a dependency or a shell-out.
 */
async function interfaceForRouteTo(target: string, type: "udp4" | "udp6"): Promise<string | undefined> {
    const local = await new Promise<string | undefined>(resolve => {
        const socket = createSocket(type);
        const done = (address?: string) => {
            try {
                socket.close();
            } catch {
                /* already closing */
            }
            resolve(address);
        };
        socket.on("error", () => done(undefined));
        // No route to the target at all (a machine without IPv6, say) shows up here.
        const timer = setTimeout(() => done(undefined), 1500);
        timer.unref?.();
        try {
            socket.connect(53, target, () => {
                clearTimeout(timer);
                try {
                    done(socket.address().address);
                } catch {
                    done(undefined);
                }
            });
        } catch {
            clearTimeout(timer);
            done(undefined);
        }
    });

    if (!local) return undefined;
    const bare = local.split("%")[0];
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
        if (addresses?.some(a => a.address === bare)) return name;
    }
    return undefined;
}

/**
 * The adapter this machine uses to reach the network, or undefined when that cannot be decided.
 *
 * IPv6 is asked first because that is what Matter runs on; the IPv4 answer is only a fallback for
 * a machine whose IPv6 is local-only, where both families still share one physical adapter.
 */
export async function detectDefaultInterface(): Promise<string | undefined> {
    return (
        (await interfaceForRouteTo("2001:4860:4860::8888", "udp6")) ??
        (await interfaceForRouteTo("8.8.8.8", "udp4"))
    );
}

/**
 * Turn the stored preference into the interface name matter.js should be limited to, or undefined
 * to leave it unrestricted.
 */
export async function resolveNetworkInterface(preference: string | undefined): Promise<string | undefined> {
    if (preference === INTERFACE_ALL) return undefined;
    if (preference && preference !== INTERFACE_AUTO) {
        // A named adapter that has since been unplugged would make matter.js throw on startup.
        const known = listNetworkInterfaces().some(i => i.name === preference);
        return known ? preference : undefined;
    }
    return await detectDefaultInterface();
}

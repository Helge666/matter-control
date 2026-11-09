import { DnsCodec, DnsMessageType, type DnsRecord, DnsRecordClass, DnsRecordType, type DnssdNames } from "@matter/main";
import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";

const MDNS_GROUP = "ff02::fb";
const MDNS_PORT = 5353;
const MATTER_SERVICE = "_matter._tcp.local";

/** How long one lookup listens. Measured replies arrive well within a second. */
const REPLY_WINDOW_MS = 1500;

export interface RediscoveryResult {
    /** Devices that answered: as good as a ping, and it comes with the current addresses. */
    replies: number;
    /** Records handed to matter.js, which are only those belonging to devices it is looking for. */
    installed: number;
}

/**
 * The zone of every adapter that has a link-local address, which is what a link-scoped multicast
 * needs to leave through it. Windows names zones by interface index, everything else by name.
 */
function linkZones(): string[] {
    const zones = new Set<string>();
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family !== "IPv6" || address.internal || !address.address.startsWith("fe80:")) continue;
            zones.add(process.platform === "win32" ? String(address.scopeid) : name);
        }
    }
    return [...zones];
}

/** Ask one adapter who offers Matter, from a throwaway port. Resolves with every record received. */
function askAdapter(zone: string): Promise<{ records: DnsRecord<any>[]; replies: Set<string> }> {
    const query = DnsCodec.encode({
        transactionId: 0,
        messageType: DnsMessageType.Query,
        queries: [{ name: MATTER_SERVICE, recordClass: DnsRecordClass.IN, recordType: DnsRecordType.PTR }],
        answers: [],
        authorities: [],
        additionalRecords: [],
    });

    return new Promise(resolve => {
        const records: DnsRecord<any>[] = [];
        const replies = new Set<string>();
        const socket = createSocket("udp6");
        const finish = () => {
            try {
                socket.close();
            } catch {
                /* already closing */
            }
            resolve({ records, replies });
        };

        socket.on("error", finish);
        socket.on("message", (bytes, { address }) => {
            const message = DnsCodec.decode(bytes);
            if (!message) return;
            records.push(...message.answers, ...message.additionalRecords);
            if (message.answers.length) replies.add(address);
        });
        socket.send(query, MDNS_PORT, `${MDNS_GROUP}%${zone}`);
        setTimeout(finish, REPLY_WINDOW_MS);
    });
}

/**
 * Hand records to matter.js as if they had come in on its own mDNS socket.
 *
 * Only names something is already waiting for are accepted, and a device's address records become
 * relevant only once its service record has named that host — hence the repeated passes.
 */
function install(names: DnssdNames, records: DnsRecord<any>[], zone: string): number {
    const pending = new Set(records);
    let installed = 0;
    let before: number;
    do {
        before = pending.size;
        for (const record of pending) {
            if (!names.has(record.name)) continue;
            names.get(record.name).installRecord(record, { sourceIntf: zone });
            pending.delete(record);
            installed++;
        }
    } while (pending.size < before);
    return installed;
}

/**
 * Find Matter devices with a query matter.js does not send, and feed the answers into its cache.
 *
 * matter.js asks for answers by multicast, and from the LEDVANCE/Tuya lamps those never arrived in
 * testing: 15 seconds of its own active discovery found nothing. Answers sent back by unicast do
 * arrive, and a query from any port but 5353 gets one (RFC 6762 calls that a legacy unicast
 * query). A controller left to its own queries therefore never learns a lamp's address and lives
 * off the last one that worked — fine until that one dies. The stored address is usually
 * link-local, so it carries a Windows interface index, and that index changes when Windows
 * re-enumerates the adapter: the lamp is perfectly reachable, just not at `%22` any more.
 *
 * Installing the records rather than connecting ourselves leaves all of the decisions with
 * matter.js: it retires the dead address, connects to the new one and stores whichever worked.
 */
export async function rediscover(names: DnssdNames): Promise<RediscoveryResult> {
    const result: RediscoveryResult = { replies: 0, installed: 0 };
    await Promise.all(
        linkZones().map(async zone => {
            const { records, replies } = await askAdapter(zone);
            result.replies += replies.size;
            result.installed += install(names, records, zone);
        }),
    );
    return result;
}

import { type Schedule, shouldBeOn } from "../shared/schedule";
import type { MatterService } from "./matter/service";

const TICK_MS = 30_000;

/**
 * Switches the lamps at the edges of the daily window.
 *
 * Deliberately edge-triggered rather than continuous: switching on every tick would override
 * anyone who reached for the toggle in the middle of the evening. The only exception is the
 * first evaluation after start, so that booting the machine inside the window still lights the
 * room — and so that booting before it leaves the lamps alone until the hour arrives.
 */
export class Scheduler {
    #timer?: ReturnType<typeof setInterval>;
    #lastState?: boolean;
    #schedule: Schedule;

    constructor(
        private readonly service: MatterService,
        schedule: Schedule,
        private readonly log: (message: string) => void,
    ) {
        this.#schedule = schedule;
    }

    start() {
        this.stop();
        this.#lastState = undefined;
        this.#timer = setInterval(() => void this.#tick(), TICK_MS);
        void this.#tick();
    }

    stop() {
        if (this.#timer) clearInterval(this.#timer);
        this.#timer = undefined;
    }

    /** Re-evaluate against a changed schedule without treating it as a fresh start. */
    update(schedule: Schedule) {
        this.#schedule = schedule;
        if (!schedule.enabled) {
            this.#lastState = undefined;
            return;
        }
        void this.#tick();
    }

    async #tick() {
        if (!this.#schedule.enabled) return;

        const wanted = shouldBeOn(this.#schedule, new Date());
        if (wanted === this.#lastState) return;

        const first = this.#lastState === undefined;
        this.#lastState = wanted;

        // On the very first evaluation, only act when the lamps should be on. Switching
        // everything off merely because the app started at noon would be presumptuous.
        if (first && !wanted) return;

        this.log(`switching ${wanted ? "on" : "off"}`);
        await this.#applyToAll(wanted);
    }

    /** Drive every controllable endpoint the fabric knows about. */
    async #applyToAll(on: boolean) {
        const jobs: Promise<unknown>[] = [];
        for (const device of this.service.listDevices()) {
            for (const endpoint of device.endpoints) {
                if (!endpoint.capabilities.onOff) continue;
                jobs.push(
                    this.service.setOnOff(device.id, endpoint.number, on).catch(e => {
                        this.log(`${device.name} did not respond (${e?.message ?? e})`);
                    }),
                );
            }
        }
        await Promise.allSettled(jobs);
    }
}

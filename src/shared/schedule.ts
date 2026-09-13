/**
 * Two seasons with their own daily windows.
 *
 * The year is split by two dates; each half carries its own switch-on and switch-off time,
 * because dusk moves: a window starting at 20:00 suits December and is an hour of daylight in
 * June. Dates carry no year, so "winter starts 1 October" is expressed directly.
 *
 * Daily windows may cross midnight, which is the normal case here.
 */

import type { Locale, Translate } from "./i18n/index.ts";
import { type Coordinates, formatClock, isValidCoordinates, sunTimes } from "./sun.ts";

export interface SeasonTimes {
    /** Local wall-clock times, "HH:MM". */
    turnOnAt: string;
    turnOffAt: string;
}

export interface MonthDay {
    month: number;
    day: number;
}

/**
 * How the daily window is decided.
 *
 * "manual" uses the two seasons below. "auto" follows the sun at {@link Schedule.location},
 * computed locally — dusk shifts by nearly four minutes a day around the equinoxes, which fixed
 * times can only approximate.
 */
export type ScheduleMode = "manual" | "auto";

export interface Schedule {
    enabled: boolean;
    mode: ScheduleMode;
    /** The day the winter times take over. */
    winterFrom: MonthDay;
    /** The day the summer times take over. */
    summerFrom: MonthDay;
    winter: SeasonTimes;
    summer: SeasonTimes;

    /** Where the sun is computed for, in "auto" mode. */
    location?: Coordinates;
    /** Minutes relative to sunset; negative switches on before it. */
    onOffsetMinutes: number;
    /** Minutes relative to sunrise; positive switches off after it. */
    offOffsetMinutes: number;
}

export type SeasonId = "winter" | "summer";

export const DEFAULT_SCHEDULE: Schedule = {
    enabled: false,
    mode: "manual",
    onOffsetMinutes: -20,
    offOffsetMinutes: 20,
    winterFrom: { month: 10, day: 1 },
    summerFrom: { month: 4, day: 1 },
    winter: { turnOnAt: "20:00", turnOffAt: "09:00" },
    summer: { turnOnAt: "22:00", turnOffAt: "09:00" },
};

/** Minutes since midnight, or undefined when the text is not a valid time. */
export function parseTime(value: string): number | undefined {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return undefined;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours > 23 || minutes > 59) return undefined;
    return hours * 60 + minutes;
}

/** Sortable day-of-year key that ignores the year, so dates compare cleanly. */
function dayKey(date: MonthDay): number {
    return date.month * 100 + date.day;
}

/**
 * Which season a moment falls into.
 *
 * Winter runs from {@link Schedule.winterFrom} up to the day before
 * {@link Schedule.summerFrom}, wrapping across the new year when it has to.
 */
export function seasonAt(schedule: Schedule, now: Date): SeasonId {
    const today = dayKey({ month: now.getMonth() + 1, day: now.getDate() });
    const winter = dayKey(schedule.winterFrom);
    const summer = dayKey(schedule.summerFrom);

    if (winter === summer) return "winter";
    const inWinter = winter < summer ? today >= winter && today < summer : today >= winter || today < summer;
    return inWinter ? "winter" : "summer";
}

export function timesAt(schedule: Schedule, now: Date): SeasonTimes {
    return schedule[seasonAt(schedule, now)];
}

export function isInWindow(times: SeasonTimes, now: Date): boolean {
    const on = parseTime(times.turnOnAt);
    const off = parseTime(times.turnOffAt);
    if (on === undefined || off === undefined || on === off) return false;

    const minutes = now.getHours() * 60 + now.getMinutes();
    return on < off ? minutes >= on && minutes < off : minutes >= on || minutes < off;
}

/**
 * Whether the lamps should be on right now, following the sun.
 *
 * Evening and morning belong to different calendar days, so the night is judged from today's two
 * events: before this morning's switch-off we are still in last night's window, and from this
 * evening's switch-on the next one begins.
 */
function shouldBeOnAuto(schedule: Schedule, now: Date): boolean {
    if (!isValidCoordinates(schedule.location)) return false;

    const times = sunTimes(now, schedule.location);
    if (times.polar) {
        // Above the polar circles there is no dusk to follow; a lamp is wanted through a polar
        // night and pointless during midnight sun.
        return times.sunset.getTime() === times.sunrise.getTime();
    }

    const on = times.sunset.getTime() + schedule.onOffsetMinutes * 60_000;
    const off = times.sunrise.getTime() + schedule.offOffsetMinutes * 60_000;
    const t = now.getTime();
    return t < off || t >= on;
}

/** Whether the lamps should be on right now. */
export function shouldBeOn(schedule: Schedule, now: Date): boolean {
    if (!schedule.enabled) return false;
    return schedule.mode === "auto" ? shouldBeOnAuto(schedule, now) : isInWindow(timesAt(schedule, now), now);
}

/** The switch-on and switch-off moments of the night {@link now} belongs to, in "auto" mode. */
export function autoTimes(schedule: Schedule, now: Date): { on: Date; off: Date } | undefined {
    if (!isValidCoordinates(schedule.location)) return undefined;
    const times = sunTimes(now, schedule.location);
    if (times.polar) return undefined;
    return {
        on: new Date(times.sunset.getTime() + schedule.onOffsetMinutes * 60_000),
        off: new Date(times.sunrise.getTime() + schedule.offOffsetMinutes * 60_000),
    };
}

/** One line for the tray: what the schedule does today. */
export function describeSchedule(schedule: Schedule, t: Translate, now = new Date()): string {
    if (schedule.mode === "auto") {
        const times = autoTimes(schedule, now);
        return times
            ? t("schedule.describe.sun", { on: formatClock(times.on), off: formatClock(times.off) })
            : t("schedule.describe.sunNoLocation");
    }
    const season = seasonAt(schedule, now);
    const times = schedule[season];
    return t("schedule.describe.season", {
        season: t(`season.${season}`),
        on: times.turnOnAt,
        off: times.turnOffAt,
    });
}

/** Day and month the way the language writes them: "01.10." in German, "10/01" in English. */
export function formatDate(date: MonthDay, locale: Locale): string {
    // Any non-leap year will do; only month and day are shown.
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(
        new Date(2001, date.month - 1, date.day),
    );
}

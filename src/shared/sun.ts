/**
 * Sunrise and sunset from coordinates and a date, computed locally.
 *
 * This is the NOAA approximation, accurate to well under a minute for our purposes and far more
 * than good enough to decide when a lamp should come on. It needs no network, which means the
 * schedule keeps working when the line is down and no one has to be told where the user lives.
 */

const DEG = Math.PI / 180;

/** Solar disc centre at -0.833°, the standard refraction-corrected horizon. */
const HORIZON = -0.833;

const J2000 = 2451545;
const MS_PER_DAY = 86_400_000;
/** Julian date of the Unix epoch. */
const UNIX_EPOCH_JD = 2440587.5;

export interface Coordinates {
    /** Degrees north, -90 to 90. */
    latitude: number;
    /** Degrees east, -180 to 180. */
    longitude: number;
}

export interface SunTimes {
    sunrise: Date;
    sunset: Date;
    /** True when the sun never rises or never sets that day, as it can above the polar circles. */
    polar: boolean;
}

/**
 * Julian day number for a calendar date, anchored at 00:00 UT.
 *
 * Built from Date.UTC rather than from a local Date so the result depends only on the calendar
 * date, not on the machine's offset from UTC. Anchoring on local midnight instead shifts the
 * whole computation into the previous day for anyone east of Greenwich.
 */
function julianDayOf(date: Date): number {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY + UNIX_EPOCH_JD;
}

function fromJulian(julian: number): Date {
    return new Date((julian - UNIX_EPOCH_JD) * MS_PER_DAY);
}

/**
 * Sunrise and sunset for the calendar day {@link date} falls on, at {@link where}.
 *
 * On a polar day or night there is no crossing of the horizon; the returned times then bracket
 * the whole day or none of it, and {@link SunTimes.polar} says which.
 */
export function sunTimes(date: Date, where: Coordinates): SunTimes {
    const days = Math.ceil(julianDayOf(date) - J2000 + 0.0008);
    const meanSolarNoon = days - where.longitude / 360;

    const meanAnomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
    const center =
        1.9148 * Math.sin(meanAnomaly * DEG) +
        0.02 * Math.sin(2 * meanAnomaly * DEG) +
        0.0003 * Math.sin(3 * meanAnomaly * DEG);
    const eclipticLongitude = (meanAnomaly + center + 180 + 102.9372) % 360;

    const transit =
        J2000 +
        meanSolarNoon +
        0.0053 * Math.sin(meanAnomaly * DEG) -
        0.0069 * Math.sin(2 * eclipticLongitude * DEG);

    const declination = Math.asin(Math.sin(eclipticLongitude * DEG) * Math.sin(23.44 * DEG));

    const cosHourAngle =
        (Math.sin(HORIZON * DEG) - Math.sin(where.latitude * DEG) * Math.sin(declination)) /
        (Math.cos(where.latitude * DEG) * Math.cos(declination));

    if (cosHourAngle > 1) {
        // Polar night: the sun stays below the horizon all day.
        const noon = fromJulian(transit);
        return { sunrise: noon, sunset: noon, polar: true };
    }
    if (cosHourAngle < -1) {
        // Midnight sun: it never sets, so the whole local day counts as daylight.
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return {
            sunrise: startOfDay,
            sunset: new Date(startOfDay.getTime() + MS_PER_DAY),
            polar: true,
        };
    }

    const hourAngle = Math.acos(cosHourAngle) / DEG;
    return {
        sunrise: fromJulian(transit - hourAngle / 360),
        sunset: fromJulian(transit + hourAngle / 360),
        polar: false,
    };
}

export function formatClock(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isValidCoordinates(where: Partial<Coordinates> | undefined): where is Coordinates {
    return (
        typeof where?.latitude === "number" &&
        typeof where?.longitude === "number" &&
        Number.isFinite(where.latitude) &&
        Number.isFinite(where.longitude) &&
        Math.abs(where.latitude) <= 90 &&
        Math.abs(where.longitude) <= 180
    );
}

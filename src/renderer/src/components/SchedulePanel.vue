<script setup lang="ts">
import {
    type MonthDay,
    type ScheduleMode,
    type SeasonTimes,
    autoTimes,
    formatDate,
    parseTime,
    seasonAt,
    shouldBeOn,
} from "@shared/schedule";
import { formatClock, isValidCoordinates } from "@shared/sun";
import { computed } from "vue";
import { locale, t } from "../i18n";
import { controller } from "../stores/controller";
import Toggle from "./Toggle.vue";

const schedule = computed(() => controller.state.settings?.schedule);

const now = new Date();
const season = computed(() => (schedule.value ? seasonAt(schedule.value, now) : "winter"));
const active = computed(() => (schedule.value ? shouldBeOn(schedule.value, now) : false));

function patch(values: Record<string, unknown>) {
    if (schedule.value) void controller.updateSettings({ schedule: { ...schedule.value, ...values } });
}

function setTimes(key: "winter" | "summer", field: keyof SeasonTimes, value: string) {
    if (!schedule.value) return;
    patch({ [key]: { ...schedule.value[key], [field]: value } });
}

function setDate(key: "winterFrom" | "summerFrom", value: string) {
    const [y, m, d] = value.split("-").map(Number);
    if (!m || !d) return;
    patch({ [key]: { month: m, day: d } as MonthDay });
}

/** A date input needs a year; any non-leap year works since only month and day are stored. */
function dateValue(date: MonthDay): string {
    return `2001-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

const timeInvalid = (value: string) => parseTime(value) === undefined;

const MODES = [
    { id: "manual", labelKey: "schedule.mode.manual" },
    { id: "auto", labelKey: "schedule.mode.auto" },
] as const satisfies readonly { id: ScheduleMode; labelKey: string }[];

const sun = computed(() => (schedule.value ? autoTimes(schedule.value, now) : undefined));
const hasLocation = computed(() => isValidCoordinates(schedule.value?.location));

function setLocation(field: "latitude" | "longitude", raw: string) {
    if (!schedule.value) return;
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value)) return;
    const current = schedule.value.location ?? { latitude: 0, longitude: 0 };
    patch({ location: { ...current, [field]: value } });
}
</script>

<template>
    <section v-if="schedule" class="surface rounded-[var(--radius-card)] p-5">
        <div class="flex items-start justify-between gap-6">
            <div>
                <h2 class="text-[13px] font-semibold text-ink-100">{{ t("schedule.title") }}</h2>
                <p class="mt-1.5 max-w-md text-[12px] leading-relaxed text-ink-400">
                    {{ t("schedule.intro") }}
                </p>
            </div>
            <Toggle
                :model-value="schedule.enabled"
                :label="t('schedule.enabled')"
                @update:model-value="patch({ enabled: $event })"
            />
        </div>

        <div v-if="schedule.enabled" class="mt-5 space-y-5">
            <p
                class="rounded-lg border px-3 py-2 text-[12px]"
                :class="
                    active
                        ? 'border-glow-500/30 bg-glow-500/10 text-glow-300'
                        : 'border-[var(--hairline)] bg-[var(--surface-1)] text-ink-400'
                "
            >
                {{
                    t(
                        schedule.mode === "auto"
                            ? "schedule.state.sun"
                            : season === "winter"
                              ? "schedule.state.winter"
                              : "schedule.state.summer",
                    )
                }}
                — {{ t(active ? "schedule.state.shouldBeOn" : "schedule.state.shouldBeOff") }}
            </p>

            <div class="grid grid-cols-2 gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-1">
                <button
                    v-for="option in MODES"
                    :key="option.id"
                    class="rounded-md px-3 py-1.5 text-[12px] transition-colors"
                    :class="
                        schedule.mode === option.id
                            ? 'bg-accent-500 font-medium text-white'
                            : 'text-ink-400 hover:bg-[var(--surface-3)] hover:text-ink-100'
                    "
                    @click="patch({ mode: option.id })"
                >
                    {{ t(option.labelKey) }}
                </button>
            </div>

            <!-- Sun-following ------------------------------------------- -->
            <div v-if="schedule.mode === 'auto'" class="space-y-4">
                <div class="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
                    <h3 class="text-[12.5px] font-medium text-ink-100">{{ t("schedule.location") }}</h3>
                    <p class="mt-1 text-[11px] leading-relaxed text-ink-500">
                        {{ t("schedule.locationHint") }}
                    </p>
                    <div class="mt-3 grid grid-cols-2 gap-2">
                        <label class="block text-[11px] text-ink-400">
                            {{ t("schedule.latitude") }}
                            <input
                                inputmode="decimal"
                                placeholder="52.52"
                                class="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-accent-400"
                                :value="schedule.location?.latitude ?? ''"
                                @change="setLocation('latitude', ($event.target as HTMLInputElement).value)"
                            />
                        </label>
                        <label class="block text-[11px] text-ink-400">
                            {{ t("schedule.longitude") }}
                            <input
                                inputmode="decimal"
                                placeholder="13.40"
                                class="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-accent-400"
                                :value="schedule.location?.longitude ?? ''"
                                @change="setLocation('longitude', ($event.target as HTMLInputElement).value)"
                            />
                        </label>
                    </div>
                    <p v-if="!hasLocation" class="mt-2 text-[11.5px] text-warn">
                        {{ t("schedule.locationMissing") }}
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <label class="block text-[11px] text-ink-400">
                        {{ t("schedule.minutesBeforeSunset") }}
                        <input
                            type="number"
                            step="5"
                            class="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-accent-400"
                            :value="-schedule.onOffsetMinutes"
                            @change="patch({ onOffsetMinutes: -Number(($event.target as HTMLInputElement).value) })"
                        />
                    </label>
                    <label class="block text-[11px] text-ink-400">
                        {{ t("schedule.minutesAfterSunrise") }}
                        <input
                            type="number"
                            step="5"
                            class="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-accent-400"
                            :value="schedule.offOffsetMinutes"
                            @change="patch({ offOffsetMinutes: Number(($event.target as HTMLInputElement).value) })"
                        />
                    </label>
                </div>

                <p v-if="sun" class="font-mono text-[11.5px] text-ink-400">
                    {{ t("schedule.today", { on: formatClock(sun.on), off: formatClock(sun.off) }) }}
                </p>
            </div>

            <div v-else class="grid gap-4 sm:grid-cols-2">
                <div
                    v-for="key in (['winter', 'summer'] as const)"
                    :key="key"
                    class="rounded-lg border p-4"
                    :class="
                        season === key
                            ? 'border-accent-500/40 bg-accent-500/6'
                            : 'border-[var(--hairline)] bg-[var(--surface-1)]'
                    "
                >
                    <div class="flex items-baseline justify-between">
                        <h3 class="text-[12.5px] font-medium text-ink-100">
                            {{ t(`season.${key}`) }}
                        </h3>
                        <span v-if="season === key" class="font-mono text-[10px] text-accent-300">{{ t("schedule.current") }}</span>
                    </div>

                    <label class="mt-3 block text-[11px] text-ink-400">
                        {{ t("schedule.from") }}
                        <input
                            type="date"
                            class="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none focus:border-accent-400"
                            :value="dateValue(key === 'winter' ? schedule.winterFrom : schedule.summerFrom)"
                            @change="
                                setDate(
                                    key === 'winter' ? 'winterFrom' : 'summerFrom',
                                    ($event.target as HTMLInputElement).value,
                                )
                            "
                        />
                        <span class="mt-1 block text-[10.5px] text-ink-600">
                            {{
                                t("schedule.yearIgnored", {
                                    date: formatDate(key === "winter" ? schedule.winterFrom : schedule.summerFrom, locale),
                                })
                            }}
                        </span>
                    </label>

                    <div class="mt-3 grid grid-cols-2 gap-2">
                        <label class="block text-[11px] text-ink-400">
                            {{ t("schedule.onAt") }}
                            <input
                                type="time"
                                class="mt-1 w-full rounded-md border bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none"
                                :class="
                                    timeInvalid(schedule[key].turnOnAt)
                                        ? 'border-bad/60'
                                        : 'border-[var(--hairline-strong)] focus:border-accent-400'
                                "
                                :value="schedule[key].turnOnAt"
                                @change="setTimes(key, 'turnOnAt', ($event.target as HTMLInputElement).value)"
                            />
                        </label>
                        <label class="block text-[11px] text-ink-400">
                            {{ t("schedule.offAt") }}
                            <input
                                type="time"
                                class="mt-1 w-full rounded-md border bg-ink-950/55 px-2 py-1.5 font-mono text-[12px] text-ink-100 outline-none"
                                :class="
                                    timeInvalid(schedule[key].turnOffAt)
                                        ? 'border-bad/60'
                                        : 'border-[var(--hairline-strong)] focus:border-accent-400'
                                "
                                :value="schedule[key].turnOffAt"
                                @change="setTimes(key, 'turnOffAt', ($event.target as HTMLInputElement).value)"
                            />
                        </label>
                    </div>
                </div>
            </div>

            <p class="text-[11.5px] leading-relaxed text-ink-500">
                {{ t("schedule.footer") }}
            </p>
        </div>
    </section>
</template>

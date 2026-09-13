<script setup lang="ts">
import { MIC_PATTERNS } from "@shared/mood";
import type { DeviceState, EndpointState } from "@shared/types";
import { Check, ChevronDown, Lightbulb, MoreHorizontal, Pencil, RefreshCw, Sparkles, Trash2, Zap } from "lucide-vue-next";
import { computed, ref } from "vue";
import { t } from "../i18n";
import { controller } from "../stores/controller";
import ModeSwitch from "./ModeSwitch.vue";
import MoodPanel from "./MoodPanel.vue";
import Slider from "./Slider.vue";
import Toggle from "./Toggle.vue";

const props = defineProps<{ device: DeviceState }>();

const menuOpen = ref(false);
const editing = ref(false);
const moodOpen = ref(false);
const draftName = ref("");

/** Endpoints worth rendering: those that can actually be driven. */
const liveEndpoints = computed(() =>
    props.device.endpoints.filter(ep => Object.values(ep.capabilities).some(Boolean)),
);

const anyOn = computed(() => liveEndpoints.value.some(ep => ep.onOff));

/** The endpoint carrying the manufacturer cluster for dynamic moods, if any. */
const moodEndpoint = computed(() => props.device.endpoints.find(ep => ep.capabilities.mood));

/** Approximate the light's colour so the card reflects what the lamp is doing. */
function miredSwatch(mireds: number) {
    const kelvin = Math.round(1_000_000 / Math.max(mireds, 1));
    const ratio = Math.min(1, Math.max(0, (kelvin - 2000) / 4500));
    const warm = [255, 170, 85];
    const cool = [210, 231, 255];
    const mix = warm.map((c, i) => Math.round(c + (cool[i] - c) * ratio));
    return `rgb(${mix.join(" ")})`;
}

/**
 * The slider works in Kelvin, not mireds: warm on the left, cool on the right is what people
 * expect, and mireds run the other way. Conversion happens on commit.
 */
const KELVIN = {
    min: (ep: EndpointState) => Math.round(1_000_000 / (ep.colorTempMaxMireds ?? 500)),
    max: (ep: EndpointState) => Math.round(1_000_000 / (ep.colorTempMinMireds ?? 153)),
    of: (ep: EndpointState) => Math.round(1_000_000 / Math.max(ep.colorTemperatureMireds ?? 370, 1)),
};

function ctTrack(ep: EndpointState, kelvin: number) {
    if (!ep.onOff) return mutedTrack(KELVIN.min(ep), KELVIN.max(ep), kelvin);
    return `linear-gradient(to right, ${miredSwatch(ep.colorTempMaxMireds ?? 500)}, ${miredSwatch(
        ep.colorTempMinMireds ?? 153,
    )})`;
}

function levelTrack(ep: EndpointState, value: number) {
    if (!ep.onOff) return mutedTrack(1, 254, value);
    const pct = (value / 254) * 100;
    return `linear-gradient(to right, var(--color-glow-500) 0%, var(--color-glow-300) ${pct}%, var(--surface-3) ${pct}%)`;
}

/** A colourless fill, so a switched-off lamp does not advertise colours it is not emitting. */
function mutedTrack(min: number, max: number, value: number) {
    const pct = Math.min(100, Math.max(0, ((value - min) / (max - min || 1)) * 100));
    return `linear-gradient(to right, var(--color-ink-600) 0%, var(--color-ink-600) ${pct}%, var(--surface-3) ${pct}%)`;
}

function startRename() {
    draftName.value = props.device.name;
    editing.value = true;
    menuOpen.value = false;
}

async function commitRename() {
    editing.value = false;
    if (draftName.value.trim() && draftName.value !== props.device.name) {
        await controller.rename(props.device.id, draftName.value);
    }
}

async function forget() {
    menuOpen.value = false;
    await controller.forget(props.device.id);
}
</script>

<template>
    <article
        class="surface relative overflow-hidden rounded-[var(--radius-card)] transition-all duration-300"
        :class="
            anyOn
                ? 'border-glow-500/25 shadow-[var(--shadow-lift)]'
                : 'hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-2)]'
        "
    >
        <!-- Warm wash while the light is on. -->
        <div
            class="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-0 transition-opacity duration-500"
            :class="anyOn && 'opacity-100'"
            style="background: radial-gradient(ellipse at 50% 0%, rgb(245 165 36 / 0.16), transparent 70%)"
        />

        <header class="relative flex items-start gap-3 px-4 pt-4">
            <div
                class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg transition-colors"
                :class="anyOn ? 'bg-glow-500/18 text-glow-300' : 'bg-[var(--surface-2)] text-ink-400'"
            >
                <Lightbulb :size="17" :stroke-width="1.8" />
            </div>

            <div class="min-w-0 flex-1">
                <div v-if="editing" class="flex items-center gap-1.5">
                    <input
                        v-model="draftName"
                        class="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-ink-900/70 px-2 py-1 font-display text-[15px] text-ink-50 outline-none focus:border-accent-400"
                        autofocus
                        @keydown.enter="commitRename"
                        @keydown.esc="editing = false"
                    />
                    <button
                        class="grid size-7 place-items-center rounded-md text-ink-300 hover:bg-[var(--surface-3)] hover:text-ink-50"
                        @click="commitRename"
                    >
                        <Check :size="15" />
                    </button>
                </div>
                <h3 v-else class="truncate font-display text-[15px] leading-tight font-semibold text-ink-50">
                    {{ props.device.name }}
                </h3>

                <p class="mt-1 flex items-center gap-1.5 truncate text-[11.5px] text-ink-400">
                    <span
                        class="size-1.5 shrink-0 rounded-full"
                        :class="props.device.online ? 'bg-ok' : 'bg-ink-500'"
                    />
                    <span>{{ t(props.device.online ? "card.reachable" : "card.offline") }}</span>
                    <span class="text-ink-600">·</span>
                    <span class="truncate">{{ liveEndpoints[0]?.deviceType ?? t("card.genericDevice") }}</span>
                </p>
            </div>

            <div class="relative shrink-0">
                <button
                    class="grid size-7 place-items-center rounded-md text-ink-400 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-100"
                    :aria-label="t('card.moreActions')"
                    @click="menuOpen = !menuOpen"
                >
                    <MoreHorizontal :size="16" />
                </button>
                <div
                    v-if="menuOpen"
                    class="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-lg border border-[var(--hairline-strong)] bg-ink-900/96 py-1 shadow-[var(--shadow-lift)] backdrop-blur-xl"
                    @mouseleave="menuOpen = false"
                >
                    <button
                        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-ink-200 hover:bg-[var(--surface-3)]"
                        @click="startRename"
                    >
                        <Pencil :size="14" /> {{ t("card.rename") }}
                    </button>
                    <button
                        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-ink-200 hover:bg-[var(--surface-3)]"
                        @click="
                            menuOpen = false;
                            controller.identify(props.device.id, liveEndpoints[0]?.number ?? 1);
                        "
                    >
                        <Zap :size="14" /> {{ t("card.identify") }}
                    </button>
                    <button
                        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-ink-200 hover:bg-[var(--surface-3)]"
                        @click="
                            menuOpen = false;
                            controller.refresh(props.device.id);
                        "
                    >
                        <RefreshCw :size="14" /> {{ t("card.refresh") }}
                    </button>
                    <div class="my-1 h-px bg-[var(--hairline)]" />
                    <button
                        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-bad hover:bg-bad/12"
                        @click="forget"
                    >
                        <Trash2 :size="14" /> {{ t("card.forget") }}
                    </button>
                </div>
            </div>
        </header>

        <div class="relative space-y-4 px-4 pt-4 pb-4">
            <section v-for="ep in liveEndpoints" :key="ep.number" class="space-y-3.5">
                <div v-if="liveEndpoints.length > 1" class="text-[10.5px] font-medium tracking-wide text-ink-500 uppercase">
                    {{ t("card.endpoint", { number: ep.number }) }}
                </div>

                <div v-if="ep.capabilities.onOff" class="flex items-center justify-between gap-3">
                    <span class="text-[13px] text-ink-200">{{ t(ep.onOff ? "card.on" : "card.off") }}</span>
                    <Toggle
                        warm
                        :model-value="Boolean(ep.onOff)"
                        :disabled="!props.device.online"
                        :label="t('card.power')"
                        @update:model-value="controller.setOnOff(props.device.id, ep.number, $event)"
                    />
                </div>

                <!-- Sliders send on every move as well as on release: the store coalesces those
                     into one in-flight command per control, so the lamp tracks the finger. -->
                <Slider
                    v-if="ep.capabilities.level"
                    :label="t('card.brightness')"
                    :model-value="ep.level ?? 0"
                    :min="1"
                    :max="254"
                    :disabled="!props.device.online"
                    :format="v => `${Math.round((v / 254) * 100)}%`"
                    :track="v => levelTrack(ep, v)"
                    @update:model-value="controller.setLevel(props.device.id, ep.number, $event)"
                    @commit="controller.setLevel(props.device.id, ep.number, $event)"
                />

                <Slider
                    v-if="ep.capabilities.colorTemperature"
                    :label="t('card.colorTemperature')"
                    :model-value="KELVIN.of(ep)"
                    :min="KELVIN.min(ep)"
                    :max="KELVIN.max(ep)"
                    :step="50"
                    :disabled="!props.device.online"
                    :format="v => `${v} K`"
                    :track="v => ctTrack(ep, v)"
                    @update:model-value="
                        controller.setColorTemperature(props.device.id, ep.number, 1_000_000 / $event)
                    "
                    @commit="controller.setColorTemperature(props.device.id, ep.number, 1_000_000 / $event)"
                />

                <Slider
                    v-if="ep.capabilities.colorHueSat"
                    :label="t('card.color')"
                    :model-value="ep.hue ?? 0"
                    :min="0"
                    :max="254"
                    :disabled="!props.device.online"
                    :format="v => `${Math.round((v / 254) * 360)}°`"
                    :track="
                        () => 'linear-gradient(to right,#ff5b5b,#ffd24a,#5bff8f,#4ad9ff,#6a72ff,#ff5bd8,#ff5b5b)'
                    "
                    @update:model-value="
                        controller.setHueSaturation(props.device.id, ep.number, $event, ep.saturation ?? 254)
                    "
                    @commit="controller.setHueSaturation(props.device.id, ep.number, $event, ep.saturation ?? 254)"
                />
            </section>
        </div>

        <div v-if="moodEndpoint" class="relative border-t border-[var(--hairline)] px-4 py-3.5">
            <ModeSwitch
                :current="moodEndpoint.lampMode"
                :disabled="!props.device.online"
                @select="controller.setLampMode(props.device.id, moodEndpoint!.number, $event)"
            />

            <!-- Only meaningful while the lamp is listening. -->
            <div v-if="moodEndpoint.lampMode === 'microphone'" class="mt-3 space-y-1.5">
                <p class="text-[11.5px] text-ink-400">{{ t("card.micDisplay") }}</p>
                <div class="grid grid-cols-2 gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-1 sm:grid-cols-4">
                    <button
                        v-for="pattern in MIC_PATTERNS"
                        :key="pattern.value"
                        :title="t(`micPattern.${pattern.id}.hint`)"
                        :disabled="!props.device.online"
                        class="rounded-md px-2 py-1.5 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        :class="
                            moodEndpoint.micPattern === pattern.value
                                ? 'bg-accent-500 font-medium text-white'
                                : 'text-ink-400 hover:bg-[var(--surface-3)] hover:text-ink-100'
                        "
                        @click="controller.setMicPattern(props.device.id, moodEndpoint!.number, pattern.value)"
                    >
                        {{ t(`micPattern.${pattern.id}.label`) }}
                    </button>
                </div>
            </div>
        </div>

        <button
            v-if="moodEndpoint"
            class="relative flex w-full items-center justify-between gap-2 border-t border-[var(--hairline)] px-4 py-2.5 text-left text-[12px] transition-colors hover:bg-[var(--surface-2)]"
            :class="moodOpen ? 'text-ink-50' : 'text-ink-300'"
            @click="moodOpen = !moodOpen"
        >
            <span class="flex items-center gap-2">
                <Sparkles :size="13" :class="moodOpen ? 'text-accent-300' : 'text-ink-500'" />
                {{ t("card.mood") }}
            </span>
            <ChevronDown :size="14" class="transition-transform" :class="moodOpen && 'rotate-180'" />
        </button>

        <MoodPanel
            v-if="moodEndpoint && moodOpen"
            :device-id="props.device.id"
            :endpoint="moodEndpoint.number"
            :online="props.device.online"
            :active="moodEndpoint.lampMode === 'mood'"
            @activate="controller.setLampMode(props.device.id, moodEndpoint!.number, 'mood')"
        />

        <footer
            class="relative flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-2.5 font-mono text-[10.5px] text-ink-500"
        >
            <span>{{ props.device.nodeId }}</span>
            <span class="text-ink-700">|</span>
            <span class="truncate">{{ props.device.addresses[0] ?? t("card.noAddress") }}</span>
            <span v-if="props.device.vendorName" class="ml-auto shrink-0 truncate">
                {{ props.device.vendorName }}
            </span>
        </footer>
    </article>
</template>

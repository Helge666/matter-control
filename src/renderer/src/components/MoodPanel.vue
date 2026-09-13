<script setup lang="ts">
import { MAX_COLORS, MOOD_MODE_IDS, type Mood, moodColorCss } from "@shared/mood";
import { findPreset } from "@shared/presets";
import { BookmarkPlus, Loader2, Lock, Plus, Sparkles, Trash2, Wand2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { t } from "../i18n";
import { controller } from "../stores/controller";
import Slider from "./Slider.vue";
import Toggle from "./Toggle.vue";

const props = defineProps<{ deviceId: string; endpoint: number; online: boolean; active: boolean }>();
const emit = defineEmits<{ activate: [] }>();

const mood = ref<Mood>();
const loading = ref(false);
const loadError = ref("");
/** Index of the colour whose hue the picker is editing. */
const selected = ref(0);


const presetName = ref("");
const chosenPreset = ref("");
const presets = computed(() => controller.state.presets);

async function load() {
    loading.value = true;
    loadError.value = "";
    try {
        mood.value = await controller.readMood(props.deviceId, props.endpoint);
        selected.value = 0;
        // Name the running mood again if it is a stored one; otherwise leave the choice empty.
        const match = findPreset(presets.value, mood.value);
        chosenPreset.value = match?.id ?? "";
        if (match) presetName.value = match.name;
    } catch (e) {
        loadError.value = e instanceof Error ? e.message : String(e);
    } finally {
        loading.value = false;
    }
}

watch(() => [props.deviceId, props.endpoint], load, { immediate: true });

/** Push the edited mood to the lamp. The store throttles, so calling on every move is fine. */
function push() {
    if (mood.value) controller.writeMood(props.deviceId, props.endpoint, mood.value);
}

function patch(values: Partial<Mood>) {
    if (!mood.value) return;
    mood.value = { ...mood.value, ...values };
    push();
}

function setColor(index: number, hue: number, saturation?: number) {
    if (!mood.value) return;
    const colors = mood.value.colors.map((c, i) =>
        i === index ? { hue, saturation: saturation ?? c.saturation } : c,
    );
    patch({ colors });
}

function addColor() {
    if (!mood.value || mood.value.colors.length >= MAX_COLORS) return;
    const next = [...mood.value.colors, { hue: 200, saturation: 100 }];
    selected.value = next.length - 1;
    patch({ colors: next });
}

function removeColor(index: number) {
    if (!mood.value || mood.value.colors.length <= 1) return;
    const colors = mood.value.colors.filter((_, i) => i !== index);
    selected.value = Math.min(selected.value, colors.length - 1);
    patch({ colors });
}

const active = computed(() => mood.value?.colors[selected.value]);

// --- Presets ---------------------------------------------------------
const chosen = computed(() => presets.value.find(p => p.id === chosenPreset.value));

/** Apply a stored preset, keeping this lamp's own header bytes. */
function applyPreset(id: string) {
    chosenPreset.value = id;
    const preset = presets.value.find(p => p.id === id);
    if (!preset || !mood.value) return;
    presetName.value = preset.name;
    mood.value = { ...preset.mood, opaque: mood.value.opaque };
    selected.value = 0;
    push();
}

async function savePreset() {
    if (!mood.value || !presetName.value.trim()) return;
    await controller.savePreset(presetName.value, mood.value);
    chosenPreset.value = presets.value.find(p => p.name === presetName.value.trim())?.id ?? "";
}


</script>

<template>
    <section class="space-y-4 border-t border-[var(--hairline)] px-4 py-4">
        <div class="flex items-center justify-between gap-3">
            <h4 class="flex items-center gap-2 text-[12.5px] font-medium text-ink-100">
                <Sparkles :size="14" class="text-accent-300" /> {{ t("mood.title") }}
            </h4>
            <button
                class="flex items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-2 py-1 text-[11.5px] text-ink-300 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-50"
                @click="load"
            >
                <Loader2 v-if="loading" :size="12" class="animate-spin" />
                <Wand2 v-else :size="12" />
                {{ t("mood.reread") }}
            </button>
        </div>

        <div
            v-if="!props.active && mood"
            class="flex items-center justify-between gap-3 rounded-lg border border-accent-500/30 bg-accent-500/8 px-3 py-2.5"
        >
            <p class="text-[11.5px] leading-relaxed text-ink-300">
                {{ t("mood.notRunning") }}
            </p>
            <button
                class="shrink-0 rounded-md bg-accent-500 px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-accent-400"
                @click="emit('activate')"
            >
                {{ t("mood.start") }}
            </button>
        </div>

        <p v-if="loadError || (!loading && !mood)" class="text-[11.5px] leading-relaxed text-ink-500">
            {{ loadError || t("mood.noMood") }}
        </p>

        <template v-else-if="mood">
            <!-- Presets --------------------------------------------------- -->
            <div class="space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
                <div class="flex items-center gap-2">
                    <select
                        class="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 text-[12px] text-ink-100 outline-none focus:border-accent-400"
                        :disabled="!props.online || !presets.length"
                        :value="chosenPreset"
                        @change="applyPreset(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="" disabled>
                            {{ t(presets.length ? "mood.presetPlaceholder" : "mood.presetNone") }}
                        </option>
                        <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                            {{ preset.factory ? "★ " : "" }}{{ preset.name }}
                        </option>
                    </select>
                    <button
                        v-if="chosen && !chosen.factory"
                        class="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-2)] text-ink-400 transition-colors hover:bg-bad/12 hover:text-bad"
                        :title="t('mood.presetDelete')"
                        @click="controller.deletePreset(chosen!.id)"
                    >
                        <Trash2 :size="13" />
                    </button>
                    <span
                        v-else-if="chosen?.factory"
                        class="grid size-8 shrink-0 place-items-center text-ink-600"
                        :title="t('mood.presetLocked')"
                    >
                        <Lock :size="13" />
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <input
                        v-model="presetName"
                        :placeholder="t('mood.presetNamePlaceholder')"
                        class="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-ink-950/55 px-2 py-1.5 text-[12px] text-ink-100 outline-none placeholder:text-ink-600 focus:border-accent-400"
                        @keydown.enter="savePreset"
                    />
                    <button
                        class="flex shrink-0 items-center gap-1.5 rounded-md bg-accent-500 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
                        :disabled="!presetName.trim() || !props.online"
                        @click="savePreset"
                    >
                        <BookmarkPlus :size="13" /> {{ t("mood.save") }}
                    </button>
                </div>
            </div>

            <!-- Colour list --------------------------------------------- -->
            <div class="space-y-2">
                <div class="flex items-baseline justify-between text-[11.5px]">
                    <span class="text-ink-400">{{ t("mood.colors") }}</span>
                    <span class="font-mono text-ink-500 tabular-nums">
                        {{ mood.colors.length }} / {{ MAX_COLORS }}
                    </span>
                </div>

                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="(color, i) in mood.colors"
                        :key="i"
                        class="group relative h-9 w-9 rounded-md border-2 transition-all"
                        :class="
                            selected === i
                                ? 'border-white/80 shadow-[0_0_0_2px_var(--color-accent-500)]'
                                : 'border-white/15 hover:border-white/40'
                        "
                        :style="{ background: moodColorCss(color) }"
                        :title="t('mood.colorTitle', { hue: color.hue, saturation: color.saturation })"
                        @click="selected = i"
                    >
                        <span
                            v-if="mood.colors.length > 1"
                            class="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-ink-900 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
                            role="button"
                            :aria-label="t('mood.removeColor')"
                            @click.stop="removeColor(i)"
                        >
                            <Trash2 :size="9" />
                        </span>
                    </button>

                    <button
                        v-if="mood.colors.length < MAX_COLORS"
                        class="grid h-9 w-9 place-items-center rounded-md border-2 border-dashed border-[var(--hairline-strong)] text-ink-500 transition-colors hover:border-accent-400 hover:text-accent-300"
                        :aria-label="t('mood.addColor')"
                        @click="addColor"
                    >
                        <Plus :size="14" />
                    </button>
                </div>
            </div>

            <!-- Selected colour ------------------------------------------ -->
            <div v-if="active" class="space-y-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
                <Slider
                    :label="t('mood.hue', { number: selected + 1 })"
                    :model-value="active.hue"
                    :min="0"
                    :max="360"
                    :disabled="!props.online"
                    :format="v => `${v}°`"
                    :track="
                        () => 'linear-gradient(to right,#ff5b5b,#ffd24a,#5bff8f,#4ad9ff,#6a72ff,#ff5bd8,#ff5b5b)'
                    "
                    @update:model-value="setColor(selected, $event)"
                    @commit="setColor(selected, $event)"
                />
                <Slider
                    :label="t('mood.saturation', { number: selected + 1 })"
                    :model-value="active.saturation"
                    :min="0"
                    :max="100"
                    :disabled="!props.online"
                    :format="v => (v === 0 ? t('mood.white') : `${v} %`)"
                    :track="
                        v =>
                            `linear-gradient(to right, ${moodColorCss({ hue: active!.hue, saturation: 0 })}, ${moodColorCss({ hue: active!.hue, saturation: 100 })} ${v}%, var(--surface-3) ${v}%)`
                    "
                    @update:model-value="setColor(selected, active!.hue, $event)"
                    @commit="setColor(selected, active!.hue, $event)"
                />
            </div>

            <!-- Movement -------------------------------------------------- -->
            <div class="space-y-2">
                <label class="block text-[11.5px] text-ink-400">{{ t("mood.movement") }}</label>
                <select
                    class="w-full rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-accent-400"
                    :disabled="!props.online"
                    :value="mood.mode"
                    @change="patch({ mode: Number(($event.target as HTMLSelectElement).value) })"
                >
                    <option v-for="id in MOOD_MODE_IDS" :key="id" :value="id">{{ t(`moodMode.${id}`) }}</option>
                </select>
            </div>

            <Slider
                :label="t('mood.speed')"
                :model-value="mood.speed"
                :min="0"
                :max="100"
                :disabled="!props.online"
                :format="v => `${v} %`"
                @update:model-value="patch({ speed: $event })"
                @commit="patch({ speed: $event })"
            />

            <Slider
                :label="t('mood.brightness')"
                :model-value="mood.brightness"
                :min="1"
                :max="100"
                :disabled="!props.online"
                :format="v => `${v} %`"
                @update:model-value="patch({ brightness: $event })"
                @commit="patch({ brightness: $event })"
            />

            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[12px] text-ink-200">{{ t("mood.topDown") }}</p>
                    <p class="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                        {{ t("mood.topDownHint") }}
                    </p>
                </div>
                <Toggle
                    :model-value="mood.topDown"
                    :disabled="!props.online"
                    :label="t('mood.topDown')"
                    @update:model-value="patch({ topDown: $event })"
                />
            </div>

            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-[12px] text-ink-200">{{ t("mood.segmented") }}</p>
                    <p class="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                        {{ t("mood.segmentedHint") }}
                    </p>
                </div>
                <Toggle
                    :model-value="mood.segmented"
                    :disabled="!props.online"
                    :label="t('mood.segmented')"
                    @update:model-value="patch({ segmented: $event })"
                />
            </div>
        </template>

        <p v-else-if="loading" class="text-[11.5px] text-ink-500">{{ t("mood.loading") }}</p>
    </section>
</template>

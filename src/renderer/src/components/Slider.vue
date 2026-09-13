<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
    defineProps<{
        modelValue: number;
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        label: string;
        /** Formats the live value for the readout above the track. */
        format?: (value: number) => string;
        /** CSS background for the track, given the live value. */
        track?: (value: number) => string;
        /**
         * How long to keep showing the user's value after they let go.
         *
         * A lamp reports `currentLevel` while it changes, and those reports would otherwise
         * drag the thumb along behind the device. Commands apply immediately, so this only has
         * to cover the round trip; long enough to bridge it, short enough that a change made
         * elsewhere shows up promptly.
         */
        settleMs?: number;
    }>(),
    { min: 0, max: 100, step: 1, settleMs: 1500 },
);

const emit = defineEmits<{ "update:modelValue": [number]; commit: [number] }>();

/** The value this slider renders. Owned by the user while interacting, by the device otherwise. */
const local = ref(props.modelValue);
const interacting = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;

function clearSettle() {
    if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
    }
}

// Accept device updates only when the user is not holding the control and the settle window
// from the last commit has passed.
watch(
    () => props.modelValue,
    value => {
        if (!interacting.value && settleTimer === undefined) local.value = value;
    },
);

function onInput(event: Event) {
    interacting.value = true;
    clearSettle();
    local.value = Number((event.target as HTMLInputElement).value);
    emit("update:modelValue", local.value);
}

function onChange(event: Event) {
    interacting.value = false;
    local.value = Number((event.target as HTMLInputElement).value);
    emit("commit", local.value);

    clearSettle();
    settleTimer = setTimeout(() => {
        settleTimer = undefined;
        // Snap to whatever the device actually settled on; usually identical.
        local.value = props.modelValue;
    }, props.settleMs);
}

onBeforeUnmount(clearSettle);

const pct = computed(() => {
    const span = props.max - props.min || 1;
    return Math.min(100, Math.max(0, ((local.value - props.min) / span) * 100));
});

const display = computed(() => (props.format ? props.format(local.value) : String(local.value)));

const trackStyle = computed(() => ({
    background:
        props.track?.(local.value) ??
        `linear-gradient(to right, var(--color-accent-500) 0%, var(--color-accent-400) ${pct.value}%, var(--surface-3) ${pct.value}%, var(--surface-3) 100%)`,
}));
</script>

<template>
    <div class="space-y-1.5">
        <div class="flex items-baseline justify-between text-[11.5px]">
            <span class="text-ink-400">{{ props.label }}</span>
            <span class="font-mono text-ink-200 tabular-nums">{{ display }}</span>
        </div>

        <div class="group relative flex h-6 items-center" :class="props.disabled && 'opacity-40'">
            <div class="pointer-events-none absolute inset-x-0 h-1.5 rounded-full" :style="trackStyle" />
            <div
                class="pointer-events-none absolute size-4 -translate-x-1/2 rounded-full border-2 border-white/90 bg-ink-900 shadow-md transition-transform group-hover:scale-115"
                :style="{ left: `${pct}%` }"
            />
            <input
                type="range"
                class="absolute inset-x-0 h-6 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none"
                :min="props.min"
                :max="props.max"
                :step="props.step"
                :value="local"
                :disabled="props.disabled"
                :aria-label="props.label"
                @input="onInput"
                @change="onChange"
            />
        </div>
    </div>
</template>

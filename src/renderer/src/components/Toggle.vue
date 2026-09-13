<script setup lang="ts">
const props = defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    /** Use the warm "light is on" accent instead of the neutral chrome accent. */
    warm?: boolean;
    label?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="props.modelValue"
        :aria-label="props.label"
        :disabled="props.disabled"
        class="relative h-7 w-12 shrink-0 rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
        :class="
            props.modelValue
                ? props.warm
                    ? 'border-glow-400/60 bg-glow-500/85 shadow-[0_0_16px_-2px_var(--color-glow-500)]'
                    : 'border-accent-400/60 bg-accent-500'
                : 'border-[var(--hairline-strong)] bg-[var(--surface-3)] hover:bg-white/12'
        "
        @click="emit('update:modelValue', !props.modelValue)"
    >
        <span
            class="absolute top-1/2 block size-5 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200"
            :class="props.modelValue ? 'left-6 bg-white' : 'left-1 bg-ink-300'"
        />
    </button>
</template>

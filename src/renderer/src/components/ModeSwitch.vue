<script setup lang="ts">
import { LAMP_MODES, type LampMode } from "@shared/mood";
import { Mic, Palette, Sparkles, Sun } from "lucide-vue-next";
import { t } from "../i18n";

const props = defineProps<{ current?: LampMode; disabled?: boolean }>();
const emit = defineEmits<{ select: [LampMode] }>();

const ICONS: Record<LampMode, typeof Sun> = {
    white: Sun,
    color: Palette,
    mood: Sparkles,
    microphone: Mic,
};
</script>

<template>
    <div class="space-y-1.5">
        <p class="text-[11.5px] text-ink-400">{{ t("lampMode.title") }}</p>
        <div
            class="grid grid-cols-4 gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-1"
            role="radiogroup"
            :aria-label="t('lampMode.title')"
        >
            <button
                v-for="mode in LAMP_MODES"
                :key="mode.id"
                role="radio"
                :aria-checked="props.current === mode.id"
                :disabled="props.disabled"
                :title="t(`lampMode.${mode.id}.hint`)"
                class="flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                    props.current === mode.id
                        ? 'bg-accent-500 font-medium text-white'
                        : 'text-ink-400 hover:bg-[var(--surface-3)] hover:text-ink-100'
                "
                @click="emit('select', mode.id)"
            >
                <component :is="ICONS[mode.id]" :size="14" :stroke-width="1.9" />
                {{ t(`lampMode.${mode.id}.label`) }}
            </button>
        </div>
    </div>
</template>

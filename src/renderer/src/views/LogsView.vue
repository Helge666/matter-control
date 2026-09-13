<script setup lang="ts">
import type { LogLevel } from "@shared/types";
import { Trash2 } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { locale, t } from "../i18n";
import { controller } from "../stores/controller";

const filter = ref("");
const minLevel = ref<LogLevel>("info");
const follow = ref(true);
const scroller = ref<HTMLElement>();

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const LEVEL_STYLE: Record<LogLevel, string> = {
    debug: "text-ink-500",
    info: "text-accent-300",
    warn: "text-warn",
    error: "text-bad",
};

const visible = computed(() => {
    const needle = filter.value.toLowerCase();
    return controller.state.logs.filter(
        e =>
            RANK[e.level] >= RANK[minLevel.value] &&
            (!needle || e.message.toLowerCase().includes(needle) || e.facility.toLowerCase().includes(needle)),
    );
});

watch(
    () => controller.state.logs.length,
    async () => {
        if (!follow.value) return;
        await nextTick();
        if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
    },
);

function time(at: number) {
    return new Date(at).toLocaleTimeString(locale.value, { hour12: false }) + "." + String(at % 1000).padStart(3, "0");
}
</script>

<template>
    <div class="flex h-full flex-col">
        <header class="flex flex-wrap items-end justify-between gap-3 px-7 pt-6 pb-4">
            <div>
                <h1 class="font-display text-[22px] leading-tight font-semibold text-ink-50">{{ t("logs.title") }}</h1>
                <p class="mt-1 text-[12.5px] text-ink-400">
                    {{ t("logs.summary", { visible: visible.length, total: controller.state.logs.length }) }}
                </p>
            </div>

            <div class="flex items-center gap-2">
                <input
                    v-model="filter"
                    :placeholder="t('logs.filter')"
                    class="w-44 rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-3 py-1.5 text-[12.5px] text-ink-50 outline-none placeholder:text-ink-600 focus:border-accent-400"
                />
                <select
                    v-model="minLevel"
                    class="rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-2.5 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-accent-400"
                >
                    <option value="debug">debug+</option>
                    <option value="info">info+</option>
                    <option value="warn">warn+</option>
                    <option value="error">error</option>
                </select>
                <label
                    class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-ink-200"
                >
                    <input v-model="follow" type="checkbox" class="accent-[var(--color-accent-500)]" /> {{ t("logs.follow") }}
                </label>
                <button
                    class="grid size-8 place-items-center rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] text-ink-300 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-50"
                    :aria-label="t('logs.clear')"
                    @click="controller.clearLogs()"
                >
                    <Trash2 :size="14" />
                </button>
            </div>
        </header>

        <div class="min-h-0 flex-1 px-7 pb-7">
            <div
                ref="scroller"
                class="surface h-full overflow-y-auto rounded-[var(--radius-card)] px-1 py-1 font-mono text-[11.5px] leading-[1.65]"
            >
                <div
                    v-for="entry in visible"
                    :key="entry.id"
                    class="flex gap-3 rounded px-2.5 py-0.5 hover:bg-[var(--surface-2)]"
                >
                    <span class="shrink-0 text-ink-600 tabular-nums">{{ time(entry.at) }}</span>
                    <span class="w-11 shrink-0 uppercase" :class="LEVEL_STYLE[entry.level]">{{ entry.level }}</span>
                    <span class="w-40 shrink-0 truncate text-ink-400">{{ entry.facility }}</span>
                    <span class="min-w-0 flex-1 break-words whitespace-pre-wrap text-ink-200">
                        {{ entry.message }}
                    </span>
                </div>
                <p v-if="!visible.length" class="grid h-full place-items-center text-ink-600">
                    {{ t("logs.empty") }}
                </p>
            </div>
        </div>
    </div>
</template>

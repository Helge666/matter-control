<script setup lang="ts">
import { FolderOpen } from "lucide-vue-next";
import SchedulePanel from "../components/SchedulePanel.vue";
import Toggle from "../components/Toggle.vue";
import { computed } from "vue";
import { isElectron } from "../lib/api";
import { LOCALES, type LanguagePreference } from "@shared/i18n";
import { t } from "../i18n";
import { controller } from "../stores/controller";

const status = computed(() => controller.state.status);
const settings = computed(() => controller.state.settings);

const rows = computed(() => [
    { label: t("settings.fabricLabel"), value: status.value.fabricLabel, hint: t("settings.fabricLabelHint") },
    { label: t("settings.controllerStatus"), value: status.value.phase, hint: status.value.error ?? "" },
    { label: t("settings.devicesInFabric"), value: String(controller.state.devices.length), hint: "" },
]);

/** Language names stay in their own language, so the right one can be found whatever is shown. */
const languages = computed((): { id: LanguagePreference; name: string }[] => [
    { id: "system", name: t("settings.language.system") },
    ...LOCALES,
]);
</script>

<template>
    <div class="flex h-full flex-col">
        <header class="px-7 pt-6 pb-5">
            <h1 class="font-display text-[22px] leading-tight font-semibold text-ink-50">{{ t("settings.title") }}</h1>
            <p class="mt-1 text-[12.5px] text-ink-400">{{ t("settings.subtitle") }}</p>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
            <div class="max-w-2xl space-y-5">
                <section v-if="settings" class="surface space-y-3 rounded-[var(--radius-card)] p-5">
                    <div>
                        <h2 class="text-[13px] font-semibold text-ink-100">{{ t("settings.language.title") }}</h2>
                        <p class="mt-1.5 text-[12px] leading-relaxed text-ink-400">{{ t("settings.language.hint") }}</p>
                    </div>
                    <div
                        class="grid grid-cols-3 gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-1"
                        role="radiogroup"
                        :aria-label="t('settings.language.title')"
                    >
                        <button
                            v-for="option in languages"
                            :key="option.id"
                            role="radio"
                            :aria-checked="settings.language === option.id"
                            class="rounded-md px-3 py-1.5 text-[12px] transition-colors"
                            :class="
                                settings.language === option.id
                                    ? 'bg-accent-500 font-medium text-white'
                                    : 'text-ink-400 hover:bg-[var(--surface-3)] hover:text-ink-100'
                            "
                            @click="controller.updateSettings({ language: option.id })"
                        >
                            {{ option.name }}
                        </button>
                    </div>
                </section>

                <section v-if="settings" class="surface space-y-4 rounded-[var(--radius-card)] p-5">
                    <h2 class="text-[13px] font-semibold text-ink-100">{{ t("settings.startup.title") }}</h2>
                    <div class="flex items-start justify-between gap-6">
                        <p class="max-w-md text-[12px] leading-relaxed text-ink-400">
                            {{ t("settings.startup.autostartHint") }}
                        </p>
                        <Toggle
                            :model-value="settings.autostart"
                            :label="t('settings.startup.autostart')"
                            @update:model-value="controller.updateSettings({ autostart: $event })"
                        />
                    </div>
                    <div class="flex items-start justify-between gap-6 border-t border-[var(--hairline)] pt-4">
                        <p class="max-w-md text-[12px] leading-relaxed text-ink-400">
                            {{ t("settings.startup.hiddenHint") }}
                        </p>
                        <Toggle
                            :model-value="settings.startHidden"
                            :disabled="!settings.autostart"
                            :label="t('settings.startup.hidden')"
                            @update:model-value="controller.updateSettings({ startHidden: $event })"
                        />
                    </div>
                    <p v-if="!isElectron" class="text-[11.5px] text-ink-500">
                        {{ t("settings.browserNoEffect") }}
                    </p>
                </section>

                <SchedulePanel />

                <section class="surface divide-y divide-[var(--hairline)] rounded-[var(--radius-card)]">
                    <div v-for="row in rows" :key="row.label" class="flex items-start justify-between gap-6 px-5 py-3.5">
                        <div>
                            <p class="text-[13px] text-ink-100">{{ row.label }}</p>
                            <p v-if="row.hint" class="mt-0.5 text-[11.5px] text-ink-500">{{ row.hint }}</p>
                        </div>
                        <p class="shrink-0 font-mono text-[12px] text-ink-300">{{ row.value }}</p>
                    </div>
                </section>

                <section class="surface rounded-[var(--radius-card)] p-5">
                    <h2 class="text-[13px] font-semibold text-ink-100">{{ t("settings.dataDir.title") }}</h2>
                    <p class="mt-1.5 text-[12px] leading-relaxed text-ink-400">
                        {{ t("settings.dataDir.body") }}
                    </p>
                    <p
                        class="mt-3 rounded-lg border border-[var(--hairline)] bg-ink-950/55 px-3 py-2.5 font-mono text-[11.5px] break-all text-ink-300"
                    >
                        {{ status.dataDir || "—" }}
                    </p>
                    <button
                        v-if="isElectron"
                        class="mt-3 flex items-center gap-2 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-ink-200 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-50"
                        @click="controller.openDataDir()"
                    >
                        <FolderOpen :size="14" /> {{ t("settings.dataDir.open") }}
                    </button>
                </section>

                <section class="surface rounded-[var(--radius-card)] p-5">
                    <h2 class="text-[13px] font-semibold text-ink-100">{{ t("settings.network.title") }}</h2>
                    <p class="mt-1.5 text-[12px] leading-relaxed text-ink-400">
                        {{ t("settings.network.body") }}
                    </p>
                </section>
            </div>
        </div>
    </div>
</template>

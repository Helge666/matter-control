<script setup lang="ts">
import { AlertTriangle, Hexagon, Lightbulb, PlusCircle, ScrollText, Settings, X } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { t } from "./i18n";
import { isElectron } from "./lib/api";
import { controller } from "./stores/controller";
import CommissionView from "./views/CommissionView.vue";
import DevicesView from "./views/DevicesView.vue";
import LogsView from "./views/LogsView.vue";
import SettingsView from "./views/SettingsView.vue";

const NAV = [
    { id: "devices", labelKey: "nav.devices", icon: Lightbulb, view: DevicesView },
    { id: "commission", labelKey: "nav.commission", icon: PlusCircle, view: CommissionView },
    { id: "logs", labelKey: "nav.logs", icon: ScrollText, view: LogsView },
    { id: "settings", labelKey: "nav.settings", icon: Settings, view: SettingsView },
] as const;

const active = ref<(typeof NAV)[number]["id"]>("devices");
const activeView = computed(() => NAV.find(n => n.id === active.value)!.view);

const status = computed(() => controller.state.status);
const statusTone = computed(
    () =>
        ({
            online: "bg-ok",
            starting: "bg-warn animate-pulse",
            offline: "bg-ink-500",
            error: "bg-bad",
        })[status.value.phase],
);
const statusText = computed(() =>
    t(
        ({
            online: "status.online",
            starting: "status.starting",
            offline: "status.offline",
            error: "status.error",
        } as const)[status.value.phase],
    ),
);

onMounted(() => {
    if (!isElectron) document.body.classList.add("no-mica");
    void controller.init();
});
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- Custom title bar. The right inset keeps clear of the native window controls. -->
        <header class="drag-region flex h-10 shrink-0 items-center gap-3 pr-[140px] pl-4">
            <Hexagon :size="15" class="text-accent-400" :stroke-width="2.2" />
            <span class="font-display text-[12.5px] font-semibold tracking-wide text-ink-200">
                Matter Control<span v-if="status.version" class="ml-1 font-mono text-[11px] font-normal text-ink-500">v{{ status.version }}</span>
            </span>
            <span class="ml-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                <span class="size-1.5 rounded-full" :class="statusTone" />
                {{ statusText }}
            </span>
            <span
                v-if="!isElectron"
                class="no-drag ml-auto rounded-md border border-warn/40 bg-warn/12 px-2 py-0.5 text-[10.5px] text-warn"
            >
                {{ t("app.browserPreview") }}
            </span>
        </header>

        <div class="flex min-h-0 flex-1">
            <!-- Navigation rail -->
            <nav class="flex w-[196px] shrink-0 flex-col gap-1 border-r border-[var(--hairline)] px-2.5 py-3">
                <button
                    v-for="item in NAV"
                    :key="item.id"
                    class="group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                    :class="
                        active === item.id
                            ? 'bg-[var(--surface-3)] font-medium text-ink-50'
                            : 'text-ink-300 hover:bg-[var(--surface-2)] hover:text-ink-100'
                    "
                    @click="active = item.id"
                >
                    <span
                        class="absolute left-0 h-4 w-[3px] rounded-r-full bg-accent-400 transition-opacity"
                        :class="active === item.id ? 'opacity-100' : 'opacity-0'"
                    />
                    <component :is="item.icon" :size="16" :stroke-width="1.9" />
                    {{ t(item.labelKey) }}
                    <span
                        v-if="item.id === 'devices' && controller.state.devices.length"
                        class="ml-auto font-mono text-[11px] text-ink-500"
                    >
                        {{ controller.state.devices.length }}
                    </span>
                </button>

                <div class="mt-auto px-1">
                    <p class="font-mono text-[10px] leading-relaxed text-ink-600">
                        {{ status.fabricLabel || t("app.noFabric") }}
                    </p>
                </div>
            </nav>

            <!-- Content -->
            <main class="relative flex min-w-0 flex-1 flex-col">
                <div
                    v-if="status.phase === 'error'"
                    class="m-7 flex items-start gap-3 rounded-[var(--radius-card)] border border-bad/35 bg-bad/10 px-4 py-3.5"
                >
                    <AlertTriangle :size="16" class="mt-px shrink-0 text-bad" />
                    <div class="min-w-0">
                        <p class="text-[13px] font-medium text-ink-50">{{ t("app.controllerNotStarted") }}</p>
                        <p class="mt-1 font-mono text-[11.5px] break-words text-ink-300">{{ status.error }}</p>
                    </div>
                </div>
                <template v-else>
                    <div
                        v-if="status.error"
                        class="mx-7 mt-5 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3"
                    >
                        <AlertTriangle :size="15" class="mt-px shrink-0 text-warn" />
                        <p class="text-[12.5px] leading-relaxed text-ink-200">{{ status.error }}</p>
                    </div>
                    <div class="min-h-0 flex-1">
                        <!-- Kept alive so switching views does not throw away what a view is showing:
                             an open mood editor, a scroll position, a half-typed pairing code. -->
                        <KeepAlive>
                            <component :is="activeView" @navigate="active = $event as typeof active" />
                        </KeepAlive>
                    </div>
                </template>

                <!-- Transient error toast for control/commission failures -->
                <div
                    v-if="controller.state.lastError && active !== 'commission'"
                    class="absolute inset-x-7 bottom-5 flex items-start gap-3 rounded-lg border border-bad/40 bg-ink-900/95 px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur-xl"
                >
                    <AlertTriangle :size="15" class="mt-px shrink-0 text-bad" />
                    <p class="min-w-0 flex-1 font-mono text-[11.5px] break-words text-ink-200">
                        {{ controller.state.lastError }}
                    </p>
                    <button
                        class="grid size-6 shrink-0 place-items-center rounded text-ink-400 hover:bg-[var(--surface-3)] hover:text-ink-100"
                        :aria-label="t('common.close')"
                        @click="controller.dismissError()"
                    >
                        <X :size="13" />
                    </button>
                </div>
            </main>
        </div>
    </div>
</template>

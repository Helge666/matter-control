<script setup lang="ts">
import { Lightbulb, Power, PowerOff } from "lucide-vue-next";
import { computed } from "vue";
import DeviceCard from "../components/DeviceCard.vue";
import { t, tn } from "../i18n";
import { controller } from "../stores/controller";

const emit = defineEmits<{ navigate: [string] }>();

const devices = computed(() => controller.state.devices);
const onCount = computed(
    () => devices.value.filter(d => d.endpoints.some(e => e.onOff)).length,
);

/** Drive every controllable endpoint at once. */
async function allTo(on: boolean) {
    const jobs: Promise<unknown>[] = [];
    for (const device of devices.value) {
        for (const ep of device.endpoints) {
            if (ep.capabilities.onOff) jobs.push(controller.setOnOff(device.id, ep.number, on));
        }
    }
    await Promise.allSettled(jobs);
}
</script>

<template>
    <div class="flex h-full flex-col">
        <header class="flex items-end justify-between gap-4 px-7 pt-6 pb-5">
            <div>
                <h1 class="font-display text-[22px] leading-tight font-semibold text-ink-50">{{ t("devices.title") }}</h1>
                <p class="mt-1 text-[12.5px] text-ink-400">
                    {{ tn("devices.summary", devices.length) }}
                    <template v-if="devices.length"> · {{ t("devices.switchedOn", { count: onCount }) }}</template>
                </p>
            </div>

            <div v-if="devices.length" class="flex gap-2">
                <button
                    class="flex items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-ink-200 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-50"
                    @click="allTo(true)"
                >
                    <Power :size="14" /> {{ t("devices.allOn") }}
                </button>
                <button
                    class="flex items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-ink-200 transition-colors hover:bg-[var(--surface-3)] hover:text-ink-50"
                    @click="allTo(false)"
                >
                    <PowerOff :size="14" /> {{ t("devices.allOff") }}
                </button>
            </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
            <div
                v-if="devices.length"
                class="grid gap-4"
                style="grid-template-columns: repeat(auto-fill, minmax(310px, 1fr))"
            >
                <DeviceCard v-for="device in devices" :key="device.id" :device="device" />
            </div>

            <div v-else class="grid h-full place-items-center">
                <div class="max-w-sm text-center">
                    <div
                        class="mx-auto grid size-14 place-items-center rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)] text-ink-500"
                    >
                        <Lightbulb :size="24" :stroke-width="1.6" />
                    </div>
                    <h2 class="mt-4 font-display text-[16px] font-semibold text-ink-100">{{ t("devices.empty.title") }}</h2>
                    <p class="mt-2 text-[12.5px] leading-relaxed text-ink-400">
                        {{ t("devices.empty.body") }}
                    </p>
                    <button
                        class="mt-5 rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-400"
                        @click="emit('navigate', 'commission')"
                    >
                        {{ t("devices.empty.action") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

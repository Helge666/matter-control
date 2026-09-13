<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, Loader2, Radar, Wifi } from "lucide-vue-next";
import { computed, ref } from "vue";
import { t } from "../i18n";
import { controller } from "../stores/controller";

const pairingCode = ref("");
const label = ref("");
const useBle = ref(false);
const wifiSsid = ref("");
const wifiPassword = ref("");
/** The device just added; rendered through t() so it follows a language switch. */
const added = ref<{ name: string; nodeId: string }>();

const digits = computed(() => pairingCode.value.replace(/\D/g, ""));
const isQr = computed(() => /^MT:/i.test(pairingCode.value.trim()));
const codeValid = computed(() => isQr.value || digits.value.length === 11 || digits.value.length === 21);

/** Group as 4-3-4 the way the code is printed on the device and in vendor apps. */
const prettyCode = computed(() => {
    if (isQr.value) return pairingCode.value.trim();
    const d = digits.value;
    if (d.length !== 11) return d;
    return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
});

const busy = computed(() => controller.state.commissioning);

async function submit() {
    if (!codeValid.value || busy.value) return;
    added.value = undefined;
    try {
        const device = await controller.commission(
            pairingCode.value,
            label.value || undefined,
            useBle.value && wifiSsid.value ? { ssid: wifiSsid.value, password: wifiPassword.value } : undefined,
        );
        added.value = { name: device.name, nodeId: device.nodeId };
        pairingCode.value = "";
        label.value = "";
    } catch {
        /* error surfaces through controller.state.lastError */
    }
}
</script>

<template>
    <div class="flex h-full flex-col">
        <header class="px-7 pt-6 pb-5">
            <h1 class="font-display text-[22px] leading-tight font-semibold text-ink-50">{{ t("commission.title") }}</h1>
            <p class="mt-1 text-[12.5px] text-ink-400">
                {{ t("commission.subtitle") }}
            </p>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
            <div class="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <!-- Pairing form ------------------------------------------------ -->
                <section class="surface space-y-5 rounded-[var(--radius-card)] p-5">
                    <div class="space-y-2">
                        <label class="block text-[12px] font-medium text-ink-300">{{ t("commission.code") }}</label>
                        <input
                            v-model="pairingCode"
                            :placeholder="t('commission.codePlaceholder')"
                            spellcheck="false"
                            class="w-full rounded-lg border bg-ink-950/55 px-3.5 py-2.5 font-mono text-[15px] tracking-wide text-ink-50 outline-none transition-colors placeholder:text-ink-600"
                            :class="
                                pairingCode && !codeValid
                                    ? 'border-warn/55 focus:border-warn'
                                    : 'border-[var(--hairline-strong)] focus:border-accent-400'
                            "
                            @keydown.enter="submit"
                        />
                        <p v-if="pairingCode && !codeValid" class="text-[11.5px] text-warn">
                            {{ t("commission.codeInvalid", { count: digits.length }) }}
                        </p>
                        <p v-else-if="codeValid" class="font-mono text-[11.5px] text-ok">{{ prettyCode }}</p>
                        <p v-else class="text-[11.5px] text-ink-500">
                            {{ t("commission.codeHint") }}
                        </p>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-[12px] font-medium text-ink-300">
                            {{ t("commission.name") }} <span class="font-normal text-ink-500">{{ t("common.optional") }}</span>
                        </label>
                        <input
                            v-model="label"
                            :placeholder="t('commission.namePlaceholder')"
                            class="w-full rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-3.5 py-2.5 text-[13.5px] text-ink-50 outline-none transition-colors placeholder:text-ink-600 focus:border-accent-400"
                            @keydown.enter="submit"
                        />
                    </div>

                    <div class="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-3.5">
                        <label class="flex cursor-pointer items-start gap-2.5">
                            <input v-model="useBle" type="checkbox" class="mt-0.5 accent-[var(--color-accent-500)]" />
                            <span>
                                <span class="flex items-center gap-1.5 text-[12.5px] text-ink-200">
                                    <Wifi :size="13" /> {{ t("commission.notOnWifi") }}
                                </span>
                                <span class="mt-0.5 block text-[11.5px] text-ink-500">
                                    {{ t("commission.notOnWifiHint") }}
                                </span>
                            </span>
                        </label>
                        <div v-if="useBle" class="mt-3 grid gap-2.5 sm:grid-cols-2">
                            <input
                                v-model="wifiSsid"
                                :placeholder="t('commission.ssid')"
                                class="rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-3 py-2 text-[13px] text-ink-50 outline-none placeholder:text-ink-600 focus:border-accent-400"
                            />
                            <input
                                v-model="wifiPassword"
                                type="password"
                                :placeholder="t('commission.password')"
                                class="rounded-lg border border-[var(--hairline-strong)] bg-ink-950/55 px-3 py-2 text-[13px] text-ink-50 outline-none placeholder:text-ink-600 focus:border-accent-400"
                            />
                        </div>
                    </div>

                    <button
                        class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
                        :disabled="!codeValid || busy"
                        @click="submit"
                    >
                        <Loader2 v-if="busy" :size="15" class="animate-spin" />
                        {{
                            t(
                                busy
                                    ? controller.state.commissionStage === "discovering"
                                        ? "commission.discovering"
                                        : "commission.pairing"
                                    : "commission.pair",
                            )
                        }}
                    </button>

                    <div
                        v-if="added"
                        class="flex items-start gap-2.5 rounded-lg border border-ok/35 bg-ok/10 px-3.5 py-3 text-[12.5px] text-ink-100"
                    >
                        <CheckCircle2 :size="15" class="mt-px shrink-0 text-ok" />
                        <span>{{ t("commission.success", added) }}</span>
                    </div>

                    <div
                        v-if="controller.state.lastError"
                        class="flex items-start gap-2.5 rounded-lg border border-bad/35 bg-bad/10 px-3.5 py-3 text-[12.5px] text-ink-100"
                    >
                        <AlertTriangle :size="15" class="mt-px shrink-0 text-bad" />
                        <div class="min-w-0">
                            <p class="font-medium">{{ t("commission.failed") }}</p>
                            <p class="mt-1 font-mono text-[11.5px] break-words text-ink-300">
                                {{ controller.state.lastError }}
                            </p>
                        </div>
                    </div>
                </section>

                <!-- Guidance + scan ---------------------------------------------- -->
                <div class="space-y-5">
                    <section
                        class="rounded-[var(--radius-card)] border border-accent-500/25 bg-accent-500/7 p-4.5"
                    >
                        <h2 class="flex items-center gap-2 text-[12.5px] font-semibold text-accent-300">
                            <Info :size="14" /> {{ t("commission.guide.title") }}
                        </h2>
                        <ol class="mt-2.5 space-y-2 text-[12px] leading-relaxed text-ink-300">
                            <li>
                                <span class="font-medium text-ink-100">1.</span>
                                {{ t("commission.guide.step1.before") }}
                                <span class="text-ink-100">{{ t("commission.guide.step1.action") }}</span>
                                {{ t("commission.guide.step1.after") }}
                            </li>
                            <li>
                                <span class="font-medium text-ink-100">2.</span>
                                {{ t("commission.guide.step2.before") }}
                                <span class="text-ink-100">{{ t("commission.guide.step2.emphasis") }}</span>
                                {{ t("commission.guide.step2.after") }}
                            </li>
                            <li>
                                <span class="font-medium text-ink-100">3.</span>
                                {{ t("commission.guide.step3.before") }}
                                <span class="text-ink-100">{{ t("commission.guide.step3.emphasis") }}</span
                                >{{ t("commission.guide.step3.after") }}
                            </li>
                        </ol>
                    </section>

                    <section class="surface rounded-[var(--radius-card)] p-4.5">
                        <div class="flex items-center justify-between gap-3">
                            <h2 class="text-[12.5px] font-semibold text-ink-100">{{ t("commission.scan.title") }}</h2>
                            <button
                                class="flex items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-ink-200 transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
                                :disabled="controller.state.scanning"
                                @click="controller.scan(10)"
                            >
                                <Loader2 v-if="controller.state.scanning" :size="13" class="animate-spin" />
                                <Radar v-else :size="13" />
                                {{ t(controller.state.scanning ? "commission.scan.searching" : "commission.scan.start") }}
                            </button>
                        </div>
                        <p class="mt-2 text-[11.5px] leading-relaxed text-ink-500">
                            {{ t("commission.scan.hint") }}
                        </p>

                        <ul v-if="controller.state.candidates.length" class="mt-3 space-y-2">
                            <li
                                v-for="c in controller.state.candidates"
                                :key="c.id"
                                class="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5"
                            >
                                <p class="text-[12.5px] font-medium text-ink-100">{{ c.name ?? c.id }}</p>
                                <p class="mt-1 font-mono text-[10.5px] text-ink-500">
                                    D={{ c.discriminator ?? "?" }} · CM={{ c.commissioningMode ?? "?" }} ·
                                    VID=0x{{ (c.vendorId ?? 0).toString(16) }}
                                </p>
                                <p v-if="c.addresses.length" class="font-mono text-[10.5px] text-ink-500">
                                    {{ c.addresses[0] }}
                                </p>
                            </li>
                        </ul>
                        <p
                            v-else-if="!controller.state.scanning"
                            class="mt-3 rounded-lg border border-dashed border-[var(--hairline-strong)] px-3 py-3 text-center text-[11.5px] text-ink-500"
                        >
                            {{ t("commission.scan.none") }}
                        </p>
                    </section>
                </div>
            </div>
        </div>
    </div>
</template>

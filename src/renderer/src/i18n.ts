import {
    type LanguagePreference,
    type MessageKey,
    type Params,
    type PluralKey,
    resolveLocale,
    translate,
    translatePlural,
} from "@shared/i18n";
import { computed, ref, watchEffect } from "vue";

/**
 * The language of the window.
 *
 * `t` reads {@link locale}, so every template that calls it re-renders when the language
 * changes — switching in the settings takes effect at once, without a reload.
 */
const preference = ref<LanguagePreference>("system");

export const locale = computed(() => resolveLocale(preference.value, navigator.languages));

watchEffect(() => {
    document.documentElement.lang = locale.value;
});

/** Called by the store whenever settings arrive or change. */
export function setLanguagePreference(value: LanguagePreference | undefined) {
    preference.value = value ?? "system";
}

export function t(key: MessageKey, params?: Params): string {
    return translate(locale.value, key, params);
}

export function tn(stem: PluralKey, count: number, params?: Params): string {
    return translatePlural(locale.value, stem, count, params);
}

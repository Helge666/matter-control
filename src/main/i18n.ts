import { app } from "electron";
import {
    type LanguagePreference,
    type Locale,
    type MessageKey,
    type Params,
    type PluralKey,
    resolveLocale,
    translate,
    translatePlural,
} from "../shared/i18n";

/**
 * The language of the main process: the tray menu and errors that end up in the window.
 *
 * Kept in step with the settings, so switching the language in the window also relabels the
 * tray without a restart.
 */
let current: Locale = "en";

export function setLanguage(preference: LanguagePreference | undefined): Locale {
    current = resolveLocale(preference, app.getPreferredSystemLanguages());
    return current;
}

export function t(key: MessageKey, params?: Params): string {
    return translate(current, key, params);
}

export function tn(stem: PluralKey, count: number, params?: Params): string {
    return translatePlural(current, stem, count, params);
}

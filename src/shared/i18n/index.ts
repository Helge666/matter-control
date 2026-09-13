/**
 * Texts in more than one language, for the window and the tray alike.
 *
 * Deliberately small: a typed key table per language and a lookup with `{name}` placeholders.
 * Both processes share it — the tray and the errors the main process raises have to speak the
 * same language as the window.
 */

import { de } from "./de.ts";
import { en, type MessageKey } from "./en.ts";

export type { MessageKey };

export type Locale = "en" | "de";

/** What the user chose; "system" follows the Windows display language. */
export type LanguagePreference = "system" | Locale;

/** Offered in the settings, each in its own language so it can be found whatever is active. */
export const LOCALES: readonly { id: Locale; name: string }[] = [
    { id: "en", name: "English" },
    { id: "de", name: "Deutsch" },
];

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, de };

export type Params = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: Params) => string;

/** Keys that come as a `.one` / `.other` pair, addressed by their common stem. */
export type PluralKey = { [K in MessageKey]: K extends `${infer Stem}.one` ? Stem : never }[MessageKey];

/**
 * The language to show.
 *
 * An explicit choice wins. Otherwise the first system language we have texts for, which lets a
 * Swiss or Austrian German setup land on German; anything unknown falls back to English.
 */
export function resolveLocale(preference: LanguagePreference | undefined, systemLanguages: readonly string[]): Locale {
    if (preference && preference !== "system") return preference;
    for (const tag of systemLanguages) {
        const base = tag.toLowerCase().split(/[-_]/)[0];
        if (base in CATALOGS) return base as Locale;
    }
    return "en";
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
    const template = CATALOGS[locale][key] ?? en[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        name in params ? String(params[name]) : placeholder,
    );
}

/** A counted text: picks `.one` or `.other` by the language's plural rules and fills `{count}`. */
export function translatePlural(locale: Locale, stem: PluralKey, count: number, params?: Params): string {
    const form = new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
    return translate(locale, `${stem}.${form}` as MessageKey, { count, ...params });
}

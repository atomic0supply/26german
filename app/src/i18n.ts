export type Language = "de" | "es";

export const LANGUAGE_STORAGE_KEY = "app-language";

export const translate = <T>(language: Language, deValue: T, esValue: T): T =>
  language === "es" ? esValue : deValue;

export const localeForLanguage = (language: Language): string =>
  language === "es" ? "es-ES" : "de-DE";

const isLanguage = (value: string | null): value is Language => value === "de" || value === "es";

export const detectInitialLanguage = (): Language => {
  if (typeof window === "undefined") {
    return "de";
  }

  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage read failures in restricted environments.
  }

  return navigator.language.toLowerCase().startsWith("es") ? "es" : "de";
};

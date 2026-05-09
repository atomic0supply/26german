import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDocumentLanguage,
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY,
  localeForLanguage,
  persistLanguagePreference
} from "../../src/i18n";

describe("i18n helpers", () => {
  const originalNavigatorLanguage = window.navigator.language;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "";
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: originalNavigatorLanguage
    });
  });

  it("detects the stored language first", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");

    expect(detectInitialLanguage()).toBe("es");
  });

  it("falls back to the browser locale when nothing is stored", () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "es-ES"
    });

    expect(detectInitialLanguage()).toBe("es");

    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "de-DE"
    });

    expect(detectInitialLanguage()).toBe("de");
  });

  it("returns the expected locale for each supported language", () => {
    expect(localeForLanguage("de")).toBe("de-DE");
    expect(localeForLanguage("es")).toBe("es-ES");
  });

  it("persists the language preference and updates document.lang", () => {
    persistLanguagePreference("es");
    applyDocumentLanguage("es");

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
});

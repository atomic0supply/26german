import { createTranslator, Language } from "../i18n";

interface LanguageSwitchProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

export const LanguageSwitch = ({ language, onLanguageChange }: LanguageSwitchProps) => {
  const t = createTranslator(language);

  return (
    <div className="language-switch" role="group" aria-label={t("Sprache", "Idioma")}>
      <button
        type="button"
        className={language === "de" ? "language-switch__item active" : "language-switch__item"}
        aria-pressed={language === "de"}
        onClick={() => onLanguageChange("de")}
      >
        DE
      </button>
      <button
        type="button"
        className={language === "es" ? "language-switch__item active" : "language-switch__item"}
        aria-pressed={language === "es"}
        onClick={() => onLanguageChange("es")}
      >
        ES
      </button>
    </div>
  );
};

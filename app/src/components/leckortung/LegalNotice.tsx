import { LECKORTUNG_HINWEIS_TEXT } from "../../constants";
import { Language, translate } from "../../i18n";

interface LegalNoticeProps {
  language: Language;
  className?: string;
}

/** Read-only legal notice rendered identically in the modal and the full-screen sign-off page. */
export const LegalNotice = ({ language, className }: LegalNoticeProps) => {
  const t = (de: string, es: string) => translate(language, de, es);
  return (
    <div className={`legal-notice${className ? ` ${className}` : ""}`}>
      <span className="legal-notice__label">{t("Wichtiger Hinweis (fest)", "Aviso legal (texto fijo)")}</span>
      <textarea className="field-readonly legal-notice__text" value={LECKORTUNG_HINWEIS_TEXT} rows={8} readOnly />
      <small className="legal-notice__hint">
        {t(
          "Dieser Text wird automatisch in das PDF eingefügt und ist nicht editierbar.",
          "Este texto se inserta automáticamente en el PDF y no es editable."
        )}
      </small>
    </div>
  );
};

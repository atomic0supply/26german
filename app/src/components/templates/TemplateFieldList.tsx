import { TemplateFieldSchema } from "../../types";

interface TemplateFieldListProps {
  fields: TemplateFieldSchema[];
  selectedFieldId: string;
  onSelectField: (field: TemplateFieldSchema) => void;
  t: (deValue: string, esValue: string) => string;
}

export const TemplateFieldList = ({ fields, selectedFieldId, onSelectField, t }: TemplateFieldListProps) => {
  if (fields.length === 0) {
    return null;
  }

  return (
    <article className="card stack template-library-panel">
      <h3>{t("Feldliste", "Lista de campos")}</h3>
      <div className="template-field-list">
        {fields.map((field) => (
          <button
            key={field.id}
            type="button"
            className={selectedFieldId === field.id ? "template-field-row active" : "template-field-row"}
            onClick={() => onSelectField(field)}
          >
            <strong>
              {field.label}
              {field.generatedByAi && <span className="template-ai-chip">AI</span>}
            </strong>
            <small>
              {field.type} · {t("Seite", "Página")} {field.page + 1}
            </small>
          </button>
        ))}
      </div>
    </article>
  );
};

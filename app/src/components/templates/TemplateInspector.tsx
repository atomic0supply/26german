import { TemplateFieldSchema } from "../../types";

interface TemplateInspectorProps {
  field: TemplateFieldSchema | null;
  onUpdateField: (patch: Partial<TemplateFieldSchema>) => void;
  onUpdateDropdownOption: (index: number, value: string) => void;
  onAddDropdownOption: () => void;
  onRemoveDropdownOption: (index: number) => void;
  onDuplicateField: () => void;
  onRemoveField: () => void;
  t: (deValue: string, esValue: string) => string;
}

export const TemplateInspector = ({
  field,
  onUpdateField,
  onUpdateDropdownOption,
  onAddDropdownOption,
  onRemoveDropdownOption,
  onDuplicateField,
  onRemoveField,
  t
}: TemplateInspectorProps) => {
  if (!field) {
    return (
      <article className="card stack template-inspector-panel">
        <h3>{t("Inspector", "Inspector")}</h3>
        <p className="empty-state">
          {t("Wähle ein Feld aus, um seine Eigenschaften zu bearbeiten.", "Selecciona un campo para editar sus propiedades.")}
        </p>
      </article>
    );
  }

  return (
    <article className="card stack template-inspector-panel">
      <h3>{t("Feldeigenschaften", "Propiedades del campo")}</h3>
      <label>
        ID
        <input value={field.id} onChange={(event) => onUpdateField({ id: event.target.value })} />
      </label>
      <label>
        Label
        <input value={field.label} onChange={(event) => onUpdateField({ label: event.target.value })} />
      </label>
      <label>
        Help Text
        <input value={field.helpText} onChange={(event) => onUpdateField({ helpText: event.target.value })} />
      </label>
      {field.generatedByAi && (
        <div className="template-ai-meta">
          <strong>{t("KI-Vorschlag", "Sugerencia IA")}</strong>
          {typeof field.aiConfidence === "number" && (
            <small>{t("Sicherheit", "Confianza")} {Math.round(field.aiConfidence * 100)}%</small>
          )}
          {field.aiReason && <p>{field.aiReason}</p>}
        </div>
      )}
      {field.type === "dropdown" && (
        <div className="stack">
          <label>{t("Optionen", "Opciones")}</label>
          <div className="template-option-list">
            {field.options.map((option, index) => (
              <div key={`${field.id}-option-${index}`} className="template-option-row">
                <input
                  value={option}
                  onChange={(event) => onUpdateDropdownOption(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                />
                <button type="button" className="ghost" onClick={() => onRemoveDropdownOption(index)} disabled={field.options.length <= 1}>
                  {t("Entfernen", "Quitar")}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="ghost" onClick={onAddDropdownOption}>
            {t("Option hinzufügen", "Añadir opción")}
          </button>
        </div>
      )}
      {(field.type === "image" || field.type === "signature") && (
        <label>
          Default Value / Slot
          <input value={field.defaultValue} onChange={(event) => onUpdateField({ defaultValue: event.target.value })} />
        </label>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={field.required} onChange={(event) => onUpdateField({ required: event.target.checked })} />
        Required
      </label>
      <p className="template-inspector-coords">
        x {field.rect.x.toFixed(3)} · y {field.rect.y.toFixed(3)} · w {field.rect.width.toFixed(3)} · h {field.rect.height.toFixed(3)}
      </p>
      <div className="row">
        <button type="button" className="ghost" onClick={onDuplicateField}>
          {t("Duplizieren", "Duplicar")}
        </button>
        <button type="button" onClick={onRemoveField}>
          {t("Löschen", "Eliminar")}
        </button>
      </div>
    </article>
  );
};

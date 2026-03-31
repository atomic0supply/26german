import { ChangeEvent } from "react";
import { TemplateSummary, TemplateVersion } from "../../types";

interface TemplateLibraryPanelProps {
  templates: TemplateSummary[];
  activeTemplateId: string | null;
  versions: TemplateVersion[];
  activeVersionId: string | null;
  draftName: string;
  draftBrand: string;
  isOnline: boolean;
  workingFileName: string;
  onDraftNameChange: (value: string) => void;
  onDraftBrandChange: (value: string) => void;
  onCreateTemplate: () => void;
  onSelectTemplate: (template: TemplateSummary) => void;
  onSelectVersion: (version: TemplateVersion) => void;
  onUploadBasePdf: (event: ChangeEvent<HTMLInputElement>) => void;
  t: (deValue: string, esValue: string) => string;
}

export const TemplateLibraryPanel = ({
  templates,
  activeTemplateId,
  versions,
  activeVersionId,
  draftName,
  draftBrand,
  isOnline,
  workingFileName,
  onDraftNameChange,
  onDraftBrandChange,
  onCreateTemplate,
  onSelectTemplate,
  onSelectVersion,
  onUploadBasePdf,
  t
}: TemplateLibraryPanelProps) => {
  return (
    <section className="stack">
      <article className="card stack template-library-panel">
        <h3>{t("Neue Vorlage", "Nueva plantilla")}</h3>
        <label>
          {t("Template-Name", "Nombre de plantilla")}
          <input value={draftName} onChange={(event) => onDraftNameChange(event.target.value)} />
        </label>
        <label>
          {t("Marke", "Marca")}
          <input value={draftBrand} onChange={(event) => onDraftBrandChange(event.target.value)} />
        </label>
        <button type="button" disabled={!isOnline} onClick={onCreateTemplate}>
          {t("Neue Vorlage anlegen", "Crear nueva plantilla")}
        </button>
      </article>

      <article className="card stack template-library-panel">
        <h3>{t("Vorlagen", "Plantillas")}</h3>
        {templates.length === 0 ? (
          <p className="empty-state">{t("Noch keine Vorlagen vorhanden.", "Todavía no hay plantillas.")}</p>
        ) : (
          <div className="template-library-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={activeTemplateId === template.id ? "template-library-item active" : "template-library-item"}
                onClick={() => onSelectTemplate(template)}
              >
                <strong>{template.name}</strong>
                <small>{template.brand}</small>
                <small>{template.status}</small>
              </button>
            ))}
          </div>
        )}
      </article>

      <article className="card stack template-library-panel">
        <h3>{t("Versionen", "Versiones")}</h3>
        {versions.length === 0 ? (
          <p className="empty-state">{t("Wähle eine Vorlage, um Versionen zu sehen.", "Selecciona una plantilla para ver sus versiones.")}</p>
        ) : (
          <div className="template-library-list">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                className={activeVersionId === version.id ? "template-library-item active" : "template-library-item"}
                onClick={() => onSelectVersion(version)}
              >
                <strong>#{version.versionNumber}</strong>
                <small>{version.status}</small>
                <small>{version.basePdfPath ? workingFileName : t("Kein Basis-PDF", "Sin PDF base")}</small>
              </button>
            ))}
          </div>
        )}
      </article>

      <article className="card stack template-library-panel">
        <label>
          {t("Basis-PDF hochladen", "Subir PDF base")}
          <input type="file" accept="application/pdf" disabled={!isOnline} onChange={onUploadBasePdf} />
        </label>
        <p className="template-library-hint">
          {t(
            "Das Basis-PDF wird beim Veröffentlichen zur editierbaren Arbeitsfläche.",
            "El PDF base se convierte en un lienzo editable al publicar la versión."
          )}
        </p>
      </article>
    </section>
  );
};

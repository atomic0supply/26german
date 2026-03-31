import { TemplateSummary, TemplateVersion } from "../../types";

interface TemplateWorkspaceHeaderProps {
  template: TemplateSummary | null;
  version: TemplateVersion | null;
  workingFileName: string;
  isAnalyzing: boolean;
  isPublishing: boolean;
  canAnalyze: boolean;
  canSave: boolean;
  canPublish: boolean;
  onCreateVersion: () => void;
  onAnalyze: () => void;
  onSave: () => void;
  onPublish: () => void;
  t: (deValue: string, esValue: string) => string;
}

export const TemplateWorkspaceHeader = ({
  template,
  version,
  workingFileName,
  isAnalyzing,
  isPublishing,
  canAnalyze,
  canSave,
  canPublish,
  onCreateVersion,
  onAnalyze,
  onSave,
  onPublish,
  t
}: TemplateWorkspaceHeaderProps) => {
  return (
    <header className="template-workspace-header card">
      <div className="template-workspace-heading">
        <div>
          <p className="template-workspace-kicker">{t("PDF Vorlagen", "Plantillas PDF")}</p>
          <h2>{template?.name ?? t("Noch keine Vorlage ausgewählt", "Todavía no hay una plantilla seleccionada")}</h2>
          <p className="template-workspace-subtitle">
            {template
              ? `${template.brand} · ${t("Version", "Versión")} ${version?.versionNumber ?? "-"}`
              : t("Wähle links eine Vorlage aus oder erstelle eine neue.", "Selecciona una plantilla a la izquierda o crea una nueva.")}
          </p>
        </div>

        <div className="template-workspace-meta">
          <span className="status-badge">{version?.status ?? t("Entwurf", "Borrador")}</span>
          {version?.schemaSource && <span className="status-badge subtle">{version.schemaSource}</span>}
          <span className="status-badge subtle">{workingFileName || t("Kein Basis-PDF", "Sin PDF base")}</span>
        </div>
      </div>

      <div className="action-bar">
        <button type="button" className="ghost" onClick={onCreateVersion} disabled={!template}>
          {t("Neue Version", "Nueva versión")}
        </button>
        <button type="button" className="ghost" onClick={onAnalyze} disabled={!canAnalyze || isAnalyzing}>
          {isAnalyzing ? t("Analysiere...", "Analizando...") : t("Mit KI analysieren", "Analizar con IA")}
        </button>
        <button type="button" className="ghost" onClick={onSave} disabled={!canSave}>
          {t("Entwurf speichern", "Guardar borrador")}
        </button>
        <button type="button" onClick={onPublish} disabled={!canPublish || isPublishing}>
          {isPublishing ? t("Veröffentliche...", "Publicando...") : t("Version veröffentlichen", "Publicar versión")}
        </button>
      </div>
    </header>
  );
};

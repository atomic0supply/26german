import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { functions, storage } from "../firebase";
import { Language, translate } from "../i18n";
import { TemplateFieldSchema, TemplateSummary, TemplateVersion } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface TemplateAdminPanelProps {
  uid: string;
  isOnline: boolean;
  language: Language;
}

interface TemplateVersionResponse {
  summary: TemplateSummary;
  version: TemplateVersion;
}

const FIELD_TYPE_OPTIONS: Array<TemplateFieldSchema["type"]> = ["text", "textarea", "checkbox", "dropdown", "signature", "image"];

const sortSchema = (fieldSchema: TemplateFieldSchema[]) =>
  fieldSchema.slice().sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));

export const TemplateAdminPanel = ({ uid, isOnline, language }: TemplateAdminPanelProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<TemplateSummary | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<TemplateVersion | null>(null);
  const [schemaDraft, setSchemaDraft] = useState<TemplateFieldSchema[]>([]);
  const [pdfUrl, setPdfUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTemplates = async (templateIdToOpen?: string) => {
    setLoadingTemplates(true);
    setError("");
    try {
      const callable = httpsCallable<unknown, TemplateSummary[]>(functions, "listTemplates");
      const result = await callable({});
      setTemplates(result.data);
      const nextId = templateIdToOpen || selectedTemplateId || result.data[0]?.id || "";
      if (nextId) {
        await loadTemplateVersion(nextId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("No se pudieron cargar las plantillas.", "Vorlagen konnten nicht geladen werden."));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadTemplateVersion = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setError("");
    try {
      const callable = httpsCallable<{ templateId: string }, TemplateVersionResponse>(functions, "getTemplateVersion");
      const result = await callable({ templateId });
      setSelectedSummary(result.data.summary);
      setSelectedVersion(result.data.version);
      setSchemaDraft(sortSchema(result.data.version.fieldSchema));
      setPdfUrl(result.data.version.pdfUrl ?? "");
      setName(result.data.summary.name);
      setBrand(result.data.summary.brand);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("No se pudo abrir la plantilla.", "Vorlage konnte nicht geöffnet werden."));
    }
  };

  useEffect(() => {
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplateLabel = selectedSummary
    ? `${selectedSummary.name} · ${selectedSummary.brand}`
    : "";

  const visibleFields = useMemo(() => sortSchema(schemaDraft), [schemaDraft]);

  const updateField = (fieldId: string, updater: (field: TemplateFieldSchema) => TemplateFieldSchema) => {
    setSchemaDraft((previous) => previous.map((field) => field.id === fieldId ? updater(field) : field));
  };

  const handleCreateDraft = async () => {
    if (!file || !name.trim() || !brand.trim()) {
      setError(t("Nombre, marca y PDF son obligatorios.", "Name, Marke und PDF sind erforderlich."));
      return;
    }
    if (!isOnline) {
      setError(t("Necesitas conexión para subir el PDF.", "Zum Hochladen des PDFs ist eine Verbindung erforderlich."));
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      const importPath = `template-imports/${uid}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await uploadBytes(ref(storage, importPath), file, { contentType: "application/pdf" });

      const callable = httpsCallable<
        { name: string; brand: string; importPath: string; templateId?: string },
        TemplateVersionResponse
      >(functions, "createTemplateDraft");
      const result = await callable({
        name: name.trim(),
        brand: brand.trim(),
        importPath,
        templateId: selectedTemplateId || undefined
      });

      setSelectedTemplateId(result.data.summary.id);
      setSelectedSummary(result.data.summary);
      setSelectedVersion(result.data.version);
      setSchemaDraft(sortSchema(result.data.version.fieldSchema));
      setPdfUrl(result.data.version.pdfUrl ?? "");
      setFile(null);
      setNotice(t("Borrador de plantilla creado.", "Vorlagenentwurf erstellt."));
      await loadTemplates(result.data.summary.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("No se pudo crear la plantilla.", "Vorlage konnte nicht erstellt werden."));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveSchema = async () => {
    if (!selectedSummary || !selectedVersion) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable<
        { templateId: string; versionId: string; fieldSchema: TemplateFieldSchema[] },
        { ok: boolean }
      >(functions, "updateTemplateVersionSchema");
      await callable({
        templateId: selectedSummary.id,
        versionId: selectedVersion.id,
        fieldSchema: schemaDraft.map((field, index) => ({ ...field, sortOrder: index }))
      });
      setNotice(t("Esquema guardado.", "Schema gespeichert."));
      await loadTemplateVersion(selectedSummary.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("No se pudo guardar el esquema.", "Schema konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedSummary || !selectedVersion) {
      return;
    }

    setPublishing(true);
    setError("");
    try {
      const callable = httpsCallable<{ templateId: string; versionId: string }, { ok: boolean }>(functions, "publishTemplateVersion");
      await callable({ templateId: selectedSummary.id, versionId: selectedVersion.id });
      setNotice(t("Versión publicada.", "Version veröffentlicht."));
      await loadTemplates(selectedSummary.id);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t("No se pudo publicar la plantilla.", "Vorlage konnte nicht veröffentlicht werden."));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="workspace-stack">
      {(error || notice) && (
        <div className="stack">
          {error && <p className="notice-banner error">{error}</p>}
          {notice && <p className="notice-banner notice">{notice}</p>}
        </div>
      )}

      <SectionCard
        title={t("Nueva plantilla PDF", "Neue PDF-Vorlage")}
        description={t(
          "Sube un PDF con AcroForm. El sistema leerá los campos y abrirá un borrador editable.",
          "PDF mit AcroForm hochladen. Das System liest die Felder und öffnet einen editierbaren Entwurf."
        )}
        actions={
          <button type="button" onClick={() => void handleCreateDraft()} disabled={!isOnline || creating}>
            {creating ? t("Creando...", "Wird erstellt...") : t(selectedTemplateId ? "Subir nueva versión" : "Crear plantilla", selectedTemplateId ? "Neue Version hochladen" : "Vorlage erstellen")}
          </button>
        }
      >
        <div className="grid two">
          <label>
            {t("Nombre interno", "Interner Name")}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Informe Hogar v2" />
          </label>
          <label>
            {t("Marca", "Marke")}
            <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="AquaRADAR" />
          </label>
          <label className="form-panel__full">
            {t("PDF con AcroForm", "PDF mit AcroForm")}
            <input
              type="file"
              accept="application/pdf"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {selectedTemplateId && (
          <small>{t(`La próxima subida se guardará como nueva versión de ${selectedTemplateLabel}.`, `Der nächste Upload wird als neue Version von ${selectedTemplateLabel} gespeichert.`)}</small>
        )}
      </SectionCard>

      <SectionCard
        title={t("Plantillas", "Vorlagen")}
        description={t("Listado de plantillas y su versión publicada.", "Liste der Vorlagen und ihrer veröffentlichten Version.")}
      >
        {loadingTemplates ? (
          <p>{t("Cargando plantillas...", "Vorlagen werden geladen...")}</p>
        ) : templates.length === 0 ? (
          <EmptyState
            title={t("Todavía no hay plantillas", "Noch keine Vorlagen")}
            description={t("Sube el primer PDF para iniciar el módulo.", "Lade das erste PDF hoch, um das Modul zu starten.")}
          />
        ) : (
          <div className="report-stack">
            {templates.map((template) => (
              <article key={template.id} className="report-row">
                <div className="report-row__copy">
                  <strong>{template.name}</strong>
                  <p>{template.brand}</p>
                  <small>{template.publishedVersionId ? `v ${template.publishedVersionId}` : t("Sin publicar", "Nicht veröffentlicht")}</small>
                </div>
                <div className="report-row__actions">
                  <StatusChip tone={template.status === "published" ? "success" : "warning"}>
                    {template.status === "published" ? t("Publicada", "Veröffentlicht") : t("Borrador", "Entwurf")}
                  </StatusChip>
                  <button type="button" className="ghost" onClick={() => void loadTemplateVersion(template.id)}>
                    {t("Abrir", "Öffnen")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedSummary && selectedVersion && (
        <SectionCard
          title={t("Editor de versión", "Versionseditor")}
          description={t(
            "Edita etiquetas, visibilidad y requisitos antes de publicar.",
            "Bearbeite Labels, Sichtbarkeit und Pflichtfelder vor dem Veröffentlichen."
          )}
          actions={
            <div className="row">
              <button type="button" className="ghost" onClick={() => void handleSaveSchema()} disabled={saving}>
                {saving ? t("Guardando...", "Speichert...") : t("Guardar esquema", "Schema speichern")}
              </button>
              <button type="button" onClick={() => void handlePublish()} disabled={publishing}>
                {publishing ? t("Publicando...", "Veröffentlicht...") : t("Publicar versión", "Version veröffentlichen")}
              </button>
            </div>
          }
        >
          <div className="review-grid">
            <div className="review-grid__preview">
              {pdfUrl ? (
                <object className="pdf-preview-frame editor-pdf-frame" data={pdfUrl} type="application/pdf">
                  <p>{t("Tu navegador no puede mostrar el PDF.", "Der Browser kann das PDF nicht anzeigen.")}</p>
                </object>
              ) : (
                <EmptyState
                  title={t("Sin preview disponible", "Keine Vorschau verfügbar")}
                  description={t("La versión no tiene PDF visible todavía.", "Die Version hat noch kein sichtbares PDF.")}
                />
              )}
            </div>
            <div className="review-grid__summary">
              <div className="validation-list validation-list--success">
                <strong>{selectedSummary.name}</strong>
                <small>{selectedSummary.brand}</small>
                <small>{t(`Versión ${selectedVersion.versionNumber}`, `Version ${selectedVersion.versionNumber}`)}</small>
              </div>
              <div className="report-stack">
                {visibleFields.map((field, index) => (
                  <article key={field.id} className="section-card">
                    <div className="section-card__body stack">
                      <div className="row">
                        <strong>{field.pdfFieldName}</strong>
                        <StatusChip tone={field.includeInForm ? "success" : "warning"}>
                          {field.includeInForm ? t("Visible", "Sichtbar") : t("Oculto", "Versteckt")}
                        </StatusChip>
                      </div>
                      <div className="grid two">
                        <label>
                          {t("Etiqueta", "Label")}
                          <input value={field.label} onChange={(event) => updateField(field.id, (current) => ({ ...current, label: event.target.value }))} />
                        </label>
                        <label>
                          {t("Tipo", "Typ")}
                          <select value={field.type} onChange={(event) => updateField(field.id, (current) => ({ ...current, type: event.target.value as TemplateFieldSchema["type"] }))}>
                            {FIELD_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t("Ayuda", "Hilfetext")}
                          <input value={field.helpText} onChange={(event) => updateField(field.id, (current) => ({ ...current, helpText: event.target.value }))} />
                        </label>
                        <label>
                          {t("Orden", "Reihenfolge")}
                          <input
                            type="number"
                            value={field.sortOrder}
                            onChange={(event) => updateField(field.id, (current) => ({ ...current, sortOrder: Number(event.target.value) || index }))}
                          />
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={field.includeInForm}
                            onChange={(event) => updateField(field.id, (current) => ({ ...current, includeInForm: event.target.checked }))}
                          />
                          {t("Mostrar en formulario", "Im Formular anzeigen")}
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) => updateField(field.id, (current) => ({ ...current, required: event.target.checked }))}
                          />
                          {t("Obligatorio", "Pflichtfeld")}
                        </label>
                        <label className="form-panel__full">
                          {t("Opciones", "Optionen")}
                          <textarea
                            rows={3}
                            value={field.options.join("\n")}
                            onChange={(event) => updateField(field.id, (current) => ({
                              ...current,
                              options: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean)
                            }))}
                          />
                        </label>
                      </div>
                      <small>{t(`Campo PDF: ${field.pdfFieldType} · página ${field.page}`, `PDF-Feld: ${field.pdfFieldType} · Seite ${field.page}`)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

import { ChangeEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { db, functions, storage } from "../firebase";
import { Language, translate } from "../i18n";
import { SuggestTemplateSchemaResult, TemplateFieldSchema, TemplateSummary, TemplateVersion } from "../types";
import { TemplateCanvas } from "./templates/TemplateCanvas";
import { TemplateFieldList } from "./templates/TemplateFieldList";
import { TemplateInspector } from "./templates/TemplateInspector";
import { TemplateLibraryPanel } from "./templates/TemplateLibraryPanel";
import { TemplateToolPanel } from "./templates/TemplateToolPanel";
import { TemplateWorkspaceHeader } from "./templates/TemplateWorkspaceHeader";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type ToolType = TemplateFieldSchema["type"] | null;

type RenderedPage = {
  index: number;
  src: string;
  width: number;
  height: number;
};

interface TemplateManagerProps {
  uid: string;
  isOnline: boolean;
  language: Language;
}

const DEFAULT_RECT: Record<TemplateFieldSchema["type"], { width: number; height: number }> = {
  text: { width: 0.24, height: 0.035 },
  textarea: { width: 0.3, height: 0.09 },
  checkbox: { width: 0.015, height: 0.015 },
  dropdown: { width: 0.22, height: 0.04 },
  image: { width: 0.22, height: 0.14 },
  signature: { width: 0.24, height: 0.08 }
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const snap = (value: number) => Math.round(value * 200) / 200;

const createDefaultField = (type: TemplateFieldSchema["type"], page: number, x: number, y: number): TemplateFieldSchema => {
  const rect = DEFAULT_RECT[type];
  return {
    id: `${type}_${Date.now()}`,
    type,
    source: type === "signature" ? "signature" : type === "image" ? "image" : "dynamic",
    label: `${type}-${Date.now().toString().slice(-4)}`,
    page,
    rect: {
      x: clamp(x, 0, 1 - rect.width),
      y: clamp(y, 0, 1 - rect.height),
      width: rect.width,
      height: rect.height
    },
    required: false,
    options: type === "dropdown" ? ["Option 1", "Option 2"] : [],
    defaultValue: type === "image" ? "1" : "",
    helpText: ""
  };
};

const duplicateField = (field: TemplateFieldSchema): TemplateFieldSchema => ({
  ...field,
  id: `${field.id}_copy_${Date.now().toString().slice(-4)}`,
  label: `${field.label} Copy`,
  generatedByAi: false,
  rect: {
    ...field.rect,
    x: clamp(field.rect.x + 0.02, 0, 1 - field.rect.width),
    y: clamp(field.rect.y + 0.02, 0, 1 - field.rect.height)
  }
});

const renderPdfPages = async (bytes: ArrayBuffer): Promise<RenderedPage[]> => {
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: RenderedPage[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push({
      index: pageIndex - 1,
      src: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height
    });
  }

  return pages;
};

const markVersionAsManual = (version: TemplateVersion): TemplateVersion => ({
  ...version,
  schemaSource: version.schemaSource === "ai" ? "mixed" : version.schemaSource ?? "manual"
});

export const TemplateManager = ({ uid, isOnline, language }: TemplateManagerProps) => {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<TemplateSummary | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<TemplateVersion | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftBrand, setDraftBrand] = useState("");
  const [tool, setTool] = useState<ToolType>(null);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [zoom, setZoom] = useState(1);
  const [visiblePage, setVisiblePage] = useState<number | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingFileName, setWorkingFileName] = useState("");
  const [draggingFieldId, setDraggingFieldId] = useState("");
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const activeVersionRef = useRef<TemplateVersion | null>(null);
  const dragRef = useRef<{
    fieldId: string;
    mode: "move" | "resize";
    pageIndex: number;
    startX: number;
    startY: number;
    rect: TemplateFieldSchema["rect"];
  } | null>(null);
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);

  useEffect(() => {
    activeVersionRef.current = activeVersion;
  }, [activeVersion]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "templates"), where("createdBy", "==", uid)),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TemplateSummary, "id">)
        })).sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
        setTemplates(next);
      }
    );

    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!activeTemplate) {
      setVersions([]);
      setActiveVersion(null);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, `templates/${activeTemplate.id}/versions`), orderBy("versionNumber", "desc")),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TemplateVersion, "id">)
        }));
        setVersions(next);
        setActiveVersion((current) => next.find((entry) => entry.id === current?.id) ?? next[0] ?? null);
      }
    );

    return unsubscribe;
  }, [activeTemplate]);

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      if (!activeVersion?.basePdfPath) {
        setPages([]);
        return;
      }

      try {
        const bytes = await getBytes(ref(storage, activeVersion.basePdfPath));
        const nextPages = await renderPdfPages(bytes);
        if (!cancelled) {
          setPages(nextPages);
          setWorkingFileName(activeVersion.basePdfPath.split("/").pop() ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "PDF konnte nicht geladen werden");
          setPages([]);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [activeVersion?.basePdfPath]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      const currentVersion = activeVersionRef.current;
      if (!drag || !currentVersion) {
        return;
      }

      const pageElement = pageRefs.current[drag.pageIndex];
      if (!pageElement) {
        return;
      }

      const bounds = pageElement.getBoundingClientRect();
      const deltaX = (event.clientX - drag.startX) / bounds.width;
      const deltaY = (event.clientY - drag.startY) / bounds.height;

      const updated = currentVersion.fieldSchema.map((field) => {
        if (field.id !== drag.fieldId) {
          return field;
        }

        if (drag.mode === "move") {
          return {
            ...field,
            rect: {
              ...field.rect,
              x: snap(clamp(drag.rect.x + deltaX, 0, 1 - drag.rect.width)),
              y: snap(clamp(drag.rect.y + deltaY, 0, 1 - drag.rect.height))
            }
          };
        }

        return {
          ...field,
          rect: {
            ...field.rect,
            width: snap(clamp(drag.rect.width + deltaX, field.type === "checkbox" ? 0.015 : 0.02, 1 - drag.rect.x)),
            height: snap(clamp(drag.rect.height + deltaY, field.type === "checkbox" ? 0.015 : 0.02, 1 - drag.rect.y))
          }
        };
      });

      setActiveVersion(markVersionAsManual({
        ...currentVersion,
        fieldSchema: updated
      }));
    };

    const handleUp = () => {
      dragRef.current = null;
      setDraggingFieldId("");
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const selectedField = useMemo(
    () => activeVersion?.fieldSchema.find((field) => field.id === selectedFieldId) ?? null,
    [activeVersion, selectedFieldId]
  );

  const visiblePages = useMemo(
    () => pages.filter((page) => visiblePage === "all" || page.index === visiblePage),
    [pages, visiblePage]
  );

  const versionFields = useMemo(
    () => [...(activeVersion?.fieldSchema ?? [])].sort((left, right) => left.page - right.page || left.label.localeCompare(right.label)),
    [activeVersion]
  );

  const createTemplateDraft = async () => {
    if (!draftName.trim() || !draftBrand.trim()) {
      setError(t("Bitte Name und Marke ausfüllen.", "Completa nombre y marca."));
      return;
    }

    setError("");
    setNotice("");

    const templateRef = await addDoc(collection(db, "templates"), {
      name: draftName.trim(),
      brand: draftBrand.trim(),
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "draft"
    });

    const versionRef = await addDoc(collection(db, `templates/${templateRef.id}/versions`), {
      templateId: templateRef.id,
      basePdfPath: "",
      editablePdfPath: "",
      fieldSchema: [],
      versionNumber: 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      status: "draft"
    });

    setDraftName("");
    setDraftBrand("");
    setActiveTemplate({
      id: templateRef.id,
      name: draftName.trim(),
      brand: draftBrand.trim(),
      createdBy: uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft"
    });
    setActiveVersion({
      id: versionRef.id,
      templateId: templateRef.id,
      basePdfPath: "",
      editablePdfPath: "",
      fieldSchema: [],
      versionNumber: 1,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      status: "draft",
      schemaSource: "manual",
      schemaWarnings: []
    });
    setNotice(t("Vorlagenentwurf erstellt.", "Borrador de plantilla creado."));
  };

  const createNewVersion = async () => {
    if (!activeTemplate) {
      return;
    }

    const latestVersion = versions[0];
    const versionRef = await addDoc(collection(db, `templates/${activeTemplate.id}/versions`), {
      templateId: activeTemplate.id,
      basePdfPath: latestVersion?.basePdfPath ?? "",
      editablePdfPath: "",
      fieldSchema: latestVersion?.fieldSchema ?? [],
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      status: "draft"
    });

    setActiveVersion({
      id: versionRef.id,
      templateId: activeTemplate.id,
      basePdfPath: latestVersion?.basePdfPath ?? "",
      editablePdfPath: "",
      fieldSchema: latestVersion?.fieldSchema ?? [],
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      status: "draft",
      schemaSource: latestVersion?.schemaSource ?? "manual",
      schemaWarnings: latestVersion?.schemaWarnings ?? []
    });
  };

  const uploadBasePdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeTemplate || !activeVersion) {
      return;
    }

    if (!isOnline) {
      setError(t("Offline: PDF Upload nur online möglich.", "Sin conexión: la subida del PDF requiere conexión."));
      return;
    }

    setUploading(true);
    setError("");

    try {
      const storagePath = `templates/${activeTemplate.id}/${activeVersion.id}/base.pdf`;
      await uploadBytes(ref(storage, storagePath), file, { contentType: "application/pdf" });
      await updateDoc(doc(db, `templates/${activeTemplate.id}/versions/${activeVersion.id}`), {
        basePdfPath: storagePath
      });

      setWorkingFileName(file.name);
      setNotice(t("Basis-PDF hochgeladen.", "PDF base subido."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "PDF konnte nicht hochgeladen werden");
    } finally {
      setUploading(false);
    }
  };

  const saveSchema = async () => {
    if (!activeTemplate || !activeVersion) {
      return;
    }

    const ids = activeVersion.fieldSchema.map((field) => field.id.trim()).filter(Boolean);
    const hasDuplicates = new Set(ids).size !== ids.length;
    if (hasDuplicates) {
      setError(t("Feld-IDs müssen eindeutig sein.", "Los IDs de campo deben ser únicos."));
      return;
    }

    const invalidDropdown = activeVersion.fieldSchema.some(
      (field) => field.type === "dropdown" && field.options.filter(Boolean).length === 0
    );
    if (invalidDropdown) {
      setError(t("Dropdown-Felder brauchen Optionen.", "Los dropdowns necesitan opciones."));
      return;
    }

    setError("");
    await updateDoc(doc(db, `templates/${activeTemplate.id}/versions/${activeVersion.id}`), {
      fieldSchema: activeVersion.fieldSchema,
      schemaSource: activeVersion.schemaSource ?? "manual",
      schemaGeneratedAt: activeVersion.schemaGeneratedAt ?? null,
      schemaModel: activeVersion.schemaModel ?? null,
      schemaWarnings: activeVersion.schemaWarnings ?? [],
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(db, "templates", activeTemplate.id), {
      updatedAt: serverTimestamp()
    });
    setNotice(t("Schema gespeichert.", "Esquema guardado."));
  };

  const publishVersion = async () => {
    if (!activeTemplate || !activeVersion) {
      return;
    }

    setPublishing(true);
    setError("");
    try {
      await saveSchema();
      const callable = httpsCallable<
        { templateId: string; versionId: string },
        { editablePdfPath: string; publishedAt: string }
      >(functions, "publishTemplateVersion");
      const result = await callable({ templateId: activeTemplate.id, versionId: activeVersion.id });
      setNotice(
        t(
          `Version veröffentlicht (${new Date(result.data.publishedAt).toLocaleString("de-DE")}).`,
          `Versión publicada (${new Date(result.data.publishedAt).toLocaleString("es-ES")}).`
        )
      );
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Veröffentlichung fehlgeschlagen");
    } finally {
      setPublishing(false);
    }
  };

  const analyzeWithAi = async () => {
    if (!activeTemplate || !activeVersion?.basePdfPath) {
      return;
    }

    const hasExistingFields = activeVersion.fieldSchema.length > 0;
    const overwriteExisting = hasExistingFields
      ? window.confirm(
          t(
            "OK ersetzt die aktuelle Feldliste. Abbrechen mischt den KI-Entwurf mit den vorhandenen Feldern.",
            "Aceptar reemplaza la lista actual. Cancelar mezcla el borrador IA con los campos existentes."
          )
        )
      : true;

    setAnalyzing(true);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<
        { templateId: string; versionId: string; overwriteExisting: boolean },
        SuggestTemplateSchemaResult
      >(functions, "suggestTemplateSchema");
      const result = await callable({
        templateId: activeTemplate.id,
        versionId: activeVersion.id,
        overwriteExisting
      });

      setActiveVersion((current) =>
        current
          ? {
              ...current,
              fieldSchema: result.data.fieldSchema,
              schemaSource: result.data.schemaSource,
              schemaGeneratedAt: result.data.generatedAt,
              schemaModel: result.data.model,
              schemaWarnings: result.data.warnings
            }
          : current
      );
      setSelectedFieldId(result.data.fieldSchema[0]?.id ?? "");
      const warningsText = result.data.warnings.length > 0 ? ` · ${result.data.warnings.join(" · ")}` : "";
      setNotice(
        t(
          `KI-Analyse abgeschlossen: ${result.data.fieldSchema.length} Felder erkannt. ${result.data.summary}${warningsText}`,
          `Análisis IA completado: ${result.data.fieldSchema.length} campos detectados. ${result.data.summary}${warningsText}`
        )
      );
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "KI-Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  };

  const placeField = (pageIndex: number, event: ReactMouseEvent<HTMLDivElement>) => {
    if (!tool || !activeVersion) {
      return;
    }

    const pageElement = pageRefs.current[pageIndex];
    if (!pageElement) {
      return;
    }

    const bounds = pageElement.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const nextField = createDefaultField(tool, pageIndex, x, y);

    setActiveVersion(markVersionAsManual({
      ...activeVersion,
      fieldSchema: [...activeVersion.fieldSchema, { ...nextField, generatedByAi: false, aiConfidence: undefined, aiReason: undefined }]
    }));
    setSelectedFieldId(nextField.id);
    setTool(null);
  };

  const startDrag = (
    event: ReactMouseEvent<HTMLElement>,
    field: TemplateFieldSchema,
    mode: "move" | "resize"
  ) => {
    event.stopPropagation();
    dragRef.current = {
      fieldId: field.id,
      mode,
      pageIndex: field.page,
      startX: event.clientX,
      startY: event.clientY,
      rect: field.rect
    };
    setDraggingFieldId(field.id);
    setSelectedFieldId(field.id);
  };

  const updateSelectedField = (patch: Partial<TemplateFieldSchema>) => {
    if (!activeVersion || !selectedField) {
      return;
    }

    setActiveVersion(markVersionAsManual({
      ...activeVersion,
      fieldSchema: activeVersion.fieldSchema.map((field) =>
        field.id === selectedField.id
          ? {
              ...field,
              ...patch
            }
          : field
      )
    }));
  };

  const updateDropdownOption = (index: number, value: string) => {
    if (!selectedField || selectedField.type !== "dropdown") {
      return;
    }

    const nextOptions = [...selectedField.options];
    nextOptions[index] = value;
    updateSelectedField({ options: nextOptions });
  };

  const addDropdownOption = () => {
    if (!selectedField || selectedField.type !== "dropdown") {
      return;
    }

    updateSelectedField({ options: [...selectedField.options, `Option ${selectedField.options.length + 1}`] });
  };

  const removeDropdownOption = (index: number) => {
    if (!selectedField || selectedField.type !== "dropdown") {
      return;
    }

    updateSelectedField({ options: selectedField.options.filter((_, optionIndex) => optionIndex !== index) });
  };

  const removeSelectedField = () => {
    if (!activeVersion || !selectedField) {
      return;
    }

    setActiveVersion(markVersionAsManual({
      ...activeVersion,
      fieldSchema: activeVersion.fieldSchema.filter((field) => field.id !== selectedField.id)
    }));
    setSelectedFieldId("");
  };

  const addDuplicateField = () => {
    if (!activeVersion || !selectedField) {
      return;
    }

    const copy = duplicateField(selectedField);
    setActiveVersion(markVersionAsManual({
      ...activeVersion,
      fieldSchema: [...activeVersion.fieldSchema, copy]
    }));
    setSelectedFieldId(copy.id);
  };

  return (
    <section className="template-workspace">
      <TemplateWorkspaceHeader
        template={activeTemplate}
        version={activeVersion}
        workingFileName={workingFileName}
        isAnalyzing={analyzing}
        isPublishing={publishing}
        canSave={Boolean(activeTemplate && activeVersion)}
        canPublish={Boolean(activeTemplate && activeVersion?.basePdfPath)}
        canAnalyze={Boolean(activeTemplate && activeVersion?.basePdfPath)}
        onCreateVersion={createNewVersion}
        onAnalyze={analyzeWithAi}
        onSave={saveSchema}
        onPublish={publishVersion}
        t={t}
      />

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="template-workspace-grid">
        <aside className="template-workspace-sidebar">
          <TemplateLibraryPanel
            templates={templates}
            activeTemplateId={activeTemplate?.id ?? null}
            versions={versions}
            activeVersionId={activeVersion?.id ?? null}
            draftName={draftName}
            draftBrand={draftBrand}
            isOnline={isOnline}
            workingFileName={workingFileName}
            onDraftNameChange={setDraftName}
            onDraftBrandChange={setDraftBrand}
            onCreateTemplate={() => void createTemplateDraft()}
            onSelectTemplate={setActiveTemplate}
            onSelectVersion={setActiveVersion}
            onUploadBasePdf={uploadBasePdf}
            t={t}
          />

          <TemplateToolPanel
            tool={tool}
            zoom={zoom}
            visiblePage={visiblePage}
            pagesCount={pages.length}
            onToolChange={setTool}
            onZoomIn={() => setZoom((current) => Math.min(2, Number((current + 0.1).toFixed(2))))}
            onZoomOut={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}
            onZoomReset={() => setZoom(1)}
            onVisiblePageChange={setVisiblePage}
            t={t}
          />

          <TemplateFieldList
            fields={versionFields}
            selectedFieldId={selectedFieldId}
            onSelectField={(field) => {
              setSelectedFieldId(field.id);
              setVisiblePage(field.page);
            }}
            t={t}
          />
        </aside>

        <main className="template-workspace-canvas">
          {activeTemplate && activeVersion ? (
            <TemplateCanvas
              pages={pages}
              visiblePage={visiblePage}
              zoom={zoom}
              activeVersion={activeVersion}
              selectedFieldId={selectedFieldId}
              draggingFieldId={draggingFieldId}
              pageRefs={pageRefs}
              onPlaceField={placeField}
              onSelectField={(field) => setSelectedFieldId(field.id)}
              onStartDrag={startDrag}
              t={t}
            />
          ) : (
            <article className="card stack template-canvas-empty">
              <h3>{t("Canvas", "Lienzo")}</h3>
              <p className="empty-state">
                {t(
                  "Erstelle oder wähle eine Vorlage aus, um mit dem Zeichnen von Feldern zu beginnen.",
                  "Crea o selecciona una plantilla para empezar a dibujar campos."
                )}
              </p>
            </article>
          )}
        </main>

        <aside className="template-workspace-inspector">
          <TemplateInspector
            field={selectedField}
            onUpdateField={updateSelectedField}
            onUpdateDropdownOption={updateDropdownOption}
            onAddDropdownOption={addDropdownOption}
            onRemoveDropdownOption={removeDropdownOption}
            onDuplicateField={addDuplicateField}
            onRemoveField={removeSelectedField}
            t={t}
          />
        </aside>
      </div>
    </section>
  );
};

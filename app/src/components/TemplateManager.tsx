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
import { TemplateFieldSchema, TemplateSummary, TemplateVersion } from "../types";

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

const TOOLBAR_ITEMS: Array<{ type: TemplateFieldSchema["type"]; label: string }> = [
  { type: "text", label: "Text" },
  { type: "textarea", label: "Textarea" },
  { type: "checkbox", label: "Checkbox" },
  { type: "dropdown", label: "Dropdown" },
  { type: "image", label: "Image" },
  { type: "signature", label: "Signature" }
];

const DEFAULT_RECT: Record<TemplateFieldSchema["type"], { width: number; height: number }> = {
  text: { width: 0.24, height: 0.035 },
  textarea: { width: 0.3, height: 0.09 },
  checkbox: { width: 0.03, height: 0.03 },
  dropdown: { width: 0.22, height: 0.04 },
  image: { width: 0.22, height: 0.14 },
  signature: { width: 0.24, height: 0.08 }
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingFileName, setWorkingFileName] = useState("");
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
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
    if (!dragRef.current || !activeVersion) {
      return undefined;
    }

    const handleMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const pageElement = pageRefs.current[drag.pageIndex];
      if (!pageElement) {
        return;
      }

      const bounds = pageElement.getBoundingClientRect();
      const deltaX = (event.clientX - drag.startX) / bounds.width;
      const deltaY = (event.clientY - drag.startY) / bounds.height;

      const updated = activeVersion.fieldSchema.map((field) => {
        if (field.id !== drag.fieldId) {
          return field;
        }

        if (drag.mode === "move") {
          return {
            ...field,
            rect: {
              ...field.rect,
              x: clamp(drag.rect.x + deltaX, 0, 1 - drag.rect.width),
              y: clamp(drag.rect.y + deltaY, 0, 1 - drag.rect.height)
            }
          };
        }

        return {
          ...field,
          rect: {
            ...field.rect,
            width: clamp(drag.rect.width + deltaX, 0.02, 1 - drag.rect.x),
            height: clamp(drag.rect.height + deltaY, 0.02, 1 - drag.rect.y)
          }
        };
      });

      setActiveVersion({
        ...activeVersion,
        fieldSchema: updated
      });
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [activeVersion]);

  const selectedField = useMemo(
    () => activeVersion?.fieldSchema.find((field) => field.id === selectedFieldId) ?? null,
    [activeVersion, selectedFieldId]
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
      status: "draft"
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
      status: "draft"
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
      setNotice(t("PDF base cargado.", "PDF base subido."));
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

    setActiveVersion({
      ...activeVersion,
      fieldSchema: [...activeVersion.fieldSchema, nextField]
    });
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
    setSelectedFieldId(field.id);
  };

  const updateSelectedField = (patch: Partial<TemplateFieldSchema>) => {
    if (!activeVersion || !selectedField) {
      return;
    }

    setActiveVersion({
      ...activeVersion,
      fieldSchema: activeVersion.fieldSchema.map((field) =>
        field.id === selectedField.id
          ? {
              ...field,
              ...patch
            }
          : field
      )
    });
  };

  const removeSelectedField = () => {
    if (!activeVersion || !selectedField) {
      return;
    }

    setActiveVersion({
      ...activeVersion,
      fieldSchema: activeVersion.fieldSchema.filter((field) => field.id !== selectedField.id)
    });
    setSelectedFieldId("");
  };

  const addDuplicateField = () => {
    if (!activeVersion || !selectedField) {
      return;
    }

    const copy = duplicateField(selectedField);
    setActiveVersion({
      ...activeVersion,
      fieldSchema: [...activeVersion.fieldSchema, copy]
    });
    setSelectedFieldId(copy.id);
  };

  return (
    <section className="card stack">
      <div className="page-head">
        <div>
          <h2>{t("PDF Plantillas", "Plantillas PDF")}</h2>
          <p>{t("PDF planen, Felder zeichnen und als AcroForm veröffentlichen.", "Sube un PDF, dibuja campos y publícalo como AcroForm.")}</p>
        </div>
        {activeTemplate && (
          <div className="row">
            <button type="button" className="ghost" onClick={createNewVersion}>
              {t("Neue Version", "Nueva versión")}
            </button>
            <button type="button" className="ghost" onClick={saveSchema}>
              {t("Entwurf speichern", "Guardar borrador")}
            </button>
            <button type="button" disabled={publishing || !activeVersion?.basePdfPath} onClick={publishVersion}>
              {publishing ? t("Veröffentliche...", "Publicando...") : t("Version veröffentlichen", "Publicar versión")}
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!activeTemplate && (
        <div className="grid two">
          <label>
            {t("Template-Name", "Nombre de plantilla")}
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </label>
          <label>
            {t("Marke", "Marca")}
            <input value={draftBrand} onChange={(event) => setDraftBrand(event.target.value)} />
          </label>
          <button type="button" disabled={!isOnline} onClick={() => void createTemplateDraft()}>
            {t("Neue Vorlage anlegen", "Crear nueva plantilla")}
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="template-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={activeTemplate?.id === template.id ? "template-card active" : "template-card"}
              onClick={() => setActiveTemplate(template)}
            >
              <strong>{template.name}</strong>
              <small>{template.brand}</small>
              <small>{template.status}</small>
            </button>
          ))}
        </div>
      )}

      {activeTemplate && activeVersion && (
        <div className="template-editor-layout">
          <aside className="template-side stack">
            <div className="card stack">
              <h3>{activeTemplate.name}</h3>
              <p>{t("Marke", "Marca")}: {activeTemplate.brand}</p>
              <p>{t("Version", "Versión")}: {activeVersion.versionNumber}</p>
              <p>{t("Datei", "Archivo")}: {workingFileName || "-"}</p>
              <label>
                {t("Basis-PDF hochladen", "Subir PDF base")}
                <input type="file" accept="application/pdf" disabled={uploading || !isOnline} onChange={uploadBasePdf} />
              </label>
            </div>

            <div className="card stack">
              <h3>{t("Werkzeuge", "Herramientas")}</h3>
              <div className="toolbar-grid">
                {TOOLBAR_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className={tool === item.type ? "tab active" : "tab"}
                    onClick={() => setTool(item.type)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card stack">
              <h3>{t("Versionen", "Versiones")}</h3>
              <div className="stack">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    className={activeVersion.id === version.id ? "tab active" : "tab"}
                    onClick={() => setActiveVersion(version)}
                  >
                    #{version.versionNumber} · {version.status}
                  </button>
                ))}
              </div>
            </div>

            {selectedField && (
              <div className="card stack">
                <h3>{t("Feldeigenschaften", "Propiedades del campo")}</h3>
                <label>
                  ID
                  <input value={selectedField.id} onChange={(event) => updateSelectedField({ id: event.target.value })} />
                </label>
                <label>
                  Label
                  <input value={selectedField.label} onChange={(event) => updateSelectedField({ label: event.target.value })} />
                </label>
                <label>
                  Help Text
                  <input
                    value={selectedField.helpText}
                    onChange={(event) => updateSelectedField({ helpText: event.target.value })}
                  />
                </label>
                {selectedField.type === "dropdown" && (
                  <label>
                    Optionen (eine pro Zeile)
                    <textarea
                      value={selectedField.options.join("\n")}
                      onChange={(event) =>
                        updateSelectedField({
                          options: event.target.value.split("\n").map((entry) => entry.trim()).filter(Boolean)
                        })
                      }
                    />
                  </label>
                )}
                {(selectedField.type === "image" || selectedField.type === "signature") && (
                  <label>
                    Default Value / Slot
                    <input
                      value={selectedField.defaultValue}
                      onChange={(event) => updateSelectedField({ defaultValue: event.target.value })}
                    />
                  </label>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selectedField.required}
                    onChange={(event) => updateSelectedField({ required: event.target.checked })}
                  />
                  Required
                </label>
                <div className="row">
                  <button type="button" className="ghost" onClick={addDuplicateField}>
                    {t("Duplizieren", "Duplicar")}
                  </button>
                  <button type="button" onClick={removeSelectedField}>
                    {t("Löschen", "Eliminar")}
                  </button>
                </div>
              </div>
            )}
          </aside>

          <div className="template-canvas-stack">
            {pages.length === 0 && <p>{t("Bitte zuerst ein PDF hochladen.", "Sube primero un PDF.")}</p>}
            {pages.map((page) => (
              <div key={page.index} className="template-page-card">
                <div className="template-page-title">
                  {t("Seite", "Página")} {page.index + 1}
                </div>
                <div
                  ref={(node) => {
                    pageRefs.current[page.index] = node;
                  }}
                  className="template-page-surface"
                  style={{ width: page.width, height: page.height }}
                  onClick={(event) => placeField(page.index, event)}
                >
                  <img src={page.src} alt={`page-${page.index + 1}`} draggable={false} />
                  {activeVersion.fieldSchema
                    .filter((field) => field.page === page.index)
                    .map((field) => (
                      <div
                        key={field.id}
                        className={selectedFieldId === field.id ? "template-field active" : "template-field"}
                        style={{
                          left: `${field.rect.x * 100}%`,
                          top: `${field.rect.y * 100}%`,
                          width: `${field.rect.width * 100}%`,
                          height: `${field.rect.height * 100}%`
                        }}
                        onMouseDown={(event) => startDrag(event, field, "move")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedFieldId(field.id);
                        }}
                      >
                        <span>{field.label}</span>
                        <button
                          type="button"
                          className="resize-handle"
                          onMouseDown={(event) => startDrag(event, field, "resize")}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

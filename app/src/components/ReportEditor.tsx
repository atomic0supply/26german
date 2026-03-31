import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  ACTION_OPTIONS,
  ATTENDEE_OPTIONS,
  DAMAGE_OPTIONS,
  PHOTO_SLOTS,
  TECHNIQUE_OPTIONS,
  TEMPLATE_OPTIONS_BY_ID
} from "../constants";
import { db, functions, storage } from "../firebase";
import { normalizeReportData } from "../lib/firestore";
import { validateReportForFinalize } from "../lib/validation";
import { ClientData, FinalizeReportResult, ReportData, TemplateFieldSchema, TemplateVersion } from "../types";
import { SignaturePad } from "./SignaturePad";

interface ReportEditorProps {
  reportId: string;
  uid: string;
  isOnline: boolean;
  onBack: () => void;
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const EditorSection = ({
  title,
  description,
  collapsed,
  onToggle,
  children
}: {
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <section className="editor-section-card">
    <button type="button" className="editor-section-header" onClick={onToggle}>
      <span>
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span>{collapsed ? "+" : "-"}</span>
    </button>
    {!collapsed && <div className="editor-section-body stack">{children}</div>}
  </section>
);

export const ReportEditor = ({ reportId, uid, isOnline, onBack }: ReportEditorProps) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [customTemplateVersion, setCustomTemplateVersion] = useState<TemplateVersion | null>(null);
  const [editorViewMode, setEditorViewMode] = useState<"split" | "form" | "preview">("split");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    contacts: true,
    advanced: true
  });
  const previewBlobUrlRef = useRef("");
  const previewRequestIdRef = useRef(0);
  const templatePreviewInitRef = useRef<string | null>(null);

  const reportRef = useMemo(() => doc(db, "reports", reportId), [reportId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      reportRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Bericht wurde nicht gefunden.");
          setLoading(false);
          return;
        }

        const parsed = normalizeReportData(snapshot.data());
        setReport(parsed);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [reportRef]);

  useEffect(() => {
    const clientsQuery = query(collection(db, "clients"), where("createdBy", "==", uid));
    const unsubscribe = onSnapshot(clientsQuery, (snapshot) => {
      const next = snapshot.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            email: String(data.email ?? ""),
            phone: String(data.phone ?? ""),
            location: String(data.location ?? ""),
            createdBy: String(data.createdBy ?? uid),
            createdAt: String(data.createdAt ?? ""),
            updatedAt: String(data.updatedAt ?? "")
          } satisfies ClientData;
        })
        .sort((left, right) => left.email.localeCompare(right.email, "de"));
      setClients(next);
    });

    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!report?.templateRef || !report.templateVersionRef) {
      setCustomTemplateVersion(null);
      return;
    }

    const templateVersionRef = doc(db, `templates/${report.templateRef}/versions/${report.templateVersionRef}`);
    const unsubscribe = onSnapshot(
      templateVersionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setCustomTemplateVersion(null);
          return;
        }

        setCustomTemplateVersion({
          id: snapshot.id,
          ...(snapshot.data() as Omit<TemplateVersion, "id">)
        });
      },
      () => {
        setCustomTemplateVersion(null);
      }
    );

    return unsubscribe;
  }, [report?.templateRef, report?.templateVersionRef]);

  const readOnly = saving || !isOnline || report?.status === "finalized";
  const toggleSection = (key: string) => {
    setCollapsedSections((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  };

  const customDynamicFields = useMemo(
    () =>
      (customTemplateVersion?.fieldSchema ?? []).filter(
        (field) => field.source === "dynamic"
      ),
    [customTemplateVersion]
  );

  const customAssetFields = useMemo(
    () =>
      (customTemplateVersion?.fieldSchema ?? []).filter(
        (field) => field.source === "image"
      ),
    [customTemplateVersion]
  );

  const customSignatureFields = useMemo(
    () =>
      (customTemplateVersion?.fieldSchema ?? []).filter(
        (field) => field.source === "signature"
      ),
    [customTemplateVersion]
  );

  const requiredTemplateFields = useMemo(() => {
    if (report?.brandTemplateId === "custom") {
      return customDynamicFields
        .filter((field) => field.required)
        .map((field) => `templateFields.${field.id}`);
    }

    return report ? (TEMPLATE_OPTIONS_BY_ID[report.brandTemplateId]?.requiredTemplateFields ?? []) : [];
  }, [customDynamicFields, report]);

  const validationErrors = useMemo(
    () => (report ? validateReportForFinalize(report, requiredTemplateFields) : []),
    [report, requiredTemplateFields]
  );

  const updateReport = (updater: (previous: ReportData) => ReportData) => {
    setReport((previous) => {
      if (!previous) {
        return previous;
      }

      return updater(previous);
    });
  };

  const uploadSignatureIfNeeded = async (current: ReportData): Promise<ReportData> => {
    if (!current.signature.dataUrl || !current.signature.dataUrl.startsWith("data:image")) {
      return current;
    }

    const { dataUrl: _dataUrl, ...signatureWithoutDataUrl } = current.signature;
    const blob = await dataUrlToBlob(current.signature.dataUrl);
    const storagePath = `report-signatures/${reportId}/technician.png`;
    const signatureRef = ref(storage, storagePath);

    await uploadBytes(signatureRef, blob, {
      contentType: "image/png"
    });

    const downloadUrl = await getDownloadURL(signatureRef);

    return {
      ...current,
      signature: {
        ...signatureWithoutDataUrl,
        storagePath,
        downloadUrl,
        signedAt: new Date().toISOString()
      }
    };
  };

  const uploadTemplateAsset = async (field: TemplateFieldSchema, file?: File) => {
    if (!report || !file) {
      return;
    }

    if (!isOnline) {
      setError("Offline: Datei-Upload ist nur online möglich.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `report-template-assets/${reportId}/${field.id}-${safeName}`;
      const assetRef = ref(storage, storagePath);

      await uploadBytes(assetRef, file, { contentType: file.type || "application/octet-stream" });
      const downloadUrl = await getDownloadURL(assetRef);

      updateReport((previous) => ({
        ...previous,
        templateAssetPaths: {
          ...(previous.templateAssetPaths ?? {}),
          [field.id]: storagePath
        },
        templateAssetUrls: {
          ...(previous.templateAssetUrls ?? {}),
          [field.id]: downloadUrl
        }
      }));

      setNotice(`Asset für ${field.label} hochgeladen.`);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Asset konnte nicht hochgeladen werden";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const persistReport = async (showNotice = true): Promise<ReportData | null> => {
    if (!report) {
      return null;
    }

    if (!isOnline) {
      setError("Offline: Speichern ist nur online möglich.");
      return null;
    }

    setSaving(true);
    setError("");

    try {
      const withSignature = await uploadSignatureIfNeeded(report);
      const { dataUrl: _transientDataUrl, ...signatureForPersistence } = withSignature.signature;
      const payload: Record<string, unknown> = {
        ...withSignature,
        signature: signatureForPersistence,
        updatedAt: serverTimestamp()
      };
      if (!withSignature.finalization) {
        delete payload.finalization;
      }

      await updateDoc(reportRef, payload);

      if (withSignature.photos.length > 0) {
        await Promise.all(
          withSignature.photos.map((photo) =>
            setDoc(doc(db, `reports/${reportId}/photos/${photo.id}`), photo, {
              merge: true
            })
          )
        );
      }

      setReport(withSignature);
      if (showNotice) {
        setNotice("Bericht gespeichert.");
      }
      return withSignature;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Bericht konnte nicht gespeichert werden";
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (slot: number, file?: File) => {
    if (!report || !file) {
      return;
    }

    if (!isOnline) {
      setError("Offline: Foto-Upload ist nur online möglich.");
      return;
    }

    setError("");

    try {
      const existing = report.photos.find((item) => item.slot === slot);
      const photoId = existing?.id ?? crypto.randomUUID();
      const storagePath = `report-photos/${reportId}/${photoId}-${file.name}`;
      const photoRef = ref(storage, storagePath);

      await uploadBytes(photoRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(photoRef);

      const nextPhoto = {
        id: photoId,
        slot,
        location: existing?.location ?? `Bild ${slot}`,
        documentation: existing?.documentation ?? "",
        storagePath,
        downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      await setDoc(doc(db, `reports/${reportId}/photos/${photoId}`), nextPhoto, { merge: true });

      updateReport((previous) => {
        const remaining = previous.photos.filter((photo) => photo.slot !== slot);
        return {
          ...previous,
          photos: [...remaining, nextPhoto].sort((left, right) => left.slot - right.slot)
        };
      });

      setNotice(`Foto für Slot ${slot} hochgeladen.`);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Foto konnte nicht hochgeladen werden";
      setError(message);
    }
  };

  const updatePhotoMeta = (slot: number, key: "location" | "documentation", value: string) => {
    updateReport((previous) => {
      const current = previous.photos.find((photo) => photo.slot === slot);
      const next = {
        id: current?.id ?? crypto.randomUUID(),
        slot,
        location: key === "location" ? value : current?.location ?? `Bild ${slot}`,
        documentation: key === "documentation" ? value : current?.documentation ?? "",
        storagePath: current?.storagePath ?? "",
        downloadUrl: current?.downloadUrl ?? "",
        uploadedAt: current?.uploadedAt ?? new Date().toISOString()
      };

      const remaining = previous.photos.filter((photo) => photo.slot !== slot);
      return {
        ...previous,
        photos: [...remaining, next].sort((left, right) => left.slot - right.slot)
      };
    });
  };

  const finalizeReport = async () => {
    const persisted = await persistReport(false);
    if (!persisted) {
      return;
    }

    const validationErrors = validateReportForFinalize(persisted, requiredTemplateFields);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    setSaving(true);
    setError("");

    try {
      const callable = httpsCallable<{ reportId: string }, FinalizeReportResult>(functions, "finalizeReport");
      const result = await callable({ reportId });
      setNotice(`Bericht finalisiert am ${new Date(result.data.finalizedAt).toLocaleString("de-DE")}`);
      previewRequestIdRef.current += 1;
      setPreviewLoading(false);

      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = "";
      }
      setPreviewUrl(result.data.pdfUrl);

      const latest = await getDoc(reportRef);
      if (latest.exists()) {
        setReport(normalizeReportData(latest.data()));
      }
    } catch (finalizeError) {
      const message = finalizeError instanceof Error ? finalizeError.message : "Finalisierung fehlgeschlagen";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const previewPdf = async () => {
    const persisted = await persistReport(false);
    if (!persisted) {
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreviewLoading(true);
    setError("");

    try {
      const callable = httpsCallable<
        { reportId: string },
        { previewUrl?: string; previewBase64?: string; mimeType?: string }
      >(functions, "previewPdf");
      const result = await callable({ reportId });

      if (requestId !== previewRequestIdRef.current) {
        return;
      }

      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = "";
      }

      if (result.data.previewBase64) {
        const mimeType = result.data.mimeType || "application/pdf";
        const binary = atob(result.data.previewBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        previewBlobUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      } else if (result.data.previewUrl) {
        setPreviewUrl(result.data.previewUrl);
      } else {
        setPreviewUrl("");
      }

      setNotice("PDF-Vorschau erstellt.");
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Vorschau konnte nicht erzeugt werden";
      setError(message);
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setPreviewLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!report) {
      return;
    }

    if (templatePreviewInitRef.current === null) {
      templatePreviewInitRef.current = report.brandTemplateId;
      return;
    }

    if (templatePreviewInitRef.current === report.brandTemplateId) {
      return;
    }

    templatePreviewInitRef.current = report.brandTemplateId;
    if (report.status !== "finalized" && isOnline) {
      void previewPdf();
    }
  }, [report?.brandTemplateId, report?.status, isOnline]);

  const sendPdfByEmail = async () => {
    if (!report) {
      return;
    }

    if (!isOnline) {
      setError("Offline: E-Mail Versand ist nur online möglich.");
      return;
    }

    if (report.status !== "finalized") {
      setError("Bitte den Bericht zuerst finalisieren.");
      return;
    }

    if (!report.clientId) {
      setError("Bitte zuerst einen Kunden auswählen.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<
        { reportId: string; clientId: string },
        { recipient: string; sentAt: string }
      >(functions, "sendReportEmail");

      const result = await callable({ reportId, clientId: report.clientId });
      setNotice(`PDF per E-Mail gesendet an ${result.data.recipient} (${new Date(result.data.sentAt).toLocaleString("de-DE")}).`);
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : "E-Mail Versand fehlgeschlagen";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="container">
        <p>Lade Bericht...</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="container stack">
        <button type="button" className="ghost" onClick={onBack}>
          Zurück
        </button>
        <p className="error">{error || "Bericht konnte nicht geladen werden."}</p>
      </main>
    );
  }

  if (report.createdBy !== uid) {
    return (
      <main className="container stack">
        <button type="button" className="ghost" onClick={onBack}>
          Zurück
        </button>
        <p className="error">Kein Zugriff auf diesen Bericht.</p>
      </main>
    );
  }

  if (report.brandTemplateId !== "custom") {
    return (
      <main className="container stack">
        <button type="button" className="ghost" onClick={onBack}>
          Zurück
        </button>
        <section className="card stack">
          <h2>Legacy-Bericht</h2>
          <p>Dieser Bericht gehört noch zum alten Vorlagen-Workflow.</p>
          <p>Die App arbeitet jetzt nur noch mit veröffentlichten PDF-Vorlagen aus dem visuellen Editor.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <section className="editor-toolbar surface">
        <div>
          <p className="eyebrow">Report Workspace</p>
          <h1>{report.templateName ?? "Custom Template"}</h1>
          <p>Projekt {report.projectInfo.projectNumber || "-"} · {report.status === "finalized" ? "Final" : "Entwurf"}</p>
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={onBack}>
            Zurück
          </button>
          <button type="button" className={editorViewMode === "form" ? "tab active" : "tab"} onClick={() => setEditorViewMode("form")}>
            Formular
          </button>
          <button type="button" className={editorViewMode === "split" ? "tab active" : "tab"} onClick={() => setEditorViewMode("split")}>
            Split
          </button>
          <button type="button" className={editorViewMode === "preview" ? "tab active" : "tab"} onClick={() => setEditorViewMode("preview")}>
            Preview
          </button>
          <button type="button" className="ghost" disabled={readOnly} onClick={() => void persistReport()}>
            Speichern
          </button>
          <button type="button" className="ghost" disabled={readOnly || previewLoading} onClick={previewPdf}>
            {previewLoading ? "Erzeuge Vorschau..." : "PDF Vorschau"}
          </button>
          <button type="button" disabled={readOnly} onClick={finalizeReport}>
            Finalisieren
          </button>
          <button
            type="button"
            className="ghost"
            disabled={saving || !isOnline || report.status !== "finalized" || !report.clientId}
            onClick={sendPdfByEmail}
          >
            PDF per E-Mail senden
          </button>
        </div>
      </section>

      {!isOnline && <div className="offline-banner editor-summary-bar">Offline: Diese v1-App unterstützt nur Online-Bearbeitung.</div>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <section className={editorViewMode === "form" ? "editor-layout form-only" : editorViewMode === "preview" ? "editor-layout preview-only" : "editor-layout"}>
        <div className="editor-form-pane stack">
          <div className="surface editor-summary-bar">
            <strong>{validationErrors.length === 0 ? "Bereit zur Finalisierung" : `${validationErrors.length} offene Punkte`}</strong>
            <span>{customDynamicFields.length} dynamische Felder · {report.photos.length} Fotos · {previewUrl ? "Preview bereit" : "Noch keine Preview"}</span>
          </div>

          <EditorSection
            title="Projekt"
            description="Vorlage, Termin und Ansprechpartner"
            collapsed={Boolean(collapsedSections.project)}
            onToggle={() => toggleSection("project")}
          >
            <div className="grid two">
              <label>
                Vorlage
                <input value={report.templateName ?? "Custom Template"} disabled />
              </label>

              <label>
                Projektnummer
                <input
                  value={report.projectInfo.projectNumber}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      projectInfo: {
                        ...previous.projectInfo,
                        projectNumber: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Messtermin
                <input
                  type="datetime-local"
                  value={report.projectInfo.appointmentDate}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      projectInfo: {
                        ...previous.projectInfo,
                        appointmentDate: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Messtechniker
                <input
                  value={report.projectInfo.technicianName}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      projectInfo: {
                        ...previous.projectInfo,
                        technicianName: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Erstmeldung durch
                <input
                  value={report.projectInfo.firstReportBy}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      projectInfo: {
                        ...previous.projectInfo,
                        firstReportBy: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Messort / Objekt
                <input
                  value={report.projectInfo.locationObject}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      projectInfo: {
                        ...previous.projectInfo,
                        locationObject: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Kunde (E-Mail Versand)
                <select
                  value={report.clientId}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      clientId: event.target.value
                    }))
                  }
                >
                  <option value="">Bitte auswählen</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.email} · {client.location}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </EditorSection>

          {customTemplateVersion && (
            <EditorSection
              title="Campos PDF"
              description="Felder aus der veröffentlichten Vorlage"
              collapsed={Boolean(collapsedSections.pdf)}
              onToggle={() => toggleSection("pdf")}
            >
              <div className="grid two">
                {customDynamicFields
                  .filter((field) => field.type === "text" || field.type === "dropdown")
                  .map((field) => (
                    <label key={field.id}>
                      {field.label}
                      {field.type === "dropdown" ? (
                        <select
                          value={typeof report.templateFields[field.id] === "string" ? String(report.templateFields[field.id]) : ""}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateReport((previous) => ({
                              ...previous,
                              templateFields: {
                                ...previous.templateFields,
                                [field.id]: event.target.value
                              }
                            }))
                          }
                        >
                          <option value="">Bitte auswählen</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={typeof report.templateFields[field.id] === "string" ? String(report.templateFields[field.id]) : ""}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateReport((previous) => ({
                              ...previous,
                              templateFields: {
                                ...previous.templateFields,
                                [field.id]: event.target.value
                              }
                            }))
                          }
                        />
                      )}
                      {field.helpText && <small>{field.helpText}</small>}
                    </label>
                  ))}
              </div>

              {customDynamicFields
                .filter((field) => field.type === "textarea")
                .map((field) => (
                  <label key={field.id}>
                    {field.label}
                    <textarea
                      value={typeof report.templateFields[field.id] === "string" ? String(report.templateFields[field.id]) : ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateReport((previous) => ({
                          ...previous,
                          templateFields: {
                            ...previous.templateFields,
                            [field.id]: event.target.value
                          }
                        }))
                      }
                    />
                    {field.helpText && <small>{field.helpText}</small>}
                  </label>
                ))}

              {customDynamicFields.some((field) => field.type === "checkbox") && (
                <div className="checkbox-grid">
                  {customDynamicFields
                    .filter((field) => field.type === "checkbox")
                    .map((field) => (
                      <label key={field.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(report.templateFields[field.id])}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateReport((previous) => ({
                              ...previous,
                              templateFields: {
                                ...previous.templateFields,
                                [field.id]: event.target.checked
                              }
                            }))
                          }
                        />
                        {field.label}
                      </label>
                    ))}
                </div>
              )}

              {customAssetFields.length > 0 && (
                <div className="template-asset-grid">
                  {customAssetFields.map((field) => (
                    <div key={field.id} className="photo-slot">
                      <h3>{field.label}</h3>
                      {field.helpText && <p>{field.helpText}</p>}
                      {report.templateAssetUrls?.[field.id] ? (
                        <a href={report.templateAssetUrls[field.id]} target="_blank" rel="noreferrer">
                          Asset öffnen
                        </a>
                      ) : (
                        <p>Noch kein Asset hochgeladen.</p>
                      )}
                      <label>
                        Datei hochladen
                        <input
                          type="file"
                          accept="image/*"
                          disabled={readOnly}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            void uploadTemplateAsset(field, event.target.files?.[0])
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {customSignatureFields.length > 0 && (
                <p>Die Signaturfelder dieser Vorlage werden aus der Techniker-Signatur unten befüllt.</p>
              )}
            </EditorSection>
          )}

          <EditorSection
            title="Contactos"
            description="Direkte Kommunikationsdaten"
            collapsed={Boolean(collapsedSections.contacts)}
            onToggle={() => toggleSection("contacts")}
          >
            <div className="grid two">
              {(
                [
                  ["name1", "Name 1"],
                  ["name2", "Name 2"],
                  ["street1", "Straße 1"],
                  ["street2", "Straße 2"],
                  ["city1", "Ort 1"],
                  ["city2", "Ort 2"],
                  ["phone1", "Telefon 1"],
                  ["phone2", "Telefon 2"],
                  ["mobile1", "Mobil 1"],
                  ["mobile2", "Mobil 2"],
                  ["email", "E-Mail"]
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={report.contacts[key]}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateReport((previous) => ({
                        ...previous,
                        contacts: {
                          ...previous.contacts,
                          [key]: event.target.value
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </EditorSection>

          <EditorSection
            title="Resultado"
            description="Diagnóstico y texto final"
            collapsed={Boolean(collapsedSections.findings)}
            onToggle={() => toggleSection("findings")}
          >
            <div className="checkbox-grid">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={report.findings.causeFound}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      findings: { ...previous.findings, causeFound: event.target.checked }
                    }))
                  }
                />
                Ursache gefunden
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={report.findings.causeExposed}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      findings: { ...previous.findings, causeExposed: event.target.checked }
                    }))
                  }
                />
                Ursache freigelegt
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={report.findings.temporarySeal}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      findings: { ...previous.findings, temporarySeal: event.target.checked }
                    }))
                  }
                />
                Notabdichtung
              </label>
            </div>
            <label>
              Ergebnistext
              <textarea
                value={report.findings.summary}
                disabled={readOnly}
                onChange={(event) =>
                  updateReport((previous) => ({
                    ...previous,
                    findings: {
                      ...previous.findings,
                      summary: event.target.value
                    }
                  }))
                }
              />
            </label>
          </EditorSection>

          <EditorSection
            title="Acciones"
            description="Nächste Schritte und Abstimmungen"
            collapsed={Boolean(collapsedSections.actions)}
            onToggle={() => toggleSection("actions")}
          >
            <div className="grid two">
              <label>
                Abgesprochen mit
                <input
                  value={report.actions.agreedWith}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      actions: {
                        ...previous.actions,
                        agreedWith: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                Abzustimmen mit
                <input
                  value={report.actions.coordinateWith}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      actions: {
                        ...previous.actions,
                        coordinateWith: event.target.value
                      }
                    }))
                  }
                />
              </label>
            </div>

            <div className="checkbox-grid">
              {ACTION_OPTIONS.map((option) => (
                <label key={option.key} className="checkbox">
                  <input
                    type="checkbox"
                    checked={report.actions.flags[option.key]}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateReport((previous) => ({
                        ...previous,
                        actions: {
                          ...previous.actions,
                          flags: {
                            ...previous.actions.flags,
                            [option.key]: event.target.checked
                          }
                        }
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <label>
              Demontage Details
              <input
                value={report.actions.demontageDetails}
                disabled={readOnly}
                onChange={(event) =>
                  updateReport((previous) => ({
                    ...previous,
                    actions: {
                      ...previous.actions,
                      demontageDetails: event.target.value
                    }
                  }))
                }
              />
            </label>

            <label>
              Sonstiges
              <textarea
                value={report.actions.notes}
                disabled={readOnly}
                onChange={(event) =>
                  updateReport((previous) => ({
                    ...previous,
                    actions: {
                      ...previous.actions,
                      notes: event.target.value
                    }
                  }))
                }
              />
            </label>
          </EditorSection>

          <EditorSection
            title="Fotos"
            description="Bilddokumentation und Assets"
            collapsed={Boolean(collapsedSections.photos)}
            onToggle={() => toggleSection("photos")}
          >
            <div className="photo-grid">
              {PHOTO_SLOTS.map((slot) => {
                const photo = report.photos.find((entry) => entry.slot === slot);

                return (
                  <div key={slot} className="photo-slot">
                    <h3>{slot}. Bild</h3>
                    {photo?.downloadUrl ? (
                      <a href={photo.downloadUrl} target="_blank" rel="noreferrer">
                        Bild öffnen
                      </a>
                    ) : (
                      <p>Noch kein Bild hochgeladen.</p>
                    )}

                    <label>
                      Datei hochladen
                      <input
                        type="file"
                        accept="image/*"
                        disabled={readOnly}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          void handlePhotoUpload(slot, event.target.files?.[0])
                        }
                      />
                    </label>

                    <label>
                      Ort der Aufnahme
                      <input
                        value={photo?.location ?? ""}
                        disabled={readOnly}
                        onChange={(event) => updatePhotoMeta(slot, "location", event.target.value)}
                      />
                    </label>

                    <label>
                      Dokumentation
                      <textarea
                        value={photo?.documentation ?? ""}
                        disabled={readOnly}
                        onChange={(event) => updatePhotoMeta(slot, "documentation", event.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </EditorSection>

          <EditorSection
            title="Firma"
            description="Techniker-Signatur für den finalen Bericht"
            collapsed={Boolean(collapsedSections.signature)}
            onToggle={() => toggleSection("signature")}
          >
            <label>
              Name
              <input
                value={report.signature.technicianName}
                disabled={readOnly}
                onChange={(event) =>
                  updateReport((previous) => ({
                    ...previous,
                    signature: {
                      ...previous.signature,
                      technicianName: event.target.value
                    }
                  }))
                }
              />
            </label>

            <SignaturePad
              initialValue={report.signature.dataUrl || report.signature.downloadUrl}
              disabled={readOnly}
              onChange={(dataUrl) =>
                updateReport((previous) => ({
                  ...previous,
                  signature: {
                    ...previous.signature,
                    dataUrl,
                    signedAt: new Date().toISOString()
                  }
                }))
              }
            />
          </EditorSection>

          <EditorSection
            title="Avanzado"
            description="Daño, asistentes, técnicas y facturación"
            collapsed={Boolean(collapsedSections.advanced)}
            onToggle={() => toggleSection("advanced")}
          >
            <div className="stack">
              <h3>Schadensbild / Anlass</h3>
              <div className="checkbox-grid">
                {DAMAGE_OPTIONS.map((option) => (
                  <label key={option.key} className="checkbox">
                    <input
                      type="checkbox"
                      checked={report.damageChecklist.flags[option.key]}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateReport((previous) => ({
                          ...previous,
                          damageChecklist: {
                            ...previous.damageChecklist,
                            flags: {
                              ...previous.damageChecklist.flags,
                              [option.key]: event.target.checked
                            }
                          }
                        }))
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <label>
                Notizen
                <textarea
                  value={report.damageChecklist.notes}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      damageChecklist: {
                        ...previous.damageChecklist,
                        notes: event.target.value
                      }
                    }))
                  }
                />
              </label>
            </div>

            <div className="stack">
              <h3>Anwesende</h3>
              <div className="checkbox-grid">
                {ATTENDEE_OPTIONS.map((option) => (
                  <label key={option.key} className="checkbox">
                    <input
                      type="checkbox"
                      checked={report.attendees.flags[option.key]}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateReport((previous) => ({
                          ...previous,
                          attendees: {
                            ...previous.attendees,
                            flags: {
                              ...previous.attendees.flags,
                              [option.key]: event.target.checked
                            }
                          }
                        }))
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <label>
                Weitere Anwesende / Notiz
                <textarea
                  value={report.attendees.notes}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateReport((previous) => ({
                      ...previous,
                      attendees: {
                        ...previous.attendees,
                        notes: event.target.value
                      }
                    }))
                  }
                />
              </label>
            </div>

            <div className="stack">
              <h3>Eingesetzte Verfahren und Technik</h3>
              <div className="checkbox-grid">
                {TECHNIQUE_OPTIONS.map((option) => (
                  <label key={option} className="checkbox">
                    <input
                      type="checkbox"
                      checked={report.techniques.includes(option)}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateReport((previous) => ({
                          ...previous,
                          techniques: event.target.checked
                            ? [...previous.techniques, option]
                            : previous.techniques.filter((item) => item !== option)
                        }))
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>

            <div className="stack">
              <h3>Abrechnung</h3>
              <div className="grid three">
                <label>
                  Von
                  <input
                    type="time"
                    value={report.billing.from}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateReport((previous) => ({
                        ...previous,
                        billing: {
                          ...previous.billing,
                          from: event.target.value
                        }
                      }))
                    }
                  />
                </label>

                <label>
                  Bis
                  <input
                    type="time"
                    value={report.billing.to}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateReport((previous) => ({
                        ...previous,
                        billing: {
                          ...previous.billing,
                          to: event.target.value
                        }
                      }))
                    }
                  />
                </label>

                <label>
                  Arbeitszeit (Stunden)
                  <input
                    value={report.billing.workingTimeHours}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateReport((previous) => ({
                        ...previous,
                        billing: {
                          ...previous.billing,
                          workingTimeHours: event.target.value
                        }
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </EditorSection>
        </div>

        <aside className="editor-preview-pane">
          <div className="surface stack editor-preview-surface">
            <div className="module-header">
              <div>
                <h2>PDF Vorschau</h2>
                <p>{previewLoading ? "Preview wird erzeugt..." : previewUrl ? "Aktuelle Arbeitsansicht des PDFs." : "Noch keine Vorschau erzeugt."}</p>
              </div>
              <div className="row">
                <button type="button" className="ghost" disabled={readOnly || previewLoading} onClick={previewPdf}>
                  Aktualisieren
                </button>
                {previewUrl && (
                  <a className="ghost button-link" href={previewUrl} target="_blank" rel="noreferrer">
                    Im neuen Tab
                  </a>
                )}
              </div>
            </div>

            {previewUrl ? (
              <object className="pdf-preview-frame editor-pdf-frame" data={previewUrl} type="application/pdf">
                <p>Der Browser konnte die PDF Vorschau nicht direkt anzeigen.</p>
              </object>
            ) : (
              <div className="empty-state preview-empty-state">
                <strong>Noch keine PDF Vorschau</strong>
                <p>Speichere den Bericht und erzeuge eine Vorschau, um das finale Dokument hier zu prüfen.</p>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="surface-muted stack">
                <strong>Validierung</strong>
                {validationErrors.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
};

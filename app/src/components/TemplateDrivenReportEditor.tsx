import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { getCallableErrorMessage } from "../lib/callableErrors";
import { normalizeReportData } from "../lib/firestore";
import { validateReportForFinalize } from "../lib/validation";
import { ClientData, FinalizeReportResult, ReportData, TemplateFieldSchema, TemplateVersion, UserRole } from "../types";
import { ActionBar } from "./ui/ActionBar";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { SkeletonBlock } from "./ui/SkeletonBlock";
import { StatusChip } from "./ui/StatusChip";
import { SignaturePad } from "./SignaturePad";

interface TemplateDrivenReportEditorProps {
  reportId: string;
  uid: string;
  userRole: UserRole;
  isOnline: boolean;
  language: Language;
  onBack: () => void;
}

interface TemplateVersionResponse {
  version: TemplateVersion;
}

const stripUndefined = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as unknown as T;
  }
  if (value !== null && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return value;
};

const reportFingerprint = (report: ReportData) =>
  JSON.stringify({
    ...report,
    finalization: undefined
  });

const getClientFullName = (client: Pick<ClientData, "name" | "surname">) =>
  [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");

export const TemplateDrivenReportEditor = ({
  reportId,
  uid,
  userRole,
  isOnline,
  language,
  onBack
}: TemplateDrivenReportEditorProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const locale = localeForLanguage(language);
  const [report, setReport] = useState<ReportData | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [templateVersion, setTemplateVersion] = useState<TemplateVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const previewBlobUrlRef = useRef("");
  const initializedRef = useRef(false);
  const lastPersistedFingerprintRef = useRef("");
  const autosaveTimerRef = useRef<number | null>(null);
  const reportRef = useMemo(() => doc(db, "reports", reportId), [reportId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      reportRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setError(tRef.current("El informe no existe.", "Bericht existiert nicht."));
          setLoading(false);
          return;
        }

        const next = normalizeReportData(snapshot.data());
        setReport(next);
        setLastSavedAt(next.updatedAt);
        lastPersistedFingerprintRef.current = reportFingerprint(next);
        initializedRef.current = true;
        setLoading(false);

        if (next.status === "finalized" && next.finalization?.pdfUrl) {
          if (previewBlobUrlRef.current) {
            URL.revokeObjectURL(previewBlobUrlRef.current);
            previewBlobUrlRef.current = "";
          }
          setPreviewUrl(next.finalization.pdfUrl);
        }
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [reportRef]);

  useEffect(() => {
    if (!report?.brandTemplateId) {
      return;
    }

    const callable = httpsCallable<{ templateId: string; versionId?: string }, TemplateVersionResponse>(functions, "getTemplateVersion");
    callable({ templateId: report.brandTemplateId, versionId: report.templateVersionId })
      .then((result) => setTemplateVersion(result.data.version))
      .catch((templateError) => setError(templateError instanceof Error ? templateError.message : t("No se pudo cargar la plantilla.", "Vorlage konnte nicht geladen werden.")));
  }, [language, report?.brandTemplateId, report?.templateVersionId]);

  useEffect(() => {
    const clientsRef = collection(db, "clients");
    const clientsQuery = userRole === "admin" || userRole === "office"
      ? query(clientsRef)
      : query(clientsRef, where("createdBy", "==", uid));
    const unsubscribe = onSnapshot(clientsQuery, (snapshot) => {
      setClients(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: String(data.name ?? ""),
          surname: String(data.surname ?? ""),
          principalContact: String(data.principalContact ?? ""),
          email: String(data.email ?? ""),
          phone: String(data.phone ?? ""),
          location: String(data.location ?? ""),
          createdBy: String(data.createdBy ?? uid),
          createdAt: String(data.createdAt ?? ""),
          updatedAt: String(data.updatedAt ?? "")
        } satisfies ClientData;
      }));
    });

    return unsubscribe;
  }, [uid, userRole]);

  useEffect(() => () => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
  }, []);

  const canEditReport = Boolean(report && report.createdBy === uid);
  const canViewReport = Boolean(report && (canEditReport || userRole === "admin" || userRole === "office"));
  const canSendEmail = Boolean(report && (canEditReport || userRole === "admin" || userRole === "office"));
  const canMutateDraft = Boolean(report && canEditReport && report.status === "draft");

  const updateReport = (updater: (previous: ReportData) => ReportData) => {
    setReport((previous) => previous ? updater(previous) : previous);
  };

  const persistReport = async () => {
    if (!report || !canEditReport || !isOnline || saving || report.status === "finalized") {
      return null;
    }

    setSaving(true);
    setSaveState("saving");
    setError("");

    try {
      await updateDoc(reportRef, {
        ...stripUndefined(report),
        updatedAt: serverTimestamp()
      });

      setLastSavedAt(new Date().toISOString());
      lastPersistedFingerprintRef.current = reportFingerprint(report);
      setSaveState("saved");
      return report;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("No se pudo guardar.", "Speichern fehlgeschlagen."));
      setSaveState("dirty");
      return null;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!report || !canEditReport || !initializedRef.current || report.status === "finalized") {
      return;
    }

    const fingerprint = reportFingerprint(report);
    if (fingerprint === lastPersistedFingerprintRef.current) {
      return;
    }

    setSaveState("dirty");
    if (!isOnline || saving) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void persistReport();
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [canEditReport, isOnline, report, saving]);

  const handleSignatureChange = async (dataUrl: string) => {
    if (!report || !canMutateDraft || !isOnline || !dataUrl) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const storageRef = ref(storage, `report-signatures/${reportId}/technician.png`);
      await uploadBytes(storageRef, blob, { contentType: "image/png" });
      const downloadUrl = await getDownloadURL(storageRef);

      updateReport((previous) => ({
        ...previous,
        signature: {
          ...previous.signature,
          dataUrl,
          storagePath: storageRef.fullPath,
          downloadUrl,
          signedAt: new Date().toISOString(),
          technicianName: previous.projectInfo.technicianName || previous.signature.technicianName
        }
      }));
      setNotice(t("Firma guardada.", "Signatur gespeichert."));
    } catch (signatureError) {
      setError(signatureError instanceof Error ? signatureError.message : t("No se pudo guardar la firma.", "Signatur konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  const previewPdf = async () => {
    if (!report || !canViewReport) {
      return;
    }

    if (canEditReport) {
      const persisted = await persistReport();
      if (!persisted) {
        return;
      }
    }

    setPreviewLoading(true);
    setError("");
    try {
      const callable = httpsCallable<{ reportId: string }, { previewBase64?: string; mimeType?: string }>(functions, "previewPdf");
      const result = await callable({ reportId });

      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }

      if (result.data.previewBase64) {
        const binary = atob(result.data.previewBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: result.data.mimeType ?? "application/pdf" }));
        previewBlobUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      }
    } catch (previewError) {
      setError(getCallableErrorMessage(previewError, t("No se pudo generar la vista previa.", "Vorschau konnte nicht erzeugt werden.")));
    } finally {
      setPreviewLoading(false);
    }
  };

  const visibleFields = useMemo(
    () => (templateVersion?.fieldSchema ?? []).filter((field) => field.includeInForm && field.type !== "signature").sort((left, right) => left.sortOrder - right.sortOrder),
    [templateVersion?.fieldSchema]
  );
  const hasSignatureField = useMemo(
    () => Boolean(templateVersion?.fieldSchema.some((field) => field.includeInForm && field.type === "signature")),
    [templateVersion?.fieldSchema]
  );

  const validationErrors = report
    ? validateReportForFinalize(
        report,
        (templateVersion?.fieldSchema ?? [])
          .filter((field) => field.includeInForm && field.required && field.type !== "signature" && field.type !== "image")
          .map((field) => `templateFields.${field.id}`),
        language,
        { requireSummary: false, requireSignature: false }
      )
    : [];

  const finalizeReport = async () => {
    if (!canEditReport) {
      return;
    }
    const persisted = await persistReport();
    if (!persisted) {
      return;
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable<{ reportId: string }, FinalizeReportResult>(functions, "finalizeReport");
      const result = await callable({ reportId });
      setPreviewUrl(result.data.pdfUrl);
      setNotice(
        t(
          `Informe finalizado el ${new Date(result.data.finalizedAt).toLocaleString(locale)}.`,
          `Bericht finalisiert am ${new Date(result.data.finalizedAt).toLocaleString(locale)}.`
        )
      );
    } catch (finalizeError) {
      setError(getCallableErrorMessage(finalizeError, t("No se pudo finalizar.", "Finalisierung fehlgeschlagen.")));
    } finally {
      setSaving(false);
    }
  };

  const sendPdfByEmail = async () => {
    if (!report?.clientId || report.status !== "finalized") {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable<{ reportId: string; clientId: string }, { recipient: string }>(functions, "sendReportEmail");
      const result = await callable({ reportId, clientId: report.clientId });
      setNotice(t(`PDF enviado a ${result.data.recipient}.`, `PDF gesendet an ${result.data.recipient}.`));
    } catch (emailError) {
      setError(getCallableErrorMessage(emailError, t("No se pudo enviar el correo.", "E-Mail konnte nicht gesendet werden.")));
    } finally {
      setSaving(false);
    }
  };

  const selectedClient = report ? clients.find((client) => client.id === report.clientId) ?? null : null;

  if (loading) {
    return (
      <main className="report-flow-shell">
        <div className="workspace-stack">
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={8} />
        </div>
      </main>
    );
  }

  if (!report || !canViewReport) {
    return (
      <main className="report-flow-shell">
        <SectionCard title={t("Sin acceso al informe", "Kein Zugriff auf den Bericht")} description={error || t("No se pudo cargar el informe.", "Bericht konnte nicht geladen werden.")}>
          <button type="button" onClick={onBack}>{t("Volver", "Zurück")}</button>
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="report-flow-shell">
      <section className="report-flow-hero">
        <div className="report-flow-hero__copy">
          <button type="button" className="ghost" onClick={onBack}>{t("Volver", "Zurück")}</button>
          <span className="report-flow-hero__eyebrow">{t("Plantilla dinámica", "Dynamische Vorlage")}</span>
          <h1>{report.projectInfo.projectNumber || report.templateName || t("Nuevo informe", "Neuer Bericht")}</h1>
          <p>{report.templateName || report.brandTemplateId}</p>
          <small>{lastSavedAt ? new Date(lastSavedAt).toLocaleString(locale) : ""}</small>
        </div>
        <div className="report-flow-hero__status">
          <StatusChip tone={report.status === "finalized" ? "success" : "warning"}>
            {report.status === "finalized" ? t("Finalizado", "Finalisiert") : t("Borrador", "Entwurf")}
          </StatusChip>
          <StatusChip tone={isOnline ? "success" : "danger"}>
            {isOnline ? t("Conexión activa", "Online") : t("Sin conexión", "Offline")}
          </StatusChip>
        </div>
      </section>

      {error && <p className="notice-banner error">{error}</p>}
      {notice && <p className="notice-banner notice">{notice}</p>}

      <section className="report-flow-layout">
        <div className="report-flow-main">
          <SectionCard
            title={t("Datos del informe", "Berichtsdaten")}
            description={t("Metadatos mínimos para CRM, agenda y envío.", "Minimale Metadaten für CRM, Agenda und Versand.")}
          >
            <div className="grid two">
              <label>
                {t("Cliente", "Kunde")}
                <select
                  value={report.clientId}
                  disabled={!canMutateDraft}
                  onChange={(event) => {
                    const client = clients.find((item) => item.id === event.target.value);
                    updateReport((previous) => ({
                      ...previous,
                      clientId: event.target.value,
                      contacts: client
                        ? {
                            ...previous.contacts,
                            name1: getClientFullName(client) || client.principalContact,
                            email: client.email,
                            phone1: client.phone,
                            street1: client.location
                          }
                        : previous.contacts,
                      projectInfo: client
                        ? { ...previous.projectInfo, locationObject: client.location }
                        : previous.projectInfo
                    }));
                  }}
                >
                  <option value="">{t("Seleccionar cliente", "Kunden auswählen")}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{[getClientFullName(client), client.location].filter(Boolean).join(" · ")}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("Número de proyecto", "Projektnummer")}
                <input value={report.projectInfo.projectNumber} disabled={!canMutateDraft} onChange={(event) => updateReport((previous) => ({ ...previous, projectInfo: { ...previous.projectInfo, projectNumber: event.target.value } }))} />
              </label>
              <label>
                {t("Fecha de la visita", "Termin")}
                <input type="datetime-local" value={report.projectInfo.appointmentDate} disabled={!canMutateDraft} onChange={(event) => updateReport((previous) => ({ ...previous, projectInfo: { ...previous.projectInfo, appointmentDate: event.target.value } }))} />
              </label>
              <label>
                {t("Técnico", "Techniker")}
                <input value={report.projectInfo.technicianName} disabled={!canMutateDraft} onChange={(event) => updateReport((previous) => ({ ...previous, projectInfo: { ...previous.projectInfo, technicianName: event.target.value }, signature: { ...previous.signature, technicianName: event.target.value } }))} />
              </label>
              <label className="form-panel__full">
                {t("Ubicación / objeto", "Ort / Objekt")}
                <input value={report.projectInfo.locationObject} disabled={!canMutateDraft} onChange={(event) => updateReport((previous) => ({ ...previous, projectInfo: { ...previous.projectInfo, locationObject: event.target.value } }))} />
              </label>
            </div>
            {selectedClient && (
              <small>{t(`Cliente vinculado: ${getClientFullName(selectedClient) || selectedClient.location}`, `Verknüpfter Kunde: ${getClientFullName(selectedClient) || selectedClient.location}`)}</small>
            )}
          </SectionCard>

          <SectionCard
            title={t("Campos del formulario web", "Webformularfelder")}
            description={t("Campos importados desde el AcroForm publicado.", "Aus der veröffentlichten AcroForm importierte Felder.")}
          >
            {visibleFields.length === 0 ? (
              <EmptyState
                title={t("Sin campos visibles", "Keine sichtbaren Felder")}
                description={t("La plantilla publicada no expone campos editables.", "Die veröffentlichte Vorlage hat keine editierbaren Felder.")}
              />
            ) : (
              <div className="stack">
                {visibleFields.map((field) => (
                  <label key={field.id} className={field.type === "checkbox" ? "checkbox" : undefined}>
                    <span>{field.label}{field.required ? " *" : ""}</span>
                    {field.helpText && <small>{field.helpText}</small>}
                    {field.type === "textarea" && (
                      <textarea
                        value={String(report.templateFields[field.id] ?? field.defaultValue ?? "")}
                        disabled={!canMutateDraft}
                        onChange={(event) => updateReport((previous) => ({ ...previous, templateFields: { ...previous.templateFields, [field.id]: event.target.value } }))}
                      />
                    )}
                    {field.type === "text" && (
                      <input
                        value={String(report.templateFields[field.id] ?? field.defaultValue ?? "")}
                        disabled={!canMutateDraft}
                        onChange={(event) => updateReport((previous) => ({ ...previous, templateFields: { ...previous.templateFields, [field.id]: event.target.value } }))}
                      />
                    )}
                    {field.type === "dropdown" && (
                      <select
                        value={String(report.templateFields[field.id] ?? field.defaultValue ?? "")}
                        disabled={!canMutateDraft}
                        onChange={(event) => updateReport((previous) => ({ ...previous, templateFields: { ...previous.templateFields, [field.id]: event.target.value } }))}
                      >
                        <option value="">{t("Seleccionar", "Auswählen")}</option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    )}
                    {field.type === "checkbox" && (
                      <>
                        <input
                          type="checkbox"
                          checked={Boolean(report.templateFields[field.id])}
                          disabled={!canMutateDraft}
                          onChange={(event) => updateReport((previous) => ({ ...previous, templateFields: { ...previous.templateFields, [field.id]: event.target.checked } }))}
                        />
                        <span>{field.label}</span>
                      </>
                    )}
                    {field.type === "image" && (
                      <small>{t("El soporte de imágenes quedará para la siguiente iteración.", "Bildunterstützung kommt in der nächsten Iteration.")}</small>
                    )}
                  </label>
                ))}
              </div>
            )}
          </SectionCard>

          {hasSignatureField && (
            <SectionCard
              title={t("Firma", "Signatur")}
              description={t("Si quieres, puedes añadir una firma para insertarla en el PDF final.", "Optional kann hier eine Signatur für das finale PDF erfasst werden.")}
            >
              <SignaturePad
                language={language}
                disabled={!canMutateDraft || !isOnline}
                initialValue={report.signature.dataUrl}
                onChange={(dataUrl) => void handleSignatureChange(dataUrl)}
              />
            </SectionCard>
          )}

          <SectionCard
            title={t("Revisión y salida", "Prüfung und Ausgabe")}
            description={t("Genera la vista previa, finaliza el PDF y envíalo al cliente.", "Erzeuge die Vorschau, finalisiere das PDF und sende es an den Kunden.")}
          >
            {validationErrors.length > 0 ? (
              <div className="validation-list">
                <strong>{t("Puntos pendientes", "Offene Punkte")}</strong>
                {validationErrors.map((item) => <small key={item}>{item}</small>)}
              </div>
            ) : (
              <div className="validation-list validation-list--success">
                <strong>{t("Informe listo", "Bericht bereit")}</strong>
              </div>
            )}
            <div className="row">
              <button type="button" className="ghost" onClick={() => void previewPdf()} disabled={previewLoading || !isOnline}>
                {previewLoading ? t("Generando preview...", "Vorschau wird erstellt...") : t("Generar preview PDF", "PDF-Vorschau erzeugen")}
              </button>
              {previewUrl && (
                <a className="ghost button-link" href={previewUrl} target="_blank" rel="noreferrer">
                  {t("Abrir en pestaña", "Im Tab öffnen")}
                </a>
              )}
            </div>
            {previewUrl ? (
              <object key={previewUrl} className="pdf-preview-frame editor-pdf-frame" data={previewUrl} type="application/pdf">
                <p>{t("Tu navegador no puede mostrar el PDF.", "Der Browser kann das PDF nicht anzeigen.")}</p>
              </object>
            ) : (
              <EmptyState
                title={t("Sin preview todavía", "Noch keine Vorschau")}
                description={t("Genera una vista previa para revisar el PDF.", "Erzeuge eine Vorschau, um das PDF zu prüfen.")}
              />
            )}
          </SectionCard>
        </div>

        <aside className="report-flow-side">
          <SectionCard
            title={t("Estado", "Status")}
            description={t("Resumen rápido del borrador dinámico.", "Kurzübersicht des dynamischen Entwurfs.")}
          >
            <div className="flow-status-list">
              <div className="flow-status-item flow-status-item--active">
                <span>{t("Campos visibles", "Sichtbare Felder")}</span>
                <StatusChip tone="info">{String(visibleFields.length)}</StatusChip>
              </div>
              <div className="flow-status-item flow-status-item--active">
                <span>{t("Firma técnica", "Techniker-Signatur")}</span>
                <StatusChip tone={hasSignatureField ? "info" : "neutral"}>{hasSignatureField ? t("Opcional", "Optional") : t("No usada", "Nicht verwendet")}</StatusChip>
              </div>
            </div>
          </SectionCard>
        </aside>
      </section>

      <ActionBar
        secondary={
          <button type="button" className="ghost" onClick={() => void persistReport()} disabled={!isOnline || saving || !canMutateDraft}>
            {t("Guardar ahora", "Jetzt speichern")}
          </button>
        }
        primary={
          report.status === "finalized" ? (
            <button type="button" disabled={!isOnline || saving || !report.clientId || !canSendEmail} onClick={() => void sendPdfByEmail()}>
              {t("Enviar PDF", "PDF senden")}
            </button>
          ) : (
            <button type="button" disabled={!isOnline || saving || !canMutateDraft} onClick={() => void finalizeReport()}>
              {t("Finalizar PDF", "PDF finalisieren")}
            </button>
          )
        }
        aside={<small>{saveState === "dirty" ? t("Cambios pendientes", "Ungespeicherte Änderungen") : t("Autosave activo", "Autosave aktiv")}</small>}
      />
    </main>
  );
};

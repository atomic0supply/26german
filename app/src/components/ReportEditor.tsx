import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
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
  COMPANY_OPTIONS,
  DAMAGE_OPTIONS,
  PHOTO_SLOTS,
  REPORT_TEMPLATE,
  TECHNIQUE_OPTIONS,
  getLocalizedOptionLabel,
  getLocalizedTechniqueLabel,
  resolveReportTemplateName
} from "../constants";
import { db, functions, storage } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { normalizeReportData } from "../lib/firestore";
import { validateReportForFinalize } from "../lib/validation";
import { ClientData, CompanyId, FinalizeReportResult, ReportData, ReportPhoto } from "../types";
import { PhotoAnnotation, PhotoAnnotatorLite } from "./PhotoAnnotatorLite";
import { SignaturePad } from "./SignaturePad";
import { ActionBar } from "./ui/ActionBar";
import { EmptyState } from "./ui/EmptyState";
import { ProgressStepper } from "./ui/ProgressStepper";
import { SectionCard } from "./ui/SectionCard";
import { SkeletonBlock } from "./ui/SkeletonBlock";
import { StatusChip } from "./ui/StatusChip";

interface ReportEditorProps {
  reportId: string;
  uid: string;
  userRole: "technician" | "admin" | "office";
  isOnline: boolean;
  language: Language;
  onBack: () => void;
}

type StepId = "recipient" | "client" | "technical" | "photos" | "signature" | "review";

const STEPS: StepId[] = ["recipient", "client", "technical", "photos", "signature", "review"];

const ANNOTATION_PREFIX = "photoAnnotation:";

const stepIndex = (step: StepId) => STEPS.indexOf(step);

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

// Firestore rejects `undefined` values; strip them recursively before any updateDoc call.
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
    createdAt: undefined,
    updatedAt: undefined,
    finalization: undefined
  });

const readAnnotations = (report: ReportData, slot: number): PhotoAnnotation[] => {
  const raw = report.templateFields[`${ANNOTATION_PREFIX}${slot}`];
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PhotoAnnotation[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string")
      : [];
  } catch {
    return [];
  }
};

const getClientFullName = (client: Pick<ClientData, "name" | "surname">) =>
  [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");

const getClientLabel = (client: ClientData) =>
  [getClientFullName(client), client.location, client.email].filter(Boolean).join(" · ");

const getStepText = (step: StepId, language: Language) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  switch (step) {
    case "recipient":
      return t("Empresa", "Unternehmen");
    case "client":
      return t("Cliente", "Kunde");
    case "technical":
      return t("Técnica", "Technik");
    case "photos":
      return t("Fotos", "Fotos");
    case "signature":
      return t("Firma", "Signatur");
    case "review":
      return t("Revisión", "Prüfung");
    default:
      return step;
  }
};

export const ReportEditor = ({ reportId, uid, userRole, isOnline, language, onBack }: ReportEditorProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const locale = localeForLanguage(language);
  const [report, setReport] = useState<ReportData | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [activeStep, setActiveStep] = useState<StepId>("recipient");
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
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [reportRef]);

  useEffect(() => {
    const clientsRef = collection(db, "clients");
    const clientsQuery = userRole === "admin" || userRole === "office"
      ? query(clientsRef)
      : query(clientsRef, where("createdBy", "==", uid));
    const unsubscribe = onSnapshot(clientsQuery, (snapshot) => {
      const next = snapshot.docs
        .map((item) => {
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
        })
        .sort((left, right) => getClientLabel(left).localeCompare(getClientLabel(right), locale));
      setClients(next);
    });

    return unsubscribe;
  }, [locale, uid, userRole]);

  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const updateReport = (updater: (previous: ReportData) => ReportData) => {
    setReport((previous) => {
      if (!previous) {
        return previous;
      }
      return updater(previous);
    });
  };

  const canEditReport = Boolean(report && report.createdBy === uid);
  const canViewReport = Boolean(report && (canEditReport || userRole === "admin" || userRole === "office"));
  const canSendEmail = Boolean(report && (canEditReport || userRole === "admin" || userRole === "office"));
  const canMutateDraft = Boolean(report && canEditReport && report.status === "draft");

  const persistReport = async (showNotice = false) => {
    if (!report || !canEditReport || !isOnline || saving || report.status === "finalized") {
      return null;
    }

    setSaving(true);
    setSaveState("saving");
    setError("");

    try {
      let next = report;

      if (next.signature.dataUrl && next.signature.dataUrl.startsWith("data:image")) {
        const blob = await dataUrlToBlob(next.signature.dataUrl);
        const storagePath = `report-signatures/${reportId}/technician.png`;
        const signatureRef = ref(storage, storagePath);
        await uploadBytes(signatureRef, blob, { contentType: "image/png" });
        const downloadUrl = await getDownloadURL(signatureRef);
        next = {
          ...next,
          signature: {
            ...next.signature,
            storagePath,
            downloadUrl,
            signedAt: next.signature.signedAt || new Date().toISOString()
          }
        };
      }

      const { dataUrl: _drop, ...signatureRest } = next.signature;
      await updateDoc(reportRef, {
        ...stripUndefined({ ...next, signature: signatureRest }),
        updatedAt: serverTimestamp()
      });

      if (next.photos.length > 0) {
        await Promise.all(
          next.photos.map((photo) =>
            setDoc(doc(db, `reports/${reportId}/photos/${photo.id}`), photo, { merge: true })
          )
        );
      }

      setReport(next);
      setLastSavedAt(new Date().toISOString());
      lastPersistedFingerprintRef.current = reportFingerprint(next);
      setSaveState("saved");
      if (showNotice) {
        setNotice(t("Cambios guardados.", "Änderungen gespeichert."));
      }
      return next;
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
      void persistReport(false);
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [canEditReport, isOnline, report, saving]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

  const handlePhotoUpload = async (slot: number, file?: File) => {
    if (!report || !file || !canMutateDraft) {
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t(
        `La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El límite es 10 MB.`,
        `Das Foto ist ${(file.size / 1024 / 1024).toFixed(1)} MB groß. Limit: 10 MB.`
      ));
      return;
    }
    if (!isOnline) {
      setError(t("Sin conexión: no se pueden subir fotos.", "Offline: Fotos können nicht hochgeladen werden."));
      return;
    }

    setSaving(true);
    setError("");

    try {
      const existing = report.photos.find((item) => item.slot === slot);
      const photoId = existing?.id ?? crypto.randomUUID();
      const storagePath = `report-photos/${reportId}/${slot}-${photoId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const photoRef = ref(storage, storagePath);
      await uploadBytes(photoRef, file, { contentType: file.type || "image/jpeg" });
      const downloadUrl = await getDownloadURL(photoRef);

      const nextPhoto: ReportPhoto = {
        id: photoId,
        slot,
        location: existing?.location ?? t(`Zona ${slot}`, `Bereich ${slot}`),
        documentation: existing?.documentation ?? "",
        storagePath,
        downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      updateReport((previous) => {
        const remaining = previous.photos.filter((photo) => photo.slot !== slot);
        return {
          ...previous,
          photos: [...remaining, nextPhoto].sort((left, right) => left.slot - right.slot)
        };
      });
      setNotice(t("Foto subida.", "Foto hochgeladen."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("No se pudo subir la foto.", "Foto konnte nicht hochgeladen werden."));
    } finally {
      setSaving(false);
    }
  };

  const updatePhotoMeta = (slot: number, key: "location" | "documentation", value: string) => {
    if (!canMutateDraft) {
      return;
    }

    updateReport((previous) => {
      const current = previous.photos.find((photo) => photo.slot === slot);
      const next: ReportPhoto = {
        id: current?.id ?? crypto.randomUUID(),
        slot,
        location: key === "location" ? value : current?.location ?? "",
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

  const updateAnnotations = (slot: number, annotations: PhotoAnnotation[]) => {
    if (!canMutateDraft) {
      return;
    }

    updateReport((previous) => ({
      ...previous,
      templateFields: {
        ...previous.templateFields,
        [`${ANNOTATION_PREFIX}${slot}`]: JSON.stringify(annotations)
      }
    }));
  };

  const previewPdf = async () => {
    if (!report || !canViewReport) {
      return;
    }
    if (canEditReport) {
      const persisted = await persistReport(false);
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
        previewBlobUrlRef.current = "";
      }

      if (result.data.previewBase64) {
        const binary = atob(result.data.previewBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: result.data.mimeType ?? "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        previewBlobUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      }
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : t("No se pudo generar la vista previa.", "Vorschau konnte nicht erzeugt werden."));
    } finally {
      setPreviewLoading(false);
    }
  };

  const finalizeReport = async () => {
    if (!canEditReport) {
      setError(t("Solo el creador del informe puede finalizarlo.", "Nur der Ersteller kann den Bericht finalisieren."));
      return;
    }
    const persisted = await persistReport(false);
    if (!persisted) {
      return;
    }

    const errors = validateReportForFinalize(persisted, REPORT_TEMPLATE.requiredTemplateFields, language);
    if (errors.length > 0) {
      setError(errors.join(" "));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable<{ reportId: string }, FinalizeReportResult>(functions, "finalizeReport");
      const result = await callable({ reportId });
      setNotice(
        t(
          `Informe finalizado el ${new Date(result.data.finalizedAt).toLocaleString(locale)}.`,
          `Bericht finalisiert am ${new Date(result.data.finalizedAt).toLocaleString(locale)}.`
        )
      );
      setPreviewUrl(result.data.pdfUrl);
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : t("No se pudo finalizar.", "Finalisierung fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  };

  const sendPdfByEmail = async () => {
    if (!canSendEmail) {
      setError(t("No tienes permisos para enviar este informe.", "Du hast keine Berechtigung, diesen Bericht zu senden."));
      return;
    }
    if (!report?.clientId || report.status !== "finalized") {
      setError(t("Finaliza el informe y vincúlalo a un cliente.", "Bericht finalisieren und Kunden zuordnen."));
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable<{ reportId: string; clientId: string }, { recipient: string }>(functions, "sendReportEmail");
      const result = await callable({ reportId, clientId: report.clientId });
      setNotice(t(`PDF enviado a ${result.data.recipient}.`, `PDF gesendet an ${result.data.recipient}.`));
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : t("No se pudo enviar el correo.", "E-Mail konnte nicht gesendet werden."));
    } finally {
      setSaving(false);
    }
  };

  const validationErrors = report
    ? validateReportForFinalize(report, REPORT_TEMPLATE.requiredTemplateFields, language)
    : [];
  const selectedClient = report ? clients.find((client) => client.id === report.clientId) ?? null : null;

  const currentStepComplete = (step: StepId) => {
    if (!report) {
      return false;
    }

    switch (step) {
      case "recipient":
        return Boolean(report.companyId);
      case "client":
        return Boolean(report.clientId) && Boolean(report.projectInfo.locationObject.trim());
      case "technical":
        return Boolean(report.projectInfo.projectNumber.trim() && report.projectInfo.technicianName.trim() && report.findings.summary.trim());
      case "photos":
        return report.photos.length > 0;
      case "signature":
        return Boolean(report.signature.storagePath || report.signature.dataUrl);
      case "review":
        return validationErrors.length === 0;
      default:
        return false;
    }
  };

  const isStepBlocked = (step: StepId) =>
    STEPS.slice(0, stepIndex(step)).some((previousStep) => !currentStepComplete(previousStep));

  const currentStepState = (step: StepId): "done" | "active" | "todo" | "blocked" => {
    if (step === activeStep) {
      return "active";
    }
    if (currentStepComplete(step)) {
      return "done";
    }
    if (isStepBlocked(step)) {
      return "blocked";
    }
    return "todo";
  };

  const canJumpToStep = (step: StepId) => step === activeStep || !isStepBlocked(step);
  const canAdvance = activeStep !== "review" && currentStepComplete(activeStep);
  const nextIncompleteStep = STEPS.find((step) => !currentStepComplete(step));
  const lastSavedLabel = saveState === "saving"
    ? t("Guardando ahora…", "Speichert gerade…")
    : saveState === "dirty"
      ? t("Cambios pendientes por guardar", "Änderungen warten auf Speicherung")
      : lastSavedAt
        ? t(
            `Último guardado ${new Date(lastSavedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`,
            `Zuletzt gespeichert ${new Date(lastSavedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
          )
        : t("Sin cambios todavía", "Noch keine Änderungen");

  const goStep = (direction: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex(activeStep) + direction));
    setActiveStep(STEPS[nextIndex]);
  };

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
          <button type="button" className="ghost" onClick={onBack}>
            {t("Volver", "Zurück")}
          </button>
          <span className="report-flow-hero__eyebrow">{t("Informe guiado", "Geführter Bericht")}</span>
          <h1>{report.projectInfo.projectNumber || t("Nuevo informe", "Neuer Bericht")}</h1>
          <p>{resolveReportTemplateName(language, report.templateName)} · {report.projectInfo.locationObject || t("Ubicación pendiente", "Ort ausstehend")}</p>
          <div className="report-flow-hero__meta">
            <small>{lastSavedLabel}</small>
            {nextIncompleteStep && (
              <small>
                {t("Siguiente foco", "Nächster Fokus")}: {getStepText(nextIncompleteStep, language)}
              </small>
            )}
          </div>
        </div>
        <div className="report-flow-hero__status">
          <StatusChip tone={report.status === "finalized" ? "success" : "warning"}>
            {report.status === "finalized" ? t("Finalizado", "Finalisiert") : t("Borrador activo", "Aktiver Entwurf")}
          </StatusChip>
          <StatusChip tone={isOnline ? "success" : "danger"}>
            {isOnline ? t("Conexión activa", "Online") : t("Sin conexión", "Offline")}
          </StatusChip>
          <StatusChip tone={saveState === "saved" ? "success" : saveState === "saving" ? "info" : saveState === "dirty" ? "warning" : "neutral"}>
            {saveState === "saved"
              ? t("Guardado", "Gespeichert")
              : saveState === "saving"
                ? t("Guardando", "Speichert")
                : saveState === "dirty"
                  ? t("Cambios pendientes", "Ungespeicherte Änderungen")
                  : t("Sin cambios", "Keine Änderungen")}
          </StatusChip>
        </div>
      </section>

      <ProgressStepper
        steps={STEPS.map((step) => ({
          id: step,
          label: getStepText(step, language),
          state: currentStepState(step),
          disabled: !canJumpToStep(step)
        }))}
        activeStep={activeStep}
        onStepChange={(step) => {
          const resolvedStep = step as StepId;
          if (canJumpToStep(resolvedStep)) {
            setActiveStep(resolvedStep);
          }
        }}
      />

      {error && <p className="notice-banner error">{error}</p>}
      {notice && <p className="notice-banner notice">{notice}</p>}
      {!isOnline && (
        <p className="notice-banner notice">
          {t(
            "Puedes seguir revisando el informe, pero las subidas, el autosave online y el envío quedan en pausa hasta recuperar conexión.",
            "Du kannst den Bericht weiter prüfen, aber Uploads, Online-Autosave und Versand pausieren bis die Verbindung zurück ist."
          )}
        </p>
      )}
      {!canEditReport && (
        <p className="notice-banner notice">
          {t(
            "Vista de solo lectura: oficina/admin puede revisar el informe y enviar el PDF final, pero no editar un borrador ajeno.",
            "Nur-Leseansicht: Büro/Admin kann den Bericht prüfen und das finale PDF senden, aber keinen fremden Entwurf bearbeiten."
          )}
        </p>
      )}

      <section className="report-flow-layout">
        <div className="report-flow-main">
          {activeStep === "recipient" && (
            <SectionCard
              title={t("Empresa destinataria", "Zielunternehmen")}
              eyebrow={t("Paso 1", "Schritt 1")}
              description={t("Elige la marca que debe aparecer en la parte superior del PDF.", "Wähle die Marke, die oben im PDF erscheinen soll.")}
            >
              <div className="company-grid">
                {COMPANY_OPTIONS.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className={report.companyId === company.id ? "company-card active" : "company-card"}
                    disabled={!canMutateDraft}
                    onClick={() =>
                      updateReport((previous) => ({
                        ...previous,
                        companyId: company.id
                      }))
                    }
                  >
                    <strong>{company.name}</strong>
                    <span>{company.logoStoragePath}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {activeStep === "client" && (
            <SectionCard
              title={t("Cliente y ubicación", "Kunde und Einsatzort")}
              eyebrow={t("Paso 2", "Schritt 2")}
              description={t("Vincula el informe al cliente correcto y completa la dirección de trabajo.", "Verknüpfe den Bericht mit dem richtigen Kunden und Einsatzort.")}
            >
              <div className="form-panel-grid">
                <div className="form-panel">
                  <span className="form-panel__eyebrow">{t("Ficha del cliente", "Kundenprofil")}</span>
                  <div className="grid two">
                    <label>
                      {t("Cliente", "Kunde")}
                      <select
                        value={report.clientId}
                        disabled={!canMutateDraft}
                        onChange={(event) => {
                          const nextClientId = event.target.value;
                          const selected = clients.find((client) => client.id === nextClientId);

                          updateReport((previous) => ({
                            ...previous,
                            clientId: nextClientId,
                            projectInfo: {
                              ...previous.projectInfo,
                              locationObject: selected ? selected.location : previous.projectInfo.locationObject
                            },
                            contacts: selected
                              ? {
                                  ...previous.contacts,
                                  name1: selected.principalContact,
                                  email: selected.email,
                                  phone1: selected.phone,
                                  street1: selected.location
                                }
                              : previous.contacts
                          }));
                        }}
                      >
                        <option value="">{t("Seleccionar cliente", "Kunden auswählen")}</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {getClientLabel(client)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Nombre", "Vorname")}
                      <input className="field-readonly" value={selectedClient?.name ?? ""} readOnly />
                    </label>
                    <label>
                      {t("Apellido", "Nachname")}
                      <input className="field-readonly" value={selectedClient?.surname ?? ""} readOnly />
                    </label>
                    <label>
                      {t("Ubicación base", "Basisstandort")}
                      <input className="field-readonly" value={selectedClient?.location ?? ""} readOnly />
                    </label>
                  </div>
                </div>

                <div className="form-panel">
                  <span className="form-panel__eyebrow">{t("Datos para el informe", "Daten für den Bericht")}</span>
                  <div className="grid two">
                    <label>
                      {t("Ubicación / objeto", "Ort / Objekt")}
                      <input
                        className={selectedClient && report.projectInfo.locationObject === selectedClient.location ? "field-autofilled" : undefined}
                        value={report.projectInfo.locationObject}
                        disabled={!canMutateDraft}
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
                      {t("Contacto principal", "Hauptkontakt")}
                      <input
                        className={selectedClient && report.contacts.name1 === selectedClient.principalContact ? "field-autofilled" : undefined}
                        value={report.contacts.name1}
                        disabled={!canMutateDraft}
                        onChange={(event) =>
                          updateReport((previous) => ({
                            ...previous,
                            contacts: {
                              ...previous.contacts,
                              name1: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t("Correo de envío", "Versand-E-Mail")}
                      <input
                        className={selectedClient && report.contacts.email === selectedClient.email ? "field-autofilled" : undefined}
                        value={report.contacts.email}
                        disabled={!canMutateDraft}
                        onChange={(event) =>
                          updateReport((previous) => ({
                            ...previous,
                            contacts: {
                              ...previous.contacts,
                              email: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t("Teléfono", "Telefon")}
                      <input
                        className={selectedClient && report.contacts.phone1 === selectedClient.phone ? "field-autofilled" : undefined}
                        value={report.contacts.phone1}
                        disabled={!canMutateDraft}
                        onChange={(event) =>
                          updateReport((previous) => ({
                            ...previous,
                            contacts: {
                              ...previous.contacts,
                              phone1: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                    <label className="form-panel__full">
                      {t("Dirección", "Adresse")}
                      <input
                        className={selectedClient && report.contacts.street1 === selectedClient.location ? "field-autofilled" : undefined}
                        value={report.contacts.street1}
                        disabled={!canMutateDraft}
                        onChange={(event) =>
                          updateReport((previous) => ({
                            ...previous,
                            contacts: {
                              ...previous.contacts,
                              street1: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
              {selectedClient && (
                <div className="validation-list validation-list--success">
                  <strong>{t("Datos del cliente autocompletados", "Kundendaten automatisch ausgefüllt")}</strong>
                  <small>{getClientLabel(selectedClient)}</small>
                  <small>{t("Contacto principal", "Hauptkontakt")}: {selectedClient.principalContact}</small>
                </div>
              )}
            </SectionCard>
          )}

          {activeStep === "technical" && (
            <SectionCard
              title={t("Datos técnicos", "Technische Daten")}
              eyebrow={t("Paso 3", "Schritt 3")}
              description={t("Completa el núcleo del informe antes de documentar las fotos.", "Fülle den Kernbericht aus, bevor du die Fotos dokumentierst.")}
            >
              <div className="form-panel-grid">
                <div className="form-panel">
                  <span className="form-panel__eyebrow">{t("Base de la visita", "Einsatzbasis")}</span>
                  <div className="grid two">
                    <label>
                      {t("Número de proyecto", "Projektnummer")}
                      <input
                        value={report.projectInfo.projectNumber}
                        disabled={!canMutateDraft}
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
                      {t("Fecha y hora", "Termin")}
                      <input
                        type="datetime-local"
                        value={report.projectInfo.appointmentDate}
                        disabled={!canMutateDraft}
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
                      {t("Técnico", "Techniker")}
                      <input
                        value={report.projectInfo.technicianName}
                        disabled={!canMutateDraft}
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
                      {t("Primer aviso por", "Erstmeldung durch")}
                      <input
                        value={report.projectInfo.firstReportBy}
                        disabled={!canMutateDraft}
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
                  </div>
                </div>

                <div className="form-panel">
                  <span className="form-panel__eyebrow">{t("Resumen de intervención", "Einsatzresümee")}</span>
                  <label>
                    {t("Resultado / resumen", "Ergebnis / Zusammenfassung")}
                    <textarea
                      value={report.findings.summary}
                      disabled={!canMutateDraft}
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
                </div>
              </div>

              <div className="grid two">
                <div className="checklist-panel">
                  <strong>{t("Daño observado", "Schadensbild")}</strong>
                  <div className="checkbox-grid">
                    {DAMAGE_OPTIONS.map((option) => (
                      <label key={option.key} className="checkbox">
                        <input
                          type="checkbox"
                          checked={report.damageChecklist.flags[option.key]}
                          disabled={!canMutateDraft}
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
                        {getLocalizedOptionLabel(language, option)}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="checklist-panel">
                  <strong>{t("Técnicas usadas", "Verfahren")}</strong>
                  <div className="checkbox-grid">
                    {TECHNIQUE_OPTIONS.map((option) => (
                      <label key={option.value} className="checkbox">
                        <input
                          type="checkbox"
                          checked={report.techniques.includes(option.value)}
                          disabled={!canMutateDraft}
                          onChange={(event) =>
                            updateReport((previous) => ({
                              ...previous,
                              techniques: event.target.checked
                                ? [...previous.techniques, option.value]
                                : previous.techniques.filter((item) => item !== option.value)
                            }))
                          }
                        />
                        {getLocalizedTechniqueLabel(language, option)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="checklist-panel">
                <strong>{t("Acciones y seguimiento", "Maßnahmen und Folgearbeiten")}</strong>
                <div className="checkbox-grid">
                  {ACTION_OPTIONS.map((option) => (
                    <label key={option.key} className="checkbox">
                      <input
                        type="checkbox"
                        checked={report.actions.flags[option.key]}
                        disabled={!canMutateDraft}
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
                      {getLocalizedOptionLabel(language, option)}
                    </label>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {activeStep === "photos" && (
            <SectionCard
              title={t("Fotos y anotaciones", "Fotos und Markierungen")}
              eyebrow={t("Paso 4", "Schritt 4")}
              description={t("Sube imágenes de la visita y marca las zonas relevantes directamente sobre la foto.", "Lade Bilder hoch und markiere relevante Bereiche direkt auf dem Foto.")}
            >
              <div className="photo-workspace">
                {PHOTO_SLOTS.map((slot) => {
                  const photo = report.photos.find((item) => item.slot === slot);
                  const annotations = readAnnotations(report, slot);
                  return (
                    <article key={slot} className="photo-workspace__slot">
                      <div className="photo-workspace__header">
                        <strong>{t(`Foto ${slot}`, `Foto ${slot}`)}</strong>
                        {photo?.downloadUrl && <StatusChip tone="info">{t("Con imagen", "Mit Bild")}</StatusChip>}
                      </div>
                      <label>
                        {t("Subir imagen", "Bild hochladen")}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={!isOnline || saving || !canMutateDraft}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => void handlePhotoUpload(slot, event.target.files?.[0])}
                        />
                      </label>
                      <label>
                        {t("Zona / estancia", "Ort / Raum")}
                        <input disabled={!canMutateDraft} value={photo?.location ?? ""} onChange={(event) => updatePhotoMeta(slot, "location", event.target.value)} />
                      </label>
                      <label>
                        {t("Observación", "Dokumentation")}
                        <textarea disabled={!canMutateDraft} value={photo?.documentation ?? ""} onChange={(event) => updatePhotoMeta(slot, "documentation", event.target.value)} />
                      </label>
                      {photo?.downloadUrl ? (
                        <PhotoAnnotatorLite
                          imageUrl={photo.downloadUrl}
                          annotations={annotations}
                          language={language}
                          disabled={!isOnline || saving || !canMutateDraft}
                          onChange={(next) => updateAnnotations(slot, next)}
                        />
                      ) : (
                        <EmptyState
                          title={t("Sin imagen aún", "Noch kein Bild")}
                          description={t("Cuando subas una foto podrás señalar la zona exacta.", "Nach dem Upload kannst du den genauen Bereich markieren.")}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {activeStep === "signature" && (
            <SectionCard
              title={t("Firma del técnico", "Techniker-Signatur")}
              eyebrow={t("Paso 5", "Schritt 5")}
              description={t("La firma se conserva y se inserta en el PDF final.", "Die Signatur wird gespeichert und im finalen PDF eingefügt.")}
            >
              <div className="grid two">
                <label>
                  {t("Nombre visible", "Angezeigter Name")}
                  <input
                    value={report.signature.technicianName}
                    disabled={!canMutateDraft}
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
                <div className="signature-meta">
                  <StatusChip tone={report.signature.storagePath || report.signature.dataUrl ? "success" : "warning"}>
                    {report.signature.storagePath || report.signature.dataUrl
                      ? t("Firma preparada", "Signatur bereit")
                      : t("Firma pendiente", "Signatur ausstehend")}
                  </StatusChip>
                </div>
              </div>
              <SignaturePad
                initialValue={report.signature.dataUrl || report.signature.downloadUrl}
                disabled={!isOnline || saving || report.status === "finalized" || !canMutateDraft}
                language={language}
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
            </SectionCard>
          )}

          {activeStep === "review" && (
            <SectionCard
              title={t("Revisión y salida", "Prüfung und Ausgabe")}
              eyebrow={t("Paso 6", "Schritt 6")}
              description={t("Comprueba el estado del informe, genera la vista previa y envía el PDF al cliente.", "Prüfe den Bericht, generiere die Vorschau und sende das PDF an den Kunden.")}
            >
              <div className="review-grid">
                <div className="review-grid__summary">
                  <div className="metric-grid metric-grid--compact">
                    <article className="metric-card">
                      <span>{t("Empresa", "Unternehmen")}</span>
                      <strong>{COMPANY_OPTIONS.find((company) => company.id === report.companyId)?.name ?? "-"}</strong>
                    </article>
                    <article className="metric-card">
                      <span>{t("Cliente", "Kunde")}</span>
                      <strong>{selectedClient ? getClientFullName(selectedClient) || selectedClient.location : "-"}</strong>
                    </article>
                    <article className="metric-card">
                      <span>{t("Fotos", "Fotos")}</span>
                      <strong>{report.photos.length}</strong>
                    </article>
                  </div>

                  {validationErrors.length > 0 ? (
                    <div className="validation-list">
                      <strong>{t("Puntos pendientes", "Offene Punkte")}</strong>
                      {validationErrors.map((item) => (
                        <small key={item}>{item}</small>
                      ))}
                    </div>
                  ) : (
                    <div className="validation-list validation-list--success">
                      <strong>{t("Informe listo para finalizar", "Bericht bereit zur Finalisierung")}</strong>
                    </div>
                  )}
                </div>

                <div className="review-grid__preview">
                  <div className="row">
                    <button type="button" className="ghost" disabled={previewLoading || saving || !isOnline} onClick={() => void previewPdf()}>
                      {previewLoading ? t("Generando preview...", "Vorschau wird erstellt...") : t("Generar preview PDF", "PDF-Vorschau erzeugen")}
                    </button>
                    {previewUrl && (
                      <a className="ghost button-link" href={previewUrl} target="_blank" rel="noreferrer">
                        {t("Abrir en pestaña", "Im Tab öffnen")}
                      </a>
                    )}
                  </div>
                  {previewUrl ? (
                    <object className="pdf-preview-frame editor-pdf-frame" data={previewUrl} type="application/pdf">
                      <p>{t("Tu navegador no puede mostrar el PDF.", "Der Browser kann das PDF nicht anzeigen.")}</p>
                    </object>
                  ) : (
                    <EmptyState
                      title={t("Sin preview todavía", "Noch keine Vorschau")}
                      description={t("Guarda el informe y genera una vista previa para revisar el PDF final.", "Speichere den Bericht und erzeuge eine Vorschau für das finale PDF.")}
                    />
                  )}
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        <aside className="report-flow-side">
          <SectionCard
            title={t("Estado del flujo", "Ablaufstatus")}
            eyebrow={t("Checklist", "Checkliste")}
            description={t("Cada paso deja claro si está listo, en curso o bloqueado por información anterior.", "Jeder Schritt zeigt klar, ob er bereit, aktiv oder durch frühere Angaben blockiert ist.")}
          >
            <div className="flow-status-list">
              {STEPS.map((step) => (
                <div key={step} className={`flow-status-item flow-status-item--${currentStepState(step)}`}>
                  <span>{getStepText(step, language)}</span>
                  <StatusChip tone={
                    currentStepState(step) === "done"
                      ? "success"
                      : currentStepState(step) === "active"
                        ? "info"
                        : currentStepState(step) === "blocked"
                          ? "danger"
                          : "warning"
                  }>
                    {currentStepState(step) === "done"
                      ? t("Listo", "Bereit")
                      : currentStepState(step) === "active"
                        ? t("En curso", "Aktiv")
                        : currentStepState(step) === "blocked"
                          ? t("Bloqueado", "Blockiert")
                          : t("Pendiente", "Offen")}
                  </StatusChip>
                </div>
              ))}
            </div>
          </SectionCard>
        </aside>
      </section>

      <ActionBar
        secondary={
          <>
            <button type="button" className="ghost" disabled={stepIndex(activeStep) === 0} onClick={() => goStep(-1)}>
              {t("Anterior", "Zurück")}
            </button>
            <button type="button" className="ghost" disabled={!isOnline || saving || !canMutateDraft} onClick={() => void persistReport(true)}>
              {t("Guardar ahora", "Jetzt speichern")}
            </button>
          </>
        }
        primary={
          activeStep === "review" ? (
            <>
              {report.status === "finalized" ? (
                <button
                  type="button"
                  disabled={!isOnline || saving || !report.clientId || !canSendEmail}
                  onClick={() => void sendPdfByEmail()}
                >
                  {t("Enviar PDF", "PDF senden")}
                </button>
              ) : (
                <button type="button" disabled={!isOnline || saving || !canMutateDraft} onClick={() => void finalizeReport()}>
                  {t("Finalizar PDF", "PDF finalisieren")}
                </button>
              )}
              <button
                type="button"
                className="ghost"
                disabled={!isOnline || saving || report.status !== "finalized" || !report.clientId || !canSendEmail}
                onClick={() => void sendPdfByEmail()}
              >
                {t("Enviar por correo", "Per E-Mail senden")}
              </button>
            </>
          ) : (
            <button type="button" disabled={!canAdvance} onClick={() => goStep(1)}>
              {canAdvance ? t("Siguiente paso", "Nächster Schritt") : t("Completa este paso", "Diesen Schritt abschließen")}
            </button>
          )
        }
        aside={
          <div className="action-bar__stack">
            <small>{lastSavedLabel}</small>
            <small>{t("Guardado continuo activo cuando hay conexión.", "Kontinuierliches Speichern aktiv, wenn eine Verbindung besteht.")}</small>
          </div>
        }
      />
    </main>
  );
};

import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
import { ACTION_OPTIONS, ATTENDEE_OPTIONS, DAMAGE_OPTIONS, PHOTO_SLOTS, TECHNIQUE_OPTIONS, TEMPLATE_OPTIONS } from "../constants";
import { db, functions, storage } from "../firebase";
import { normalizeReportData } from "../lib/firestore";
import { validateReportForFinalize } from "../lib/validation";
import { ClientData, FinalizeReportResult, ReportData } from "../types";
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

export const ReportEditor = ({ reportId, uid, isOnline, onBack }: ReportEditorProps) => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState("");
  const [clients, setClients] = useState<ClientData[]>([]);

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
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const readOnly = saving || !isOnline || report?.status === "finalized";

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

    const validationErrors = validateReportForFinalize(persisted);
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

    setSaving(true);
    setError("");

    try {
      const callable = httpsCallable<
        { reportId: string },
        { previewUrl?: string; previewBase64?: string; mimeType?: string }
      >(functions, "previewPdf");
      const result = await callable({ reportId });

      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
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
        setPreviewBlobUrl(objectUrl);
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
      setSaving(false);
    }
  };

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

  return (
    <main className="container stack">
      {!isOnline && <div className="offline-banner">Offline: Diese v1-App unterstützt nur Online-Bearbeitung.</div>}

      <header className="page-head">
        <button type="button" className="ghost" onClick={onBack}>
          Zurück
        </button>
        <div className="row">
          <button type="button" className="ghost" disabled={readOnly} onClick={() => void persistReport()}>
            Speichern
          </button>
          <button type="button" className="ghost" disabled={readOnly} onClick={previewPdf}>
            PDF Vorschau
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
      </header>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {previewUrl && (
        <p>
          PDF: <a href={previewUrl} target="_blank" rel="noreferrer">anzeigen</a>
        </p>
      )}

      <section className="card stack">
        <h2>Projekt & Termin</h2>
        <div className="grid two">
          <label>
            Vorlage
            <select
              value={report.brandTemplateId}
              disabled={readOnly}
              onChange={(event) =>
                updateReport((previous) => ({
                  ...previous,
                  brandTemplateId: event.target.value as ReportData["brandTemplateId"]
                }))
              }
            >
              {TEMPLATE_OPTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
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
      </section>

      <section className="card stack">
        <h2>Kontakte</h2>
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
      </section>

      <section className="card stack">
        <h2>Schadensbild / Anlass</h2>
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
      </section>

      <section className="card stack">
        <h2>Anwesende</h2>
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
      </section>

      <section className="card stack">
        <h2>Ergebnis der Überprüfung</h2>
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
      </section>

      <section className="card stack">
        <h2>Weiteres Vorgehen</h2>
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
      </section>

      <section className="card stack">
        <h2>Eingesetzte Verfahren und Technik</h2>
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
      </section>

      <section className="card stack">
        <h2>Bilddokumentation</h2>
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
      </section>

      <section className="card stack">
        <h2>Abrechnung</h2>
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
      </section>

      <section className="card stack">
        <h2>Techniker-Signatur</h2>
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
      </section>
    </main>
  );
};

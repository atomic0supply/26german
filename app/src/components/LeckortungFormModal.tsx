import { FormEvent, useEffect, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { functions, storage } from "../firebase";
import { COMPANIES, LECKORTUNG_HINWEIS_TEXT } from "../constants";
import { Language, translate } from "../i18n";
import { getCallableErrorMessage } from "../lib/callableErrors";
import { CompanyId } from "../types";
import { Dialog } from "./ui/Dialog";
import { SignaturePad } from "./SignaturePad";

interface LeckortungFormModalProps {
  reportId: string;
  companyId?: CompanyId;
  prefill: {
    locationObject: string;
    appointmentDate: string;
    technicianName: string;
    clientName: string;
    clientAddress: string;
    clientCity: string;
  };
  isOnline: boolean;
  language: Language;
  onClose: () => void;
  onFinalized: (pdfUrl: string) => void;
}

interface FormState {
  auftragnehmer: string;
  locationObject: string;
  name1: string;
  leistung: string;
  hinweis: string;
  ortDatum: string;
}

const SERVICE_SUGGESTIONS = [
  "Leckortung Trinkwasserinstallation",
  "Leckortung Heizungsinstallation",
  "Leckortung Fußbodenheizung",
  "Feuchtigkeitsmessung / Schadensaufnahme"
];

const extractCity = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const parts = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.at(-1) ?? trimmed;
};

const buildOrtDatum = (prefill: LeckortungFormModalProps["prefill"], language: Language) => {
  const city = extractCity(prefill.clientCity) || extractCity(prefill.clientAddress) || extractCity(prefill.locationObject);
  const date = prefill.appointmentDate
    ? new Date(prefill.appointmentDate).toLocaleDateString(language === "de" ? "de-DE" : "es-ES")
    : "";
  return city && date ? `${city}, ${date}` : city || date;
};

export const LeckortungFormModal = ({
  reportId,
  companyId,
  prefill,
  isOnline,
  language,
  onClose,
  onFinalized
}: LeckortungFormModalProps) => {
  const t = (es: string, de: string) => translate(language, de, es);
  const companyConfig = companyId ? COMPANIES[companyId] : undefined;

  const [form, setForm] = useState<FormState>({
    auftragnehmer: companyConfig?.name ?? "",
    locationObject: prefill.locationObject,
    name1: prefill.clientName,
    leistung: "",
    hinweis: "",
    ortDatum: buildOrtDatum(prefill, language)
  });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const signatureRef = useRef<string>("");

  useEffect(() => {
    if (!companyConfig?.logoStoragePath) return;
    getDownloadURL(ref(storage, companyConfig.logoStoragePath))
      .then(setLogoUrl)
      .catch(() => { /* logo no crítico */ });
  }, [companyConfig]);

  const set = (key: keyof FormState) =>
    (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSignatureChange = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    signatureRef.current = dataUrl;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOnline) return;

    const sigDataUrl = signatureRef.current || signatureDataUrl;
    if (!form.locationObject.trim() || !form.name1.trim() || !form.leistung.trim() || !form.ortDatum.trim()) {
      setError(
        t(
          "Completa lugar del daño, cliente, servicio realizado y lugar/fecha antes de generar el PDF.",
          "Bitte Schadenort, Kunde, Leistung und Ort/Datum ausfüllen, bevor das PDF erstellt wird."
        )
      );
      return;
    }

    if (!sigDataUrl) {
      setError(
        t(
          "Falta la firma del cliente. El cliente debe firmar en el recuadro antes de continuar.",
          "Die Kundenunterschrift fehlt. Bitte im Feld unterschreiben, bevor es weitergeht."
        )
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      let customerSignaturePath = "";
      if (sigDataUrl) {
        const blob = await (await fetch(sigDataUrl)).blob();
        const sigRef = ref(storage, `leckortung-signatures/${reportId}/customer.png`);
        await uploadBytes(sigRef, blob, { contentType: "image/png" });
        customerSignaturePath = sigRef.fullPath;
      }

      const callable = httpsCallable<
        { reportId: string; leckortungFields: Record<string, string> },
        { pdfUrl: string }
      >(functions, "finalizeReport");

      const result = await callable({
        reportId,
        leckortungFields: {
          auftragnehmer: form.auftragnehmer,
          locationObject: form.locationObject,
          name1: form.name1,
          leistung: form.leistung,
          hinweis: form.hinweis,
          ortDatum: form.ortDatum,
          customerSignaturePath
        }
      });

      onFinalized(result.data.pdfUrl);
    } catch (err) {
      setError(
        getCallableErrorMessage(err, t("Error al generar el PDF.", "Fehler beim PDF-Generieren."))
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      title="Leckortung – Auftrag"
      description={t(
        "Rellena los campos y recoge la firma del cliente para generar el PDF.",
        "Felder ausfüllen und Kundenunterschrift einholen, um das PDF zu erstellen."
      )}
      onClose={onClose}
      size="wide"
      footer={
        <div className="row">
          <button type="submit" form="leckortung-form" disabled={saving || !isOnline}>
            {saving
              ? t("Generando PDF...", "PDF wird erstellt...")
              : t("Confirmar y generar PDF", "Bestätigen und PDF erstellen")}
          </button>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            {t("Cancelar", "Abbrechen")}
          </button>
        </div>
      }
    >
      <form id="leckortung-form" onSubmit={(e) => void handleSubmit(e)} className="leckortung-shell">
        {error && <p className="notice-banner error">{error}</p>}

        <section className="leckortung-overview">
          <div className="leckortung-overview__copy">
            <span className="section-card__eyebrow">{t("Confirmación del cliente", "Kundenfreigabe")}</span>
            <h3>{t("Revisión final del servicio realizado", "Abschluss der durchgeführten Leistung")}</h3>
            <p>
              {t(
                "Revisa los datos con el cliente, recoge su firma y genera el PDF en el mismo paso.",
                "Daten mit dem Kunden prüfen, Unterschrift erfassen und das PDF direkt im selben Schritt erstellen."
              )}
            </p>
          </div>
          {logoUrl && (
            <div className="leckortung-logo">
              <img src={logoUrl} alt={companyConfig?.name ?? "Logo"} />
            </div>
          )}
        </section>

        <div className="leckortung-layout">
          <section className="leckortung-card">
            <div className="leckortung-card__header">
              <div>
                <h4>{t("Datos del encargo", "Auftragsdaten")}</h4>
                <p>{t("Campos principales que verá y confirmará el cliente.", "Hauptangaben, die der Kunde prüft und bestätigt.")}</p>
              </div>
            </div>

            <div className="leckortung-summary-grid">
              <article className="leckortung-summary-item">
                <span>{t("Cliente", "Kunde")}</span>
                <strong>{prefill.clientName || "—"}</strong>
                {prefill.clientAddress ? <small>{prefill.clientAddress}</small> : null}
              </article>
              <article className="leckortung-summary-item">
                <span>{t("Técnico", "Techniker")}</span>
                <strong>{prefill.technicianName || "—"}</strong>
                {prefill.appointmentDate ? <small>{buildOrtDatum(prefill, language)}</small> : null}
              </article>
            </div>

            <div className="grid two">
              <label>
                {t("Empresa responsable", "Auftragnehmer")}
                <input
                  type="text"
                  value={form.auftragnehmer}
                  onChange={(e) => set("auftragnehmer")(e.target.value)}
                  placeholder={t("Empresa que realiza la detección", "Unternehmen, das die Ortung durchführt")}
                />
              </label>
              <label>
                {t("Cliente", "Name des Kunden")}
                <input
                  type="text"
                  value={form.name1}
                  onChange={(e) => set("name1")(e.target.value)}
                  placeholder={t("Nombre completo del cliente", "Vollständiger Name des Kunden")}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                {t("Lugar del daño", "Schadenort")}
                <input
                  type="text"
                  value={form.locationObject}
                  onChange={(e) => set("locationObject")(e.target.value)}
                  placeholder={t("Dirección del inmueble afectado", "Adresse des betroffenen Gebäudes")}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                {t("Servicio realizado", "Leistung")}
                <input
                  type="text"
                  value={form.leistung}
                  onChange={(e) => set("leistung")(e.target.value)}
                  list="leckortung-service-suggestions"
                  placeholder={t(
                    "Ej.: Localización de fuga en instalación de agua potable",
                    "z.B. Leckortung an der Trinkwasserinstallation"
                  )}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                {t("Wichtiger Hinweis (fest)", "Wichtiger Hinweis (texto fijo)")}
                <textarea
                  className="field-readonly"
                  value={LECKORTUNG_HINWEIS_TEXT}
                  rows={9}
                  readOnly
                />
                <small style={{ color: "var(--color-muted, #666)", fontSize: "0.78rem", marginTop: "0.25rem", display: "block" }}>
                  {t(
                    "Dieser Text wird automatisch in das PDF eingefügt und ist nicht editierbar.",
                    "Este texto se inserta automáticamente en el PDF y no es editable."
                  )}
                </small>
              </label>
              <label>
                {t("Lugar y fecha", "Ort / Datum")}
                <input
                  type="text"
                  value={form.ortDatum}
                  onChange={(e) => set("ortDatum")(e.target.value)}
                  placeholder={t("Ej.: Madrid, 26/04/2026", "z.B. Dusseldorf, 26.04.2026")}
                  required
                />
              </label>
            </div>
          </section>

          <section className="leckortung-card leckortung-card--signature">
            <div className="leckortung-card__header">
              <div>
                <h4>{t("Firma del cliente", "Kundenunterschrift")}</h4>
                <p>
                  {t(
                    "La firma se guardará automáticamente al terminar de firmar.",
                    "Die Unterschrift wird automatisch gespeichert, sobald der Kunde fertig ist."
                  )}
                </p>
              </div>
            </div>

            <div className="leckortung-checklist">
              <small>{t("Revisa con el cliente:", "Bitte mit dem Kunden kurz prüfen:")}</small>
              <small>{t("1. Que el nombre y la dirección estén correctos.", "1. Name und Adresse stimmen.")}</small>
              <small>{t("2. Que la descripción del trabajo refleje lo realizado.", "2. Die Leistungsbeschreibung passt zum Einsatz.")}</small>
              <small>{t("3. Que firme en el recuadro para generar el PDF final.", "3. Im Feld unterschreiben, um das finale PDF zu erzeugen.")}</small>
            </div>

            <SignaturePad
              language={language}
              autoCommit
              showCommitButton={false}
              onChange={handleSignatureChange}
            />
            {signatureDataUrl ? (
              <p className="leckortung-signature-ok">
                {t("Firma capturada y lista para el PDF.", "Unterschrift erfasst und bereit fur das PDF.")}
              </p>
            ) : (
              <p className="leckortung-signature-hint">
                {t(
                  "El cliente puede firmar directamente con dedo o ratón en el recuadro.",
                  "Der Kunde kann direkt mit Finger oder Maus im Feld unterschreiben."
                )}
              </p>
            )}
          </section>
        </div>

        <datalist id="leckortung-service-suggestions">
          {SERVICE_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </form>
    </Dialog>
  );
};

import { FormEvent, useEffect, useRef, useState } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { COMPANIES } from "../constants";
import { createTranslator, Language } from "../i18n";
import { getCallableErrorMessage } from "../lib/callableErrors";
import {
  buildOrtDatum,
  LeckortungFields,
  SERVICE_SUGGESTIONS,
  submitLeckortung,
} from "../lib/leckortung";
import { CompanyId } from "../types";
import { Dialog } from "./ui/Dialog";
import { SignaturePad } from "./SignaturePad";
import { LegalNotice } from "./leckortung/LegalNotice";

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

export const LeckortungFormModal = ({
  reportId,
  companyId,
  prefill,
  isOnline,
  language,
  onClose,
  onFinalized,
}: LeckortungFormModalProps) => {
  const t = createTranslator(language);
  const companyConfig = companyId ? COMPANIES[companyId] : undefined;

  const [form, setForm] = useState<LeckortungFields>({
    auftragnehmer: companyConfig?.name ?? "",
    locationObject: prefill.locationObject,
    name1: prefill.clientName,
    leistung: "",
    hinweis: "",
    ortDatum: buildOrtDatum(prefill, language),
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
      .catch(() => {});
  }, [companyConfig]);

  const set =
    (key: keyof LeckortungFields) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

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
          "Bitte Schadenort, Kunde, Leistung und Ort/Datum ausfüllen, bevor das PDF erstellt wird.",
          "Completa lugar del daño, cliente, servicio realizado y lugar/fecha antes de generar el PDF."
        )
      );
      return;
    }

    if (!sigDataUrl) {
      setError(
        t(
          "Die Kundenunterschrift fehlt. Bitte im Feld unterschreiben, bevor es weitergeht.",
          "Falta la firma del cliente. El cliente debe firmar en el recuadro antes de continuar."
        )
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { pdfUrl } = await submitLeckortung(reportId, form, sigDataUrl);
      onFinalized(pdfUrl);
    } catch (err) {
      setError(getCallableErrorMessage(err, t("Fehler beim PDF-Generieren.", "Error al generar el PDF.")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      title="Leckortung – Auftrag"
      description={t(
        "Felder ausfüllen und Kundenunterschrift einholen, um das PDF zu erstellen.",
        "Rellena los campos y recoge la firma del cliente para generar el PDF."
      )}
      onClose={onClose}
      size="wide"
      footer={
        <div className="row">
          <button type="submit" form="leckortung-form" disabled={saving || !isOnline}>
            {saving
              ? t("PDF wird erstellt...", "Generando PDF...")
              : t("Bestätigen und PDF erstellen", "Confirmar y generar PDF")}
          </button>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            {t("Abbrechen", "Cancelar")}
          </button>
        </div>
      }
    >
      <form id="leckortung-form" onSubmit={(e) => void handleSubmit(e)} className="leckortung-shell">
        {error && <p className="notice-banner error">{error}</p>}

        <section className="leckortung-overview">
          <div className="leckortung-overview__copy">
            <span className="section-card__eyebrow">{t("Kundenfreigabe", "Confirmación del cliente")}</span>
            <h3>{t("Abschluss der durchgeführten Leistung", "Revisión final del servicio realizado")}</h3>
            <p>
              {t(
                "Daten mit dem Kunden prüfen, Unterschrift erfassen und das PDF direkt im selben Schritt erstellen.",
                "Revisa los datos con el cliente, recoge su firma y genera el PDF en el mismo paso."
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
                <h4>{t("Auftragsdaten", "Datos del encargo")}</h4>
                <p>
                  {t(
                    "Hauptangaben, die der Kunde prüft und bestätigt.",
                    "Campos principales que verá y confirmará el cliente."
                  )}
                </p>
              </div>
            </div>

            <div className="leckortung-summary-grid">
              <article className="leckortung-summary-item">
                <span>{t("Kunde", "Cliente")}</span>
                <strong>{prefill.clientName || "—"}</strong>
                {prefill.clientAddress ? <small>{prefill.clientAddress}</small> : null}
              </article>
              <article className="leckortung-summary-item">
                <span>{t("Techniker", "Técnico")}</span>
                <strong>{prefill.technicianName || "—"}</strong>
                {prefill.appointmentDate ? <small>{buildOrtDatum(prefill, language)}</small> : null}
              </article>
            </div>

            <div className="grid two">
              <label>
                {t("Auftragnehmer", "Empresa responsable")}
                <input
                  type="text"
                  value={form.auftragnehmer}
                  onChange={(e) => set("auftragnehmer")(e.target.value)}
                  placeholder={t("Unternehmen, das die Ortung durchführt", "Empresa que realiza la detección")}
                />
              </label>
              <label>
                {t("Name des Kunden", "Cliente")}
                <input
                  type="text"
                  value={form.name1}
                  onChange={(e) => set("name1")(e.target.value)}
                  placeholder={t("Vollständiger Name des Kunden", "Nombre completo del cliente")}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                {t("Schadenort", "Lugar del daño")}
                <input
                  type="text"
                  value={form.locationObject}
                  onChange={(e) => set("locationObject")(e.target.value)}
                  placeholder={t("Adresse des betroffenen Gebäudes", "Dirección del inmueble afectado")}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                {t("Leistung", "Servicio realizado")}
                <input
                  type="text"
                  value={form.leistung}
                  onChange={(e) => set("leistung")(e.target.value)}
                  list="leckortung-service-suggestions"
                  placeholder={t(
                    "z.B. Leckortung an der Trinkwasserinstallation",
                    "Ej.: Localización de fuga en instalación de agua potable"
                  )}
                  required
                />
              </label>
              <label className="leckortung-field-full">
                <LegalNotice language={language} />
              </label>
              <label>
                {t("Ort / Datum", "Lugar y fecha")}
                <input
                  type="text"
                  value={form.ortDatum}
                  onChange={(e) => set("ortDatum")(e.target.value)}
                  placeholder={t("z.B. Düsseldorf, 26.04.2026", "Ej.: Madrid, 26/04/2026")}
                  required
                />
              </label>
            </div>
          </section>

          <section className="leckortung-card leckortung-card--signature">
            <div className="leckortung-card__header">
              <div>
                <h4>{t("Kundenunterschrift", "Firma del cliente")}</h4>
                <p>
                  {t(
                    "Die Unterschrift wird automatisch gespeichert, sobald der Kunde fertig ist.",
                    "La firma se guardará automáticamente al terminar de firmar."
                  )}
                </p>
              </div>
            </div>

            <div className="leckortung-checklist">
              <small>{t("Bitte mit dem Kunden kurz prüfen:", "Revisa con el cliente:")}</small>
              <small>{t("1. Name und Adresse stimmen.", "1. Que el nombre y la dirección estén correctos.")}</small>
              <small>{t("2. Die Leistungsbeschreibung passt zum Einsatz.", "2. Que la descripción del trabajo refleje lo realizado.")}</small>
              <small>{t("3. Im Feld unterschreiben, um das finale PDF zu erzeugen.", "3. Que firme en el recuadro para generar el PDF final.")}</small>
            </div>

            <SignaturePad language={language} autoCommit showCommitButton={false} onChange={handleSignatureChange} />
            {signatureDataUrl ? (
              <p className="leckortung-signature-ok">
                {t("Unterschrift erfasst und bereit für das PDF.", "Firma capturada y lista para el PDF.")}
              </p>
            ) : (
              <p className="leckortung-signature-hint">
                {t(
                  "Der Kunde kann direkt mit Finger oder Maus im Feld unterschreiben.",
                  "El cliente puede firmar directamente con dedo o ratón en el recuadro."
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

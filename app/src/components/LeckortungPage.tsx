import { FormEvent, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { db, storage } from "../firebase";
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
import { SignaturePad } from "./SignaturePad";
import { Toast, ToastMessage } from "./ui/Toast";

interface LeckortungPageProps {
  reportId: string;
  isOnline: boolean;
  language: Language;
  onBack: () => void;
}

interface Prefill {
  locationObject: string;
  appointmentDate: string;
  technicianName: string;
  clientName: string;
  clientAddress: string;
  clientCity: string;
  companyId?: CompanyId;
}

export const LeckortungPage = ({ reportId, isOnline, language, onBack }: LeckortungPageProps) => {
  const t = createTranslator(language);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<LeckortungFields>({
    auftragnehmer: "",
    locationObject: "",
    name1: "",
    leistung: "",
    hinweis: "",
    ortDatum: "",
  });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const signatureRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "reports", reportId));
        if (!snap.exists()) {
          setLoadError(t("Bericht nicht gefunden.", "Informe no encontrado."));
          return;
        }
        const data = snap.data();
        const companyId = data.companyId as CompanyId | undefined;
        const companyConfig = companyId ? COMPANIES[companyId] : undefined;
        const locationObject: string = data.projectInfo?.locationObject ?? data.projectInfo?.location ?? "";
        const appointmentDate: string = data.projectInfo?.appointmentDate ?? "";
        const technicianName: string = data.projectInfo?.technicianName ?? data.signature?.technicianName ?? "";
        const clientId: string = data.clientId ?? "";

        let clientName = "";
        let clientAddress = "";
        let clientCity = "";
        if (clientId) {
          const clientSnap = await getDoc(doc(db, "clients", clientId));
          if (clientSnap.exists()) {
            const c = clientSnap.data();
            clientName = [c.name, c.surname].filter(Boolean).join(" ") || c.principalContact || "";
            clientAddress = c.location ?? "";
            clientCity = c.location ?? "";
          }
        }
        if (cancelled) return;

        const p: Prefill = { locationObject, appointmentDate, technicianName, clientName, clientAddress, clientCity, companyId };
        setPrefill(p);
        setForm({
          auftragnehmer: companyConfig?.name ?? "",
          locationObject,
          name1: clientName,
          leistung: "",
          hinweis: "",
          ortDatum: buildOrtDatum(p, language),
        });

        if (companyConfig?.logoStoragePath) {
          getDownloadURL(ref(storage, companyConfig.logoStoragePath))
            .then((url) => { if (!cancelled) setLogoUrl(url); })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setLoadError(t("Der Bericht konnte nicht geladen werden.", "No se pudo cargar el informe."));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reportId, language]);

  const set = (key: keyof LeckortungFields) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSignatureChange = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    signatureRef.current = dataUrl;
  };

  const dismissToast = (id: string) => setToasts((prev) => prev.filter((toast) => toast.id !== id));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) return;
    const sigDataUrl = signatureRef.current || signatureDataUrl;
    if (!form.locationObject.trim() || !form.name1.trim() || !form.leistung.trim() || !form.ortDatum.trim()) {
      setError(
        t(
          "Bitte Schadenort, Kunde, Leistung und Ort/Datum ausfüllen.",
          "Completa lugar del daño, cliente, servicio realizado y lugar/fecha."
        )
      );
      return;
    }
    if (!sigDataUrl) {
      setError(
        t(
          "Die Kundenunterschrift fehlt. Bitte im Feld unterschreiben.",
          "Falta la firma del cliente. El cliente debe firmar en el recuadro."
        )
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      await submitLeckortung(reportId, form, sigDataUrl);
      setToasts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tone: "celebrate",
          text: t("PDF erstellt – bereit zum Versand.", "PDF generado, listo para enviar."),
        },
      ]);
      setDone(true);
      window.setTimeout(() => onBack(), 1800);
    } catch (err) {
      setError(getCallableErrorMessage(err, t("Fehler beim PDF-Generieren.", "Error al generar el PDF.")));
    } finally {
      setSaving(false);
    }
  };

  const BackButton = (
    <button type="button" className="leck-page__back" onClick={onBack} aria-label={t("Zurück", "Volver")}>
      <ArrowLeft size={18} aria-hidden="true" />
    </button>
  );

  if (!prefill && !loadError) {
    return (
      <div className="leck-page">
        <header className="leck-page__header">
          {BackButton}
          <span className="leck-page__title">Leckortung – Auftrag</span>
        </header>
        <div className="leck-page__body" style={{ alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>{t("Laden...", "Cargando...")}</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="leck-page">
        <header className="leck-page__header">
          {BackButton}
          <span className="leck-page__title">Leckortung</span>
        </header>
        <div className="leck-page__body">
          <div className="leck-page__error">{loadError}</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <>
        <div className="leck-page">
          <header className="leck-page__header">
            {BackButton}
            <span className="leck-page__title">Leckortung</span>
            {logoUrl && <img src={logoUrl} alt="" className="leck-page__logo" />}
          </header>
          <div className="leck-page__success">
            <motion.div
              className="leck-page__success-icon"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 16 }}
            >
              <CheckCircle2 size={48} strokeWidth={2.2} aria-hidden="true" />
            </motion.div>
            <h2>{t("PDF erstellt!", "¡PDF generado!")}</h2>
            <p>
              {t(
                "Das Leckortung-PDF wurde erfolgreich gespeichert und kann jetzt an den Kunden gesendet werden.",
                "El informe Leckortung se ha guardado correctamente. Ya puedes enviárselo al cliente."
              )}
            </p>
          </div>
        </div>
        <Toast messages={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const p = prefill!;
  return (
    <>
      <div className="leck-page">
        <header className="leck-page__header">
          {BackButton}
          <div className="leck-page__header-copy">
            <span className="leck-page__title">Leckortung – Auftrag</span>
            <span className="leck-page__subtitle">
              {t(
                "Felder ausfüllen und Kundenunterschrift einholen, um das PDF zu erstellen.",
                "Rellena los campos y recoge la firma del cliente para generar el PDF."
              )}
            </span>
          </div>
          {logoUrl && <img src={logoUrl} alt="" className="leck-page__logo" />}
        </header>

        <form id="leck-page-form" onSubmit={(e) => void handleSubmit(e)} className="leck-page__body" noValidate>
          {error && <div className="leck-page__error" role="alert">{error}</div>}

          <div className="leck-page__summary">
            {p.clientName && (
              <div className="leck-page__summary-item">
                <span>{t("Kunde", "Cliente")}</span>
                <strong>{p.clientName}</strong>
              </div>
            )}
            {p.technicianName && (
              <div className="leck-page__summary-item">
                <span>{t("Techniker", "Técnico")}</span>
                <strong>{p.technicianName}</strong>
              </div>
            )}
            {p.appointmentDate && (
              <div className="leck-page__summary-item">
                <span>{t("Datum", "Fecha")}</span>
                <strong>{new Date(p.appointmentDate).toLocaleDateString(language === "de" ? "de-DE" : "es-ES")}</strong>
              </div>
            )}
          </div>

          <section className="leck-page__section">
            <h3 className="leck-page__section-title">{t("Auftragsdaten", "Datos del encargo")}</h3>

            <label className="leck-page__label">
              {t("Auftragnehmer", "Empresa responsable")}
              <input
                type="text"
                className="leck-page__input"
                value={form.auftragnehmer}
                onChange={(e) => set("auftragnehmer")(e.target.value)}
                placeholder={t("Unternehmen, das die Ortung durchführt", "Empresa que realiza la detección")}
                autoComplete="organization"
              />
            </label>

            <label className="leck-page__label">
              {t("Name des Kunden", "Cliente")} <span className="leck-page__req">*</span>
              <input
                type="text"
                className="leck-page__input"
                value={form.name1}
                onChange={(e) => set("name1")(e.target.value)}
                placeholder={t("Vollständiger Name des Kunden", "Nombre completo del cliente")}
                autoComplete="name"
              />
            </label>

            <label className="leck-page__label">
              {t("Schadenort", "Lugar del daño")} <span className="leck-page__req">*</span>
              <input
                type="text"
                className="leck-page__input"
                value={form.locationObject}
                onChange={(e) => set("locationObject")(e.target.value)}
                placeholder={t("Adresse des betroffenen Gebäudes", "Dirección del inmueble afectado")}
                autoComplete="street-address"
              />
            </label>

            <label className="leck-page__label">
              {t("Leistung", "Servicio realizado")} <span className="leck-page__req">*</span>
              <input
                type="text"
                className="leck-page__input"
                value={form.leistung}
                onChange={(e) => set("leistung")(e.target.value)}
                list="leck-page-suggestions"
                placeholder={t(
                  "z.B. Leckortung an der Trinkwasserinstallation",
                  "Ej.: Localización de fuga en instalación de agua potable"
                )}
              />
            </label>

            <label className="leck-page__label">
              {t("Hinweis", "Observaciones")}
              <textarea
                className="leck-page__input leck-page__textarea"
                value={form.hinweis}
                onChange={(e) => set("hinweis")(e.target.value)}
                rows={4}
                placeholder={t(
                  "Technische Hinweise, Grenzen der Untersuchung oder Notizen für den Kunden...",
                  "Observaciones técnicas, limitaciones de la inspección o notas para el cliente..."
                )}
              />
            </label>

            <label className="leck-page__label">
              {t("Ort / Datum", "Lugar y fecha")} <span className="leck-page__req">*</span>
              <input
                type="text"
                className="leck-page__input"
                value={form.ortDatum}
                onChange={(e) => set("ortDatum")(e.target.value)}
                placeholder={t("z.B. Düsseldorf, 26.04.2026", "Ej.: Madrid, 26/04/2026")}
              />
            </label>
          </section>

          <section className="leck-page__section leck-page__section--sig">
            <h3 className="leck-page__section-title">{t("Kundenunterschrift", "Firma del cliente")}</h3>

            <div className="leck-page__checklist">
              <p>{t("Bitte mit dem Kunden kurz prüfen:", "Antes de firmar, confirma con el cliente:")}</p>
              <ol>
                <li>{t("Name und Adresse stimmen.", "Que el nombre y la dirección están correctos.")}</li>
                <li>{t("Die Leistungsbeschreibung passt zum Einsatz.", "Que la descripción del trabajo refleja lo realizado.")}</li>
                <li>{t("Im Feld unterschreiben, um das PDF zu erzeugen.", "Que firma en el recuadro para generar el PDF.")}</li>
              </ol>
            </div>

            <SignaturePad language={language} autoCommit showCommitButton={false} onChange={handleSignatureChange} />

            {signatureDataUrl ? (
              <p className="leck-page__sig-ok">✓ {t("Unterschrift erfasst.", "Firma capturada.")}</p>
            ) : (
              <p className="leck-page__sig-hint">
                {t(
                  "Der Kunde kann direkt mit Finger oder Maus im Feld unterschreiben.",
                  "El cliente puede firmar directamente con dedo o ratón en el recuadro."
                )}
              </p>
            )}
          </section>

          <datalist id="leck-page-suggestions">
            {SERVICE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </form>

        <div className="leck-page__footer">
          <button
            type="submit"
            form="leck-page-form"
            className="leck-page__submit"
            disabled={saving || !isOnline}
          >
            {saving
              ? t("PDF wird erstellt...", "Generando PDF...")
              : t("Bestätigen und PDF erstellen", "Confirmar y generar PDF")}
          </button>
        </div>
      </div>
      <Toast messages={toasts} onDismiss={dismissToast} />
    </>
  );
};

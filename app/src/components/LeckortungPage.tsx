import { FormEvent, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../firebase";
import { COMPANIES } from "../constants";
import { Language, translate } from "../i18n";
import { getCallableErrorMessage } from "../lib/callableErrors";
import { CompanyId } from "../types";
import { SignaturePad } from "./SignaturePad";

interface LeckortungPageProps {
  reportId: string;
  isOnline: boolean;
  language: Language;
  onBack: () => void;
}

interface FormState {
  auftragnehmer: string;
  locationObject: string;
  name1: string;
  leistung: string;
  hinweis: string;
  ortDatum: string;
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

const SERVICE_SUGGESTIONS = [
  "Leckortung Trinkwasserinstallation",
  "Leckortung Heizungsinstallation",
  "Leckortung Fußbodenheizung",
  "Feuchtigkeitsmessung / Schadensaufnahme"
];

const extractCity = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.split(",").map((p) => p.trim()).filter(Boolean).at(-1) ?? trimmed;
};

const buildOrtDatum = (prefill: Prefill, language: Language) => {
  const city = extractCity(prefill.clientCity) || extractCity(prefill.clientAddress) || extractCity(prefill.locationObject);
  const date = prefill.appointmentDate
    ? new Date(prefill.appointmentDate).toLocaleDateString(language === "de" ? "de-DE" : "es-ES")
    : "";
  return city && date ? `${city}, ${date}` : city || date;
};

const tr = (language: Language, es: string, de: string) => translate(language, de, es);

export const LeckortungPage = ({ reportId, isOnline, language, onBack }: LeckortungPageProps) => {
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState<FormState>({
    auftragnehmer: "",
    locationObject: "",
    name1: "",
    leistung: "",
    hinweis: "",
    ortDatum: ""
  });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const signatureRef = useRef<string>("");

  /* ── Load report + client data ── */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "reports", reportId));
        if (!snap.exists()) { setLoadError("Informe no encontrado."); return; }
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
          ortDatum: buildOrtDatum(p, language)
        });

        if (companyConfig?.logoStoragePath) {
          getDownloadURL(ref(storage, companyConfig.logoStoragePath))
            .then((url) => { if (!cancelled) setLogoUrl(url); })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setLoadError(tr(language, "No se pudo cargar el informe.", "Der Bericht konnte nicht geladen werden."));
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [reportId, language]);

  const set = (key: keyof FormState) =>
    (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSignatureChange = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    signatureRef.current = dataUrl;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) return;

    const sigDataUrl = signatureRef.current || signatureDataUrl;

    if (!form.locationObject.trim() || !form.name1.trim() || !form.leistung.trim() || !form.ortDatum.trim()) {
      setError(
        tr(language,
          "Completa lugar del daño, cliente, servicio realizado y lugar/fecha.",
          "Bitte Schadenort, Kunde, Leistung und Ort/Datum ausfüllen."
        )
      );
      return;
    }

    if (!sigDataUrl) {
      setError(
        tr(language,
          "Falta la firma del cliente. El cliente debe firmar en el recuadro.",
          "Die Kundenunterschrift fehlt. Bitte im Feld unterschreiben."
        )
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const blob = await (await fetch(sigDataUrl)).blob();
      const sigRef = ref(storage, `leckortung-signatures/${reportId}/customer.png`);
      await uploadBytes(sigRef, blob, { contentType: "image/png" });
      const customerSignaturePath = sigRef.fullPath;

      const callable = httpsCallable<
        { reportId: string; leckortungFields: Record<string, string> },
        { pdfUrl: string }
      >(functions, "finalizeReport");

      await callable({
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

      setDone(true);
    } catch (err) {
      setError(
        getCallableErrorMessage(err, tr(language, "Error al generar el PDF.", "Fehler beim PDF-Generieren."))
      );
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading state ── */
  if (!prefill && !loadError) {
    return (
      <div className="leck-page">
        <header className="leck-page__header">
          <button type="button" className="leck-page__back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
          <span className="leck-page__title">Leckortung – Auftrag</span>
        </header>
        <div className="leck-page__body" style={{ alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>
            {tr(language, "Cargando...", "Laden...")}
          </p>
        </div>
      </div>
    );
  }

  /* ── Load error ── */
  if (loadError) {
    return (
      <div className="leck-page">
        <header className="leck-page__header">
          <button type="button" className="leck-page__back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
          <span className="leck-page__title">Leckortung</span>
        </header>
        <div className="leck-page__body">
          <div className="leck-page__error">{loadError}</div>
        </div>
      </div>
    );
  }

  /* ── Success screen ── */
  if (done) {
    return (
      <div className="leck-page">
        <header className="leck-page__header">
          <button type="button" className="leck-page__back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
          <span className="leck-page__title">Leckortung</span>
          {logoUrl && <img src={logoUrl} alt="" className="leck-page__logo" />}
        </header>
        <div className="leck-page__success">
          <div className="leck-page__success-icon">✓</div>
          <h2>{tr(language, "¡PDF generado!", "PDF erstellt!")}</h2>
          <p>
            {tr(language,
              "El informe Leckortung se ha guardado correctamente. Ya puedes enviárselo al cliente.",
              "Das Leckortung-PDF wurde erfolgreich gespeichert und kann jetzt an den Kunden gesendet werden."
            )}
          </p>
          <button type="button" onClick={onBack}>
            {tr(language, "Volver a la ficha", "Zurück zur Übersicht")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Form ── */
  const p = prefill!;
  return (
    <div className="leck-page">
      {/* ── Header ── */}
      <header className="leck-page__header">
        <button type="button" className="leck-page__back" onClick={onBack} aria-label={tr(language, "Volver", "Zurück")}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <div className="leck-page__header-copy">
          <span className="leck-page__title">Leckortung – Auftrag</span>
          <span className="leck-page__subtitle">
            {tr(language,
              "Rellena los campos y recoge la firma del cliente para generar el PDF.",
              "Felder ausfüllen und Kundenunterschrift einholen, um das PDF zu erstellen."
            )}
          </span>
        </div>
        {logoUrl && <img src={logoUrl} alt="" className="leck-page__logo" />}
      </header>

      {/* ── Scrollable body ── */}
      <form
        id="leck-page-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="leck-page__body"
        noValidate
      >
        {error && (
          <div className="leck-page__error" role="alert">{error}</div>
        )}

        {/* Info strip */}
        <div className="leck-page__summary">
          {p.clientName && (
            <div className="leck-page__summary-item">
              <span>{tr(language, "Cliente", "Kunde")}</span>
              <strong>{p.clientName}</strong>
            </div>
          )}
          {p.technicianName && (
            <div className="leck-page__summary-item">
              <span>{tr(language, "Técnico", "Techniker")}</span>
              <strong>{p.technicianName}</strong>
            </div>
          )}
          {p.appointmentDate && (
            <div className="leck-page__summary-item">
              <span>{tr(language, "Fecha", "Datum")}</span>
              <strong>
                {new Date(p.appointmentDate).toLocaleDateString(
                  language === "de" ? "de-DE" : "es-ES"
                )}
              </strong>
            </div>
          )}
        </div>

        {/* ── Auftragsdaten ── */}
        <section className="leck-page__section">
          <h3 className="leck-page__section-title">{tr(language, "Datos del encargo", "Auftragsdaten")}</h3>

          <label className="leck-page__label">
            {tr(language, "Empresa responsable", "Auftragnehmer")}
            <input
              type="text"
              className="leck-page__input"
              value={form.auftragnehmer}
              onChange={(e) => set("auftragnehmer")(e.target.value)}
              placeholder={tr(language, "Empresa que realiza la detección", "Unternehmen, das die Ortung durchführt")}
              autoComplete="organization"
            />
          </label>

          <label className="leck-page__label">
            {tr(language, "Cliente", "Name des Kunden")} <span className="leck-page__req">*</span>
            <input
              type="text"
              className="leck-page__input"
              value={form.name1}
              onChange={(e) => set("name1")(e.target.value)}
              placeholder={tr(language, "Nombre completo del cliente", "Vollständiger Name des Kunden")}
              autoComplete="name"
            />
          </label>

          <label className="leck-page__label">
            {tr(language, "Lugar del daño", "Schadenort")} <span className="leck-page__req">*</span>
            <input
              type="text"
              className="leck-page__input"
              value={form.locationObject}
              onChange={(e) => set("locationObject")(e.target.value)}
              placeholder={tr(language, "Dirección del inmueble afectado", "Adresse des betroffenen Gebäudes")}
              autoComplete="street-address"
            />
          </label>

          <label className="leck-page__label">
            {tr(language, "Servicio realizado", "Leistung")} <span className="leck-page__req">*</span>
            <input
              type="text"
              className="leck-page__input"
              value={form.leistung}
              onChange={(e) => set("leistung")(e.target.value)}
              list="leck-page-suggestions"
              placeholder={tr(language,
                "Ej.: Localización de fuga en instalación de agua potable",
                "z.B. Leckortung an der Trinkwasserinstallation"
              )}
            />
          </label>

          <label className="leck-page__label">
            {tr(language, "Observaciones", "Hinweis")}
            <textarea
              className="leck-page__input leck-page__textarea"
              value={form.hinweis}
              onChange={(e) => set("hinweis")(e.target.value)}
              rows={4}
              placeholder={tr(language,
                "Observaciones técnicas, limitaciones de la inspección o notas para el cliente...",
                "Technische Hinweise, Grenzen der Untersuchung oder Notizen für den Kunden..."
              )}
            />
          </label>

          <label className="leck-page__label">
            {tr(language, "Lugar y fecha", "Ort / Datum")} <span className="leck-page__req">*</span>
            <input
              type="text"
              className="leck-page__input"
              value={form.ortDatum}
              onChange={(e) => set("ortDatum")(e.target.value)}
              placeholder={tr(language, "Ej.: Madrid, 26/04/2026", "z.B. Düsseldorf, 26.04.2026")}
            />
          </label>
        </section>

        {/* ── Firma ── */}
        <section className="leck-page__section leck-page__section--sig">
          <h3 className="leck-page__section-title">{tr(language, "Firma del cliente", "Kundenunterschrift")}</h3>

          <div className="leck-page__checklist">
            <p>{tr(language, "Antes de firmar, confirma con el cliente:", "Bitte mit dem Kunden kurz prüfen:")}</p>
            <ol>
              <li>{tr(language, "Que el nombre y la dirección están correctos.", "Name und Adresse stimmen.")}</li>
              <li>{tr(language, "Que la descripción del trabajo refleja lo realizado.", "Die Leistungsbeschreibung passt zum Einsatz.")}</li>
              <li>{tr(language, "Que firma en el recuadro para generar el PDF.", "Im Feld unterschreiben, um das PDF zu erzeugen.")}</li>
            </ol>
          </div>

          <SignaturePad
            language={language}
            autoCommit
            showCommitButton={false}
            onChange={handleSignatureChange}
          />

          {signatureDataUrl ? (
            <p className="leck-page__sig-ok">
              ✓ {tr(language, "Firma capturada.", "Unterschrift erfasst.")}
            </p>
          ) : (
            <p className="leck-page__sig-hint">
              {tr(language,
                "El cliente puede firmar directamente con dedo o ratón en el recuadro.",
                "Der Kunde kann direkt mit Finger oder Maus im Feld unterschreiben."
              )}
            </p>
          )}
        </section>

        <datalist id="leck-page-suggestions">
          {SERVICE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </form>

      {/* ── Sticky submit footer ── */}
      <div className="leck-page__footer">
        <button
          type="submit"
          form="leck-page-form"
          className="leck-page__submit"
          disabled={saving || !isOnline}
        >
          {saving
            ? tr(language, "Generando PDF...", "PDF wird erstellt...")
            : tr(language, "Confirmar y generar PDF", "Bestätigen und PDF erstellen")}
        </button>
      </div>
    </div>
  );
};

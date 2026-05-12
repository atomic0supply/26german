import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { Language, translate } from "../i18n";
import { PartnerData } from "../types";

interface PartnerManagerProps {
  language: Language;
  isOnline: boolean;
}

const EMPTY_PARTNER: Omit<PartnerData, "id"> = {
  name: "",
  contactPerson: "",
  street: "",
  city: "",
  phone: "",
  mobile: "",
  email: "",
  web: ""
};

export const PartnerManager = ({ language, isOnline }: PartnerManagerProps) => {
  const t = (de: string, es: string) => translate(language, de, es);
  const [partners, setPartners] = useState<PartnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartnerData | null>(null);
  const [draft, setDraft] = useState<Omit<PartnerData, "id"> & { id?: string }>({ ...EMPTY_PARTNER });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "partners"),
      (snapshot) => {
        const next = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: String(d.name ?? ""),
            contactPerson: String(d.contactPerson ?? ""),
            street: String(d.street ?? ""),
            city: String(d.city ?? ""),
            phone: String(d.phone ?? ""),
            mobile: String(d.mobile ?? ""),
            email: String(d.email ?? ""),
            web: String(d.web ?? "")
          } satisfies PartnerData;
        }).sort((a, b) => a.name.localeCompare(b.name));
        setPartners(next);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const startNew = () => {
    setEditing(null);
    setDraft({ ...EMPTY_PARTNER });
    setError("");
    setNotice("");
  };

  const startEdit = (partner: PartnerData) => {
    setEditing(partner);
    setDraft({ ...partner });
    setError("");
    setNotice("");
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError(t("Name ist erforderlich.", "El nombre es obligatorio."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fn = httpsCallable<Partial<PartnerData>, PartnerData>(functions, "savePartner");
      await fn(draft);
      setNotice(t("Partner gespeichert.", "Partner guardado."));
      setEditing(null);
      setDraft({ ...EMPTY_PARTNER });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (partner: PartnerData) => {
    if (!window.confirm(t(`„${partner.name}" wirklich löschen?`, `¿Eliminar realmente "${partner.name}"?`))) return;
    setError("");
    try {
      const fn = httpsCallable<{ id: string }, { deleted: boolean }>(functions, "deletePartner");
      await fn({ id: partner.id });
      setNotice(t("Partner gelöscht.", "Partner eliminado."));
      if (editing?.id === partner.id) {
        setEditing(null);
        setDraft({ ...EMPTY_PARTNER });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSeed = async () => {
    if (!window.confirm(t(
      "Initiale Partner laden? Bestehende Daten werden nicht überschrieben.",
      "¿Cargar partners iniciales? Los datos existentes no se sobrescribirán."
    ))) return;
    setSeeding(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, { created: number; updated: number; total: number }>(functions, "seedDemoPartners");
      const result = await fn({});
      setNotice(t(
        `Geladen: ${result.data.created} neu, ${result.data.updated} aktualisiert.`,
        `Cargados: ${result.data.created} nuevos, ${result.data.updated} actualizados.`
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSeeding(false);
    }
  };

  const partnerCount = useMemo(() => partners.length, [partners]);

  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const avatarHue = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  };

  return (
    <div className="partner-manager">
      <div className="partner-manager__toolbar">
        <button type="button" className="btn-primary" onClick={startNew} disabled={!isOnline}>
          {t("Neuer Partner", "Nuevo partner")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleSeed()} disabled={!isOnline || seeding}>
          {seeding ? t("Lade...", "Cargando...") : t("Initiale Partner laden", "Cargar partners iniciales")}
        </button>
        <span className="partner-manager__count">
          {partnerCount} {t("Partner", "partners")}
        </span>
      </div>

      {error && <p className="form-error" style={{ marginBottom: "0.75rem" }}>{error}</p>}
      {notice && <p className="form-notice" style={{ marginBottom: "0.75rem" }}>{notice}</p>}

      <div className="partner-manager__layout">
        <div>
          <h3 className="partner-manager__heading">{t("Liste der Partner", "Listado de partners")}</h3>
          {loading ? (
            <p>{t("Lade...", "Cargando...")}</p>
          ) : partners.length === 0 ? (
            <p>{t("Keine Partner vorhanden.", "Sin partners.")}</p>
          ) : (
            <ul className="partner-list">
              {partners.map((p) => {
                const isActive = editing?.id === p.id;
                const addressLine = [p.street, p.city].filter(Boolean).join(" · ");
                return (
                  <li
                    key={p.id}
                    className={isActive ? "partner-card partner-card--active" : "partner-card"}
                  >
                    <button
                      type="button"
                      className="partner-card__body"
                      onClick={() => startEdit(p)}
                      aria-label={t(`${p.name} bearbeiten`, `Editar ${p.name}`)}
                    >
                      <span
                        className="partner-card__avatar"
                        style={{ background: `hsl(${avatarHue(p.name)} 60% 45%)` }}
                        aria-hidden="true"
                      >
                        {initialsOf(p.name)}
                      </span>
                      <span className="partner-card__info">
                        <strong className="partner-card__name">{p.name}</strong>
                        {p.contactPerson && (
                          <span className="partner-card__contact">{p.contactPerson}</span>
                        )}
                        {addressLine && (
                          <span className="partner-card__address">{addressLine}</span>
                        )}
                        {p.email && <span className="partner-card__email">{p.email}</span>}
                      </span>
                    </button>
                    <div className="partner-card__actions">
                      <button
                        type="button"
                        className="partner-card__action"
                        onClick={() => startEdit(p)}
                        title={t("Bearbeiten", "Editar")}
                        aria-label={t("Bearbeiten", "Editar")}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="partner-card__action partner-card__action--danger"
                        onClick={() => void handleDelete(p)}
                        disabled={!isOnline}
                        title={t("Löschen", "Eliminar")}
                        aria-label={t("Löschen", "Eliminar")}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="partner-manager__heading">
            {editing ? t("Partner bearbeiten", "Editar partner") : t("Neuer Partner", "Nuevo partner")}
          </h3>
          <div className="grid two">
            <label>
              {t("Firma / Name", "Empresa / Nombre")} *
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              {t("Ansprechpartner", "Persona de contacto")}
              <input
                value={draft.contactPerson}
                onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })}
              />
            </label>
            <label className="form-panel__full">
              {t("Straße", "Dirección")}
              <input
                value={draft.street}
                onChange={(e) => setDraft({ ...draft, street: e.target.value })}
              />
            </label>
            <label className="form-panel__full">
              {t("PLZ + Ort", "CP + Ciudad")}
              <input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </label>
            <label>
              {t("Telefon", "Teléfono")}
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label>
              {t("Mobil", "Móvil")}
              <input
                value={draft.mobile}
                onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
              />
            </label>
            <label>
              {t("E-Mail", "Email")}
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label>
              {t("Web", "Web")}
              <input
                value={draft.web}
                onChange={(e) => setDraft({ ...draft, web: e.target.value })}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSave()}
              disabled={saving || !isOnline}
            >
              {saving ? t("Speichert...", "Guardando...") : t("Speichern", "Guardar")}
            </button>
            {editing && (
              <button type="button" className="btn-secondary" onClick={startNew}>
                {t("Abbrechen", "Cancelar")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

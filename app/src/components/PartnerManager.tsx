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

  return (
    <div className="partner-manager">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem", alignItems: "center" }}>
        <button type="button" className="btn-primary" onClick={startNew} disabled={!isOnline}>
          {t("Neuer Partner", "Nuevo partner")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleSeed()} disabled={!isOnline || seeding}>
          {seeding ? t("Lade...", "Cargando...") : t("Initiale Partner laden", "Cargar partners iniciales")}
        </button>
        <span style={{ marginLeft: "auto", color: "var(--color-muted, #666)", fontSize: "0.85rem" }}>
          {partnerCount} {t("Partner", "partners")}
        </span>
      </div>

      {error && <p className="form-error" style={{ marginBottom: "0.75rem" }}>{error}</p>}
      {notice && <p className="form-notice" style={{ marginBottom: "0.75rem" }}>{notice}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: "1.5rem" }}>
        <div>
          <h3 style={{ marginTop: 0 }}>{t("Liste der Partner", "Listado de partners")}</h3>
          {loading ? (
            <p>{t("Lade...", "Cargando...")}</p>
          ) : partners.length === 0 ? (
            <p>{t("Keine Partner vorhanden.", "Sin partners.")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {partners.map((p) => (
                <li
                  key={p.id}
                  style={{
                    padding: "0.6rem 0.8rem",
                    border: "1px solid var(--color-border, #e0e0e0)",
                    borderRadius: 6,
                    marginBottom: "0.5rem",
                    background: editing?.id === p.id ? "rgba(19,95,150,0.08)" : "transparent"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{p.name}</strong>
                      <div style={{ fontSize: "0.85rem", color: "var(--color-muted, #666)" }}>
                        {[p.street, p.city].filter(Boolean).join(", ")}
                      </div>
                      {p.email && <div style={{ fontSize: "0.85rem" }}>{p.email}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                      <button type="button" className="btn-secondary" onClick={() => startEdit(p)}>
                        {t("Bearbeiten", "Editar")}
                      </button>
                      <button type="button" className="btn-danger" onClick={() => void handleDelete(p)} disabled={!isOnline}>
                        {t("Löschen", "Eliminar")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>
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

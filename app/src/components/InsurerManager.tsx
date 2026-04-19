import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "../firebase";
import { Language, translate } from "../i18n";
import { InsurerData } from "../types";

interface InsurerManagerProps {
  uid: string;
  isOnline: boolean;
  language: Language;
}

const EMPTY_FORM = { name: "", primaryColor: "#0c2a4d", titleColor: "#12395f" };

export const InsurerManager = ({ uid, isOnline, language }: InsurerManagerProps) => {
  const t = (de: string, es: string) => translate(language, de, es);
  const [insurers, setInsurers] = useState<InsurerData[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "insurers"), (snap) => {
      setInsurers(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<InsurerData, "id">) }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    return unsub;
  }, []);

  const startEdit = (insurer: InsurerData) => {
    setEditingId(insurer.id);
    setForm({ name: insurer.name, primaryColor: insurer.primaryColor, titleColor: insurer.titleColor });
    setLogoFile(null);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setError("");
  };

  const save = async () => {
    if (!isOnline) {
      setError(t("Offline: Speichern nicht möglich.", "Sin conexión: no se puede guardar."));
      return;
    }
    if (!form.name.trim()) {
      setError(t("Name ist erforderlich.", "El nombre es obligatorio."));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let logoPath = "";

      if (logoFile) {
        const ext = logoFile.name.split(".").pop() ?? "png";
        const path = `insurers/${editingId ?? "new_" + Date.now()}/logo.${ext}`;
        const fileRef2 = storageRef(storage, path);
        await uploadBytes(fileRef2, logoFile);
        logoPath = path;
      }

      const saveInsurer = httpsCallable<unknown, { id: string }>(functions, "saveInsurer");
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        primaryColor: form.primaryColor,
        titleColor: form.titleColor,
        active: true
      };
      if (editingId) {
        payload.id = editingId;
      }
      if (logoPath) {
        payload.logoPath = logoPath;
      }

      await saveInsurer(payload);
      setNotice(t("Gespeichert.", "Guardado."));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Fehler beim Speichern.", "Error al guardar."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (insurer: InsurerData) => {
    if (!isOnline) {
      return;
    }
    try {
      await updateDoc(doc(db, "insurers", insurer.id), {
        active: !insurer.active,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Fehler.", "Error."));
    }
  };

  return (
    <section className="stack">
      <article className="card stack">
        <h2>{t("Versicherungsgesellschaften", "Compañías de seguros")}</h2>
        <p>{t("Verwalten Sie die Logos und Farben der Versicherungsgesellschaften. Das Logo wird automatisch in den Bericht eingefügt, wenn die Versicherung ausgewählt wird.", "Gestione los logos y colores de las aseguradoras. El logo se aplica automáticamente al generar el informe.")}</p>
      </article>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <article className="card stack">
        <h3>{editingId ? t("Versicherung bearbeiten", "Editar aseguradora") : t("Neue Versicherung", "Nueva aseguradora")}</h3>

        <label>
          {t("Name", "Nombre")}
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="z.B. SVT, Brasa, Allianz..."
          />
        </label>

        <label>
          {t("Logo hochladen", "Subir logo")}
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="row">
          <label style={{ flex: 1 }}>
            {t("Hauptfarbe", "Color principal")}
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
            />
          </label>
          <label style={{ flex: 1 }}>
            {t("Titelfarbe", "Color título")}
            <input
              type="color"
              value={form.titleColor}
              onChange={(e) => setForm((f) => ({ ...f, titleColor: e.target.value }))}
            />
          </label>
        </div>

        <div className="row">
          <button type="button" onClick={save} disabled={saving || !isOnline}>
            {saving ? t("Speichern...", "Guardando...") : t("Speichern", "Guardar")}
          </button>
          {editingId && (
            <button type="button" className="ghost" onClick={cancelEdit}>
              {t("Abbrechen", "Cancelar")}
            </button>
          )}
        </div>
      </article>

      <article className="card stack">
        <h3>{t("Vorhandene Versicherungen", "Aseguradoras existentes")}</h3>
        {insurers.length === 0 && (
          <p>{t("Noch keine Versicherungen angelegt.", "Todavía no hay aseguradoras.")}</p>
        )}
        <ul className="report-list">
          {insurers.map((ins) => (
            <li key={ins.id} className="report-item-row">
              <div className="report-item">
                <span>
                  <strong>{ins.name}</strong>
                  <small style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: ins.primaryColor, display: "inline-block" }} />
                    {ins.primaryColor}
                  </small>
                  {!ins.active && <small style={{ color: "#999" }}>{t("Inaktiv", "Inactivo")}</small>}
                </span>
                <span className={`status ${ins.active ? "finalized" : "draft"}`}>
                  {ins.active ? t("Aktiv", "Activo") : t("Inaktiv", "Inactivo")}
                </span>
              </div>
              <div className="row">
                <button type="button" className="ghost" onClick={() => startEdit(ins)} disabled={!isOnline}>
                  {t("Bearbeiten", "Editar")}
                </button>
                <button type="button" className="ghost" onClick={() => void toggleActive(ins)} disabled={!isOnline}>
                  {ins.active ? t("Deaktivieren", "Desactivar") : t("Aktivieren", "Activar")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
};

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { Language, translate } from "../i18n";
import { CompanySettings, UserRole } from "../types";

interface CompanySettingsPanelProps {
  uid: string;
  userRole: UserRole;
  isOnline: boolean;
  language: Language;
}

const DEFAULT: CompanySettings = {
  name: "",
  address: "",
  phone: "",
  email: "",
  footerText: "",
  updatedAt: "",
  updatedBy: ""
};

export const CompanySettingsPanel = ({ uid, userRole, isOnline, language }: CompanySettingsPanelProps) => {
  const t = (de: string, es: string) => translate(language, de, es);
  const isAdmin = userRole === "admin" || userRole === "office";
  const [form, setForm] = useState<CompanySettings>(DEFAULT);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getDoc(doc(db, "company", "settings")).then((snap) => {
      if (snap.exists()) {
        setForm({ ...DEFAULT, ...(snap.data() as CompanySettings) });
      }
    }).catch(() => undefined);
  }, []);

  const field = (key: keyof CompanySettings, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!isOnline || !isAdmin) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let logoUrl = form.logoUrl ?? "";
      if (logoFile) {
        const ext = logoFile.name.split(".").pop() ?? "png";
        const path = `company/logo.${ext}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, logoFile);
        logoUrl = await getDownloadURL(fileRef);
      }

      await setDoc(doc(db, "company", "settings"), {
        ...form,
        logoUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: uid
      });
      setNotice(t("Firmendaten gespeichert.", "Datos de empresa guardados."));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Fehler beim Speichern.", "Error al guardar."));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <article className="card stack">
      <h3>{t("Firmendaten", "Datos de empresa")}</h3>
      <p>{t("Diese Daten erscheinen im PDF-Footer aller Berichte.", "Estos datos aparecen en el pie de página de todos los informes.")}</p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <label>
        {t("Firmenname", "Nombre empresa")}
        <input type="text" value={form.name} onChange={(e) => field("name", e.target.value)} />
      </label>

      <label>
        {t("Adresse", "Dirección")}
        <input type="text" value={form.address} onChange={(e) => field("address", e.target.value)} placeholder="Straße, PLZ Ort" />
      </label>

      <div className="row">
        <label style={{ flex: 1 }}>
          {t("Telefon", "Teléfono")}
          <input type="tel" value={form.phone} onChange={(e) => field("phone", e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          {t("E-Mail", "Correo")}
          <input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} />
        </label>
      </div>

      <label>
        {t("PDF-Footer Text (leer = automatisch)", "Texto pie de página PDF (vacío = automático)")}
        <input
          type="text"
          value={form.footerText}
          onChange={(e) => field("footerText", e.target.value)}
          placeholder={t("Wird aus Firmenname + Adresse zusammengestellt", "Se construye desde nombre + dirección")}
        />
      </label>

      <label>
        {t("Firmenlogo", "Logo empresa")}
        <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
      </label>
      {form.logoUrl && (
        <img src={form.logoUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, objectFit: "contain" }} />
      )}

      <button type="button" onClick={save} disabled={saving || !isOnline}>
        {saving ? t("Speichern...", "Guardando...") : t("Firmendaten speichern", "Guardar datos empresa")}
      </button>
    </article>
  );
};

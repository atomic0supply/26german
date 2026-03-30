import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { toIsoString } from "../lib/firestore";
import { ClientData } from "../types";

interface ClientManagerProps {
  uid: string;
  isOnline: boolean;
  language: Language;
}

export const ClientManager = ({ uid, isOnline, language }: ClientManagerProps) => {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [editingClientId, setEditingClientId] = useState("");
  const [editingDraft, setEditingDraft] = useState<{ email: string; phone: string; location: string }>({
    email: "",
    phone: "",
    location: ""
  });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);

  useEffect(() => {
    const clientsQuery = query(collection(db, "clients"), where("createdBy", "==", uid));

    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => {
            const data = item.data();
            return {
              id: item.id,
              email: String(data.email ?? ""),
              phone: String(data.phone ?? ""),
              location: String(data.location ?? ""),
              createdBy: String(data.createdBy ?? uid),
              createdAt: toIsoString(data.createdAt),
              updatedAt: toIsoString(data.updatedAt)
          } satisfies ClientData;
        })
          .sort((left, right) => left.email.localeCompare(right.email, locale));

        setClients(next);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid, locale]);

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isOnline) {
      setError(t("Offline: Kunden können nur online gespeichert werden.", "Sin conexión: solo puedes guardar clientes en línea."));
      return;
    }

    if (!email.trim() || !location.trim()) {
      setError(t("Bitte mindestens E-Mail und Standort ausfüllen.", "Rellena al menos correo y ubicación."));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await addDoc(collection(db, "clients"), {
        email: email.trim(),
        phone: phone.trim(),
        location: location.trim(),
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setEmail("");
      setPhone("");
      setLocation("");
      setNotice(t("Kunde gespeichert.", "Cliente guardado."));
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : t("Kunde konnte nicht gespeichert werden", "No se pudo guardar el cliente");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const saveClient = async (client: ClientData) => {
    if (!isOnline) {
      setError(t("Offline: Kundenbearbeitung ist nur online möglich.", "Sin conexión: editar clientes solo es posible en línea."));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await updateDoc(doc(db, "clients", client.id), {
        email: client.email.trim(),
        phone: client.phone.trim(),
        location: client.location.trim(),
        updatedAt: serverTimestamp()
      });
      setNotice(t("Kunde aktualisiert.", "Cliente actualizado."));
      setEditingClientId("");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : t("Kunde konnte nicht aktualisiert werden", "No se pudo actualizar el cliente");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async (clientId: string) => {
    if (!isOnline) {
      setError(t("Offline: Löschen von Kunden ist nur online möglich.", "Sin conexión: eliminar clientes solo es posible en línea."));
      return;
    }

    const confirmed = window.confirm(t("Kunden wirklich löschen?", "¿Seguro que quieres eliminar este cliente?"));
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await deleteDoc(doc(db, "clients", clientId));
      setNotice(t("Kunde gelöscht.", "Cliente eliminado."));
      if (editingClientId === clientId) {
        setEditingClientId("");
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t("Kunde konnte nicht gelöscht werden", "No se pudo eliminar el cliente");
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const startEditClient = (client: ClientData) => {
    setEditingClientId(client.id);
    setEditingDraft({
      email: client.email,
      phone: client.phone,
      location: client.location
    });
    setError("");
    setNotice("");
  };

  const updateEditingDraft = (key: "email" | "phone" | "location", value: string) => {
    setEditingDraft((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const saveEditingClient = async (client: ClientData) => {
    await saveClient({
      ...client,
      email: editingDraft.email,
      phone: editingDraft.phone,
      location: editingDraft.location
    });
  };

  return (
    <section className="card stack">
      <h2>{t("Kundenverwaltung", "Gestión de clientes")}</h2>
      <p>
        {t(
          "E-Mail, Telefon und Standort speichern, damit der PDF-Bericht an den richtigen Kunden gesendet werden kann.",
          "Guarda correo, teléfono y ubicación para enviar el PDF al cliente correcto."
        )}
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <form className="stack" onSubmit={createClient}>
        <div className="grid three">
          <label>
            {t("E-Mail", "Correo")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("kunde@beispiel.de", "cliente@ejemplo.com")}
              required
            />
          </label>

          <label>
            {t("Telefon", "Teléfono")}
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+34 ..."
            />
          </label>

          <label>
            {t("Standort", "Ubicación")}
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t("Straße / Stadt", "Calle / Ciudad")}
              required
            />
          </label>
        </div>

        <button type="submit" disabled={saving || !isOnline}>
          {saving ? t("Speichere...", "Guardando...") : t("Kunde hinzufügen", "Añadir cliente")}
        </button>
      </form>

      {loading && <p>{t("Lade Kunden...", "Cargando clientes...")}</p>}
      {!loading && clients.length === 0 && <p>{t("Noch keine Kunden gespeichert.", "Todavía no hay clientes guardados.")}</p>}

      {clients.map((client) => (
        <div className="client-row" key={client.id}>
          {editingClientId === client.id ? (
            <>
              <label>
                {t("E-Mail", "Correo")}
                <input
                  type="email"
                  value={editingDraft.email}
                  onChange={(event) => updateEditingDraft("email", event.target.value)}
                />
              </label>

              <label>
                {t("Telefon", "Teléfono")}
                <input
                  value={editingDraft.phone}
                  onChange={(event) => updateEditingDraft("phone", event.target.value)}
                />
              </label>

              <label>
                {t("Standort", "Ubicación")}
                <input
                  value={editingDraft.location}
                  onChange={(event) => updateEditingDraft("location", event.target.value)}
                />
              </label>

              <div className="row">
                <button type="button" className="ghost" disabled={saving || !isOnline} onClick={() => void saveEditingClient(client)}>
                  {t("Speichern", "Guardar")}
                </button>
                <button type="button" className="ghost" disabled={saving} onClick={() => setEditingClientId("")}>
                  {t("Abbrechen", "Cancelar")}
                </button>
                <button type="button" disabled={saving || !isOnline} onClick={() => void removeClient(client.id)}>
                  {t("Löschen", "Eliminar")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="client-summary">
                <p><strong>{t("E-Mail", "Correo")}:</strong> {client.email || "-"}</p>
                <p><strong>{t("Telefon", "Teléfono")}:</strong> {client.phone || "-"}</p>
                <p><strong>{t("Standort", "Ubicación")}:</strong> {client.location || "-"}</p>
              </div>

              <div className="row">
                <button type="button" className="ghost" onClick={() => startEditClient(client)}>
                  {t("Bearbeiten", "Editar")}
                </button>
                <button type="button" disabled={saving || !isOnline} onClick={() => void removeClient(client.id)}>
                  {t("Löschen", "Eliminar")}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </section>
  );
};

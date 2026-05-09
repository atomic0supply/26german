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

const MapIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1.2em" height="1.2em" style={{ verticalAlign: "middle" }}>
    <path d="M12 21.5c-3-4-8-9.5-8-14a8 8 0 1 1 16 0c0 4.5-5 10-8 14z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

interface ClientManagerProps {
  uid: string;
  isOnline: boolean;
  language: Language;
}

export const ClientManager = ({ uid, isOnline, language }: ClientManagerProps) => {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [editingClientId, setEditingClientId] = useState("");
  const [editingDraft, setEditingDraft] = useState<{
    name: string;
    surname: string;
    principalContact: string;
    email: string;
    phone: string;
    street: string;
    streetNumber: string;
    postalCode: string;
    city: string;
  }>({
    name: "",
    surname: "",
    principalContact: "",
    email: "",
    phone: "",
    street: "",
    streetNumber: "",
    postalCode: "",
    city: ""
  });
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [principalContact, setPrincipalContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
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
              name: String(data.name ?? ""),
              surname: String(data.surname ?? ""),
              principalContact: String(data.principalContact ?? ""),
              email: String(data.email ?? ""),
              phone: String(data.phone ?? ""),
              location: String(data.location ?? ""),
              street: String(data.street ?? ""),
              streetNumber: String(data.streetNumber ?? ""),
              postalCode: String(data.postalCode ?? ""),
              city: String(data.city ?? ""),
              createdBy: String(data.createdBy ?? uid),
              createdAt: toIsoString(data.createdAt),
              updatedAt: toIsoString(data.updatedAt)
          } satisfies ClientData;
        })
          .sort((left, right) => `${left.name} ${left.surname}`.localeCompare(`${right.name} ${right.surname}`, locale));

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

    if (!name.trim() || !surname.trim() || !principalContact.trim() || !email.trim() || !phone.trim() || !street.trim() || !city.trim()) {
      setError(
        t(
          "Bitte Name, Nachname, Hauptkontakt, E-Mail, Telefon und Adresse (Straße, Stadt) ausfüllen.",
          "Completa nombre, apellido, contacto principal, correo, teléfono y dirección (calle, ciudad)."
        )
      );
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const computedLocation = `${street.trim()} ${streetNumber.trim()}`.trim() + `, ${postalCode.trim()} ${city.trim()}`.trim();

    try {
      await addDoc(collection(db, "clients"), {
        name: name.trim(),
        surname: surname.trim(),
        principalContact: principalContact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        street: street.trim(),
        streetNumber: streetNumber.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        location: computedLocation,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setName("");
      setSurname("");
      setPrincipalContact("");
      setEmail("");
      setPhone("");
      setStreet("");
      setStreetNumber("");
      setPostalCode("");
      setCity("");
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
      const computedLocation = `${client.street?.trim() || ""} ${client.streetNumber?.trim() || ""}`.trim() + `, ${client.postalCode?.trim() || ""} ${client.city?.trim() || ""}`.trim();

      await updateDoc(doc(db, "clients", client.id), {
        name: client.name.trim(),
        surname: client.surname.trim(),
        principalContact: client.principalContact.trim(),
        email: client.email.trim(),
        phone: client.phone.trim(),
        street: client.street?.trim() || "",
        streetNumber: client.streetNumber?.trim() || "",
        postalCode: client.postalCode?.trim() || "",
        city: client.city?.trim() || "",
        location: computedLocation,
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
      name: client.name,
      surname: client.surname,
      principalContact: client.principalContact,
      email: client.email,
      phone: client.phone,
      street: client.street || "",
      streetNumber: client.streetNumber || "",
      postalCode: client.postalCode || "",
      city: client.city || ""
    });
    setError("");
    setNotice("");
  };

  const updateEditingDraft = (
    key: "name" | "surname" | "principalContact" | "email" | "phone" | "street" | "streetNumber" | "postalCode" | "city",
    value: string
  ) => {
    setEditingDraft((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const saveEditingClient = async (client: ClientData) => {
    await saveClient({
      ...client,
      name: editingDraft.name,
      surname: editingDraft.surname,
      principalContact: editingDraft.principalContact,
      email: editingDraft.email,
      phone: editingDraft.phone,
      street: editingDraft.street,
      streetNumber: editingDraft.streetNumber,
      postalCode: editingDraft.postalCode,
      city: editingDraft.city
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
            {t("Name", "Nombre")}
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label>
            {t("Nachname", "Apellido")}
            <input value={surname} onChange={(event) => setSurname(event.target.value)} required />
          </label>

          <label>
            {t("Hauptkontakt", "Contacto principal")}
            <input value={principalContact} onChange={(event) => setPrincipalContact(event.target.value)} required />
          </label>

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
            {t("Straße", "Calle")}
            <input
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              placeholder={t("Musterstraße", "Calle Principal")}
              required
            />
          </label>

          <label>
            {t("Hausnummer", "Número")}
            <input
              value={streetNumber}
              onChange={(event) => setStreetNumber(event.target.value)}
              placeholder="123"
              required
            />
          </label>

          <label>
            {t("PLZ", "Código Postal")}
            <input
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              placeholder="28001"
              required
            />
          </label>

          <label>
            {t("Stadt", "Ciudad")}
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder={t("Berlin", "Madrid")}
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
                {t("Name", "Nombre")}
                <input
                  value={editingDraft.name}
                  onChange={(event) => updateEditingDraft("name", event.target.value)}
                />
              </label>

              <label>
                {t("Nachname", "Apellido")}
                <input
                  value={editingDraft.surname}
                  onChange={(event) => updateEditingDraft("surname", event.target.value)}
                />
              </label>

              <label>
                {t("Hauptkontakt", "Contacto principal")}
                <input
                  value={editingDraft.principalContact}
                  onChange={(event) => updateEditingDraft("principalContact", event.target.value)}
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
                {t("Straße", "Calle")}
                <input
                  value={editingDraft.street}
                  onChange={(event) => updateEditingDraft("street", event.target.value)}
                />
              </label>
              
              <label>
                {t("Hausnummer", "Número")}
                <input
                  value={editingDraft.streetNumber}
                  onChange={(event) => updateEditingDraft("streetNumber", event.target.value)}
                />
              </label>

              <label>
                {t("PLZ", "Código Postal")}
                <input
                  value={editingDraft.postalCode}
                  onChange={(event) => updateEditingDraft("postalCode", event.target.value)}
                />
              </label>

              <label>
                {t("Stadt", "Ciudad")}
                <input
                  value={editingDraft.city}
                  onChange={(event) => updateEditingDraft("city", event.target.value)}
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
                <p><strong>{t("Name", "Nombre")}:</strong> {[client.name, client.surname].filter(Boolean).join(" ") || "-"}</p>
                <p><strong>{t("Hauptkontakt", "Contacto principal")}:</strong> {client.principalContact || "-"}</p>
                <p><strong>{t("E-Mail", "Correo")}:</strong> {client.email || "-"}</p>
                <p><strong>{t("Telefon", "Teléfono")}:</strong> {client.phone || "-"}</p>
                <p>
                  <strong>{t("Standort", "Ubicación")}:</strong> {client.location || "-"}
                  {client.location && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(client.location)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("Ver en el mapa", "Auf der Karte anzeigen")}
                      title={t("Ver en el mapa", "Auf der Karte anzeigen")}
                      style={{ marginLeft: "0.5rem", color: "inherit", opacity: 0.7, textDecoration: "none" }}
                    >
                      <MapIcon />
                    </a>
                  )}
                </p>
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

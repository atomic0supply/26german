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
import { toIsoString } from "../lib/firestore";
import { ClientData } from "../types";

interface ClientManagerProps {
  uid: string;
  isOnline: boolean;
}

export const ClientManager = ({ uid, isOnline }: ClientManagerProps) => {
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
          .sort((left, right) => left.email.localeCompare(right.email, "de"));

        setClients(next);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isOnline) {
      setError("Offline: Kunden können nur online gespeichert werden.");
      return;
    }

    if (!email.trim() || !location.trim()) {
      setError("Bitte mindestens E-Mail und Standort ausfüllen.");
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
      setNotice("Kunde gespeichert.");
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Kunde konnte nicht gespeichert werden";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const saveClient = async (client: ClientData) => {
    if (!isOnline) {
      setError("Offline: Kundenbearbeitung ist nur online möglich.");
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
      setNotice("Kunde aktualisiert.");
      setEditingClientId("");
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Kunde konnte nicht aktualisiert werden";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async (clientId: string) => {
    if (!isOnline) {
      setError("Offline: Löschen von Kunden ist nur online möglich.");
      return;
    }

    const confirmed = window.confirm("Kunden wirklich löschen?");
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await deleteDoc(doc(db, "clients", clientId));
      setNotice("Kunde gelöscht.");
      if (editingClientId === clientId) {
        setEditingClientId("");
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Kunde konnte nicht gelöscht werden";
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
      <h2>Kundenverwaltung</h2>
      <p>E-Mail, Telefon und Standort speichern, damit der PDF-Bericht an den richtigen Kunden gesendet werden kann.</p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <form className="stack" onSubmit={createClient}>
        <div className="grid three">
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="kunde@beispiel.de"
              required
            />
          </label>

          <label>
            Telefon
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+34 ..."
            />
          </label>

          <label>
            Standort
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Straße / Stadt"
              required
            />
          </label>
        </div>

        <button type="submit" disabled={saving || !isOnline}>
          {saving ? "Speichere..." : "Kunde hinzufügen"}
        </button>
      </form>

      {loading && <p>Lade Kunden...</p>}
      {!loading && clients.length === 0 && <p>Noch keine Kunden gespeichert.</p>}

      {clients.map((client) => (
        <div className="client-row" key={client.id}>
          {editingClientId === client.id ? (
            <>
              <label>
                E-Mail
                <input
                  type="email"
                  value={editingDraft.email}
                  onChange={(event) => updateEditingDraft("email", event.target.value)}
                />
              </label>

              <label>
                Telefon
                <input
                  value={editingDraft.phone}
                  onChange={(event) => updateEditingDraft("phone", event.target.value)}
                />
              </label>

              <label>
                Standort
                <input
                  value={editingDraft.location}
                  onChange={(event) => updateEditingDraft("location", event.target.value)}
                />
              </label>

              <div className="row">
                <button type="button" className="ghost" disabled={saving || !isOnline} onClick={() => void saveEditingClient(client)}>
                  Speichern
                </button>
                <button type="button" className="ghost" disabled={saving} onClick={() => setEditingClientId("")}>
                  Abbrechen
                </button>
                <button type="button" disabled={saving || !isOnline} onClick={() => void removeClient(client.id)}>
                  Löschen
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="client-summary">
                <p><strong>E-Mail:</strong> {client.email || "-"}</p>
                <p><strong>Telefon:</strong> {client.phone || "-"}</p>
                <p><strong>Standort:</strong> {client.location || "-"}</p>
              </div>

              <div className="row">
                <button type="button" className="ghost" onClick={() => startEditClient(client)}>
                  Bearbeiten
                </button>
                <button type="button" disabled={saving || !isOnline} onClick={() => void removeClient(client.id)}>
                  Löschen
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </section>
  );
};

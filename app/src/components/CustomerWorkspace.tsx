import { FormEvent, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { ClientData, ReportListItem } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface CustomerWorkspaceProps {
  clients: ClientData[];
  reports: ReportListItem[];
  uid: string;
  isOnline: boolean;
  language: Language;
}

const EMPTY_FORM = {
  name: "",
  surname: "",
  principalContact: "",
  email: "",
  phone: "",
  location: ""
};

const getClientFullName = (client: Pick<ClientData, "name" | "surname">) =>
  [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");

export const CustomerWorkspace = ({ clients, reports, uid, isOnline, language }: CustomerWorkspaceProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<ClientData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (!normalized) {
        return true;
      }
      return [
        client.name,
        client.surname,
        client.principalContact,
        client.email,
        client.phone,
        client.location
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [clients, query]);

  const reportCountByClientId = useMemo(
    () =>
      reports.reduce<Record<string, number>>((acc, report) => {
        if (report.clientId) {
          acc[report.clientId] = (acc[report.clientId] ?? 0) + 1;
        }
        return acc;
      }, {}),
    [reports]
  );

  const selectedClient = filteredClients.find((client) => client.id === selectedClientId) ?? filteredClients[0] ?? null;
  const relatedReports = reports
    .filter((report) => report.clientId && report.clientId === selectedClient?.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const resetForm = () => {
    setDraft(EMPTY_FORM);
    setEditing(null);
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOnline) {
      setError(t("Sin conexión: no se pueden guardar clientes.", "Offline: Kunden können nicht gespeichert werden."));
      return;
    }
    if (
      !draft.name.trim()
      || !draft.surname.trim()
      || !draft.principalContact.trim()
      || !draft.email.trim()
      || !draft.phone.trim()
      || !draft.location.trim()
    ) {
      setError(
        t(
          "Nombre, apellido, contacto principal, correo, teléfono y ubicación son obligatorios.",
          "Name, Nachname, Hauptkontakt, E-Mail, Telefon und Standort sind erforderlich."
        )
      );
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editing) {
        await updateDoc(doc(db, "clients", editing.id), {
          name: draft.name.trim(),
          surname: draft.surname.trim(),
          principalContact: draft.principalContact.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          location: draft.location.trim(),
          updatedAt: serverTimestamp()
        });
        setNotice(t("Cliente actualizado.", "Kunde aktualisiert."));
      } else {
        await addDoc(collection(db, "clients"), {
          name: draft.name.trim(),
          surname: draft.surname.trim(),
          principalContact: draft.principalContact.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          location: draft.location.trim(),
          createdBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setNotice(t("Cliente creado.", "Kunde angelegt."));
      }
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("No se pudo guardar el cliente.", "Kunde konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (client: ClientData) => {
    setEditing(client);
    setDraft({
      name: client.name,
      surname: client.surname,
      principalContact: client.principalContact,
      email: client.email,
      phone: client.phone,
      location: client.location
    });
    setSelectedClientId(client.id);
    setError("");
    setNotice("");
  };

  const removeClient = async (client: ClientData) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede eliminar.", "Offline: Löschen ist nicht möglich."));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await deleteDoc(doc(db, "clients", client.id));
      setNotice(t("Cliente eliminado.", "Kunde gelöscht."));
      if (selectedClientId === client.id) {
        setSelectedClientId("");
      }
      if (editing?.id === client.id) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("No se pudo eliminar el cliente.", "Kunde konnte nicht gelöscht werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="customer-workspace">
      <SectionCard
        title={t("Clientes", "Kunden")}
        eyebrow={t("CRM", "CRM")}
        description={t("Busca, edita y revisa el historial desde una sola vista.", "Suchen, pflegen und Historie aus einer Ansicht prüfen.")}
      >
        <div className="customer-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "Buscar por nombre, contacto, correo, teléfono o ubicación",
              "Nach Name, Kontakt, E-Mail, Telefon oder Standort suchen"
            )}
          />
          <StatusChip tone="info">{t(`${filteredClients.length} cliente(s)`, `${filteredClients.length} Kunde(n)`)}</StatusChip>
        </div>

        <div className="customer-grid">
          <div className="customer-list">
            {filteredClients.length === 0 ? (
              <EmptyState
                title={t("Sin coincidencias", "Keine Treffer")}
                description={t("Ajusta la búsqueda o crea un cliente nuevo.", "Suche anpassen oder neuen Kunden anlegen.")}
              />
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className={selectedClient?.id === client.id ? "customer-list__item active" : "customer-list__item"}
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <div className="customer-list__item-top">
                    <strong>{getClientFullName(client) || client.location}</strong>
                    <StatusChip tone="neutral">
                      {t(`${reportCountByClientId[client.id] ?? 0} informe(s)`, `${reportCountByClientId[client.id] ?? 0} Bericht(e)`)}
                    </StatusChip>
                  </div>
                  <span>{client.principalContact || client.email || "-"}</span>
                  <small>{client.location || t("Sin ubicación", "Kein Standort")}</small>
                </button>
              ))
            )}
          </div>

          <div className="customer-detail">
            {selectedClient ? (
              <>
                <div className="customer-detail__hero">
                  <div>
                    <span className="section-card__eyebrow">{t("Ficha viva", "Lebendige Karte")}</span>
                    <h3>{getClientFullName(selectedClient) || selectedClient.email}</h3>
                    <p>{selectedClient.location}</p>
                    <div className="customer-detail__badges">
                      <StatusChip tone="info">{selectedClient.principalContact || t("Sin contacto", "Kein Kontakt")}</StatusChip>
                      <StatusChip tone="neutral">{t(`${relatedReports.length} informe(s)`, `${relatedReports.length} Bericht(e)`)}</StatusChip>
                    </div>
                  </div>
                  <div className="row">
                    <button type="button" className="ghost" onClick={() => startEdit(selectedClient)}>
                      {t("Editar", "Bearbeiten")}
                    </button>
                    <button type="button" disabled={saving} onClick={() => void removeClient(selectedClient)}>
                      {t("Eliminar", "Löschen")}
                    </button>
                  </div>
                </div>

                <div className="metric-grid metric-grid--compact">
                  <article className="metric-card">
                    <span>{t("Contacto principal", "Hauptkontakt")}</span>
                    <strong>{selectedClient.principalContact || "-"}</strong>
                  </article>
                  <article className="metric-card">
                    <span>{t("Correo", "E-Mail")}</span>
                    <strong>{selectedClient.email || "-"}</strong>
                  </article>
                  <article className="metric-card">
                    <span>{t("Teléfono", "Telefon")}</span>
                    <strong>{selectedClient.phone || "-"}</strong>
                  </article>
                  <article className="metric-card">
                    <span>{t("Informes asociados", "Verknüpfte Berichte")}</span>
                    <strong>{relatedReports.length}</strong>
                  </article>
                  <article className="metric-card">
                    <span>{t("Último movimiento", "Letzte Aktivität")}</span>
                    <strong>{new Date(selectedClient.updatedAt).toLocaleDateString(locale)}</strong>
                  </article>
                </div>

                <div className="customer-quick-actions">
                  {selectedClient.email ? (
                    <a className="ghost button-link" href={`mailto:${selectedClient.email}`}>
                      {t("Escribir correo", "E-Mail schreiben")}
                    </a>
                  ) : (
                    <button type="button" className="ghost" disabled>
                      {t("Correo pendiente", "E-Mail fehlt")}
                    </button>
                  )}
                  {selectedClient.phone ? (
                    <a className="ghost button-link" href={`tel:${selectedClient.phone}`}>
                      {t("Llamar", "Anrufen")}
                    </a>
                  ) : (
                    <button type="button" className="ghost" disabled>
                      {t("Teléfono pendiente", "Telefon fehlt")}
                    </button>
                  )}
                  <button type="button" className="ghost" onClick={() => startEdit(selectedClient)}>
                    {t("Actualizar ficha", "Karte bearbeiten")}
                  </button>
                </div>

                <div className="timeline-list">
                  {relatedReports.length === 0 ? (
                    <EmptyState
                      title={t("Sin historial todavía", "Noch keine Historie")}
                      description={t("Cuando se asocien informes al cliente aparecerán aquí.", "Sobald Berichte dem Kunden zugeordnet sind, erscheinen sie hier.")}
                    />
                  ) : (
                    relatedReports.slice(0, 4).map((report) => (
                      <div key={report.id} className="timeline-item timeline-item--static">
                        <div>
                          <strong>{report.projectNumber}</strong>
                          <p>{report.objectLabel}</p>
                        </div>
                        <div className="timeline-item__meta">
                          <StatusChip tone={report.status === "finalized" ? "success" : "warning"}>
                            {report.status === "finalized" ? t("Final", "Final") : t("Borrador", "Entwurf")}
                          </StatusChip>
                          <small>{new Date(report.updatedAt).toLocaleString(locale)}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                title={t("Selecciona un cliente", "Kunden auswählen")}
                description={t("La ficha detallada y el historial aparecerán aquí.", "Die Detailkarte und Historie erscheinen hier.")}
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={editing ? t("Actualizar cliente", "Kunden aktualisieren") : t("Nuevo cliente", "Neuer Kunde")}
        eyebrow={t("Edición rápida", "Schnellpflege")}
        description={t("Alta o edición rápida sin salir del workspace.", "Schnelles Anlegen oder Bearbeiten ohne Workspace-Wechsel.")}
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <form className="stack" onSubmit={submitClient}>
          <div className="grid three">
            <label>
              {t("Nombre", "Vorname")}
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              {t("Apellido", "Nachname")}
              <input value={draft.surname} onChange={(event) => setDraft((current) => ({ ...current, surname: event.target.value }))} />
            </label>
            <label>
              {t("Contacto principal", "Hauptkontakt")}
              <input
                value={draft.principalContact}
                onChange={(event) => setDraft((current) => ({ ...current, principalContact: event.target.value }))}
              />
            </label>
            <label>
              {t("Correo", "E-Mail")}
              <input value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              {t("Teléfono", "Telefon")}
              <input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              {t("Dirección / ubicación", "Adresse / Standort")}
              <input value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
            </label>
          </div>
          <div className="row">
            <button type="submit" disabled={saving || !isOnline}>
              {editing ? t("Guardar cambios", "Änderungen speichern") : t("Crear cliente", "Kunden anlegen")}
            </button>
            {editing && (
              <button type="button" className="ghost" onClick={resetForm}>
                {t("Cancelar edición", "Bearbeiten abbrechen")}
              </button>
            )}
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

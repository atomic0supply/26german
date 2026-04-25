import { FormEvent, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db, functions } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { createDefaultReport } from "../lib/defaultReport";
import {
  canOpenPdfForReport,
  canSendReportEmail,
  ClientWorkspaceTab,
  getClientFullName,
  getClientLastActivity,
  getClientPrimaryLabel,
  getClientReports,
  getReportCountByClientId,
  getVisitCountByClientId,
  searchClients,
  splitClientVisits
} from "../lib/customerWorkspace";
import { ClientData, ReportListItem } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { Dialog } from "./ui/Dialog";
import { IconButton } from "./ui/IconButton";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface CustomerWorkspaceProps {
  clients: ClientData[];
  reports: ReportListItem[];
  uid: string;
  isOnline: boolean;
  language: Language;
  currentUserLabel?: string;
  currentUserEmail?: string;
  onOpenReport?: (reportId: string) => void;
}

type ClientDraft = {
  name: string;
  surname: string;
  principalContact: string;
  email: string;
  phone: string;
  location: string;
};

type VisitDraft = {
  clientId: string;
  date: string;
  time: string;
  durationMinutes: string;
};

const EMPTY_CLIENT_FORM: ClientDraft = {
  name: "",
  surname: "",
  principalContact: "",
  email: "",
  phone: "",
  location: ""
};

const createVisitDraft = (clientId = ""): VisitDraft => ({
  clientId,
  date: new Date().toISOString().slice(0, 10),
  time: "09:00",
  durationMinutes: "60"
});

const formatDateTime = (value: string, locale: string) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  });
};

const formatDate = (value: string, locale: string) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(locale, {
    dateStyle: "medium"
  });
};

const getClientInitials = (client: ClientData) =>
  [client.name, client.surname]
    .map((value) => value.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join("")
    .slice(0, 2) || "CL";

const MailIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 6.5h16v11H4z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m5.5 8 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8.2 4.8c.5-.5 1.3-.6 1.9-.1l2 1.5c.6.5.8 1.3.4 2l-.8 1.5c1 1.9 2.6 3.5 4.5 4.5l1.5-.8c.7-.4 1.5-.2 2 .4l1.5 2c.5.6.4 1.4-.1 1.9l-1.4 1.4c-.7.7-1.8 1-2.8.7-2.8-.8-5.4-2.3-7.6-4.5s-3.7-4.8-4.5-7.6c-.3-1 .1-2.1.7-2.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.5v4M17 3.5v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="4" y="5.5" width="16" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 10.5h16" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ReportsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 3.5v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m4 20 4.3-.8L18 9.5 14.5 6 4.8 15.7 4 20Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m12.8 7.7 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 7h13M9 7V4.5h6V7M8 10v7M12 10v7M16 10v7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M6.5 7 7.2 19a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4L17.5 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 3.5v4h4M8.5 15h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8.5 18h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12 20 4l-4 16-4.8-6.2L4 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M20 4 11.2 13.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15.5 5.5 9 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SummaryMetric = ({ label, value }: { label: string; value: string | number }) => (
  <article className="crm-metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);

const DetailTab = ({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button type="button" className={active ? "crm-tab active" : "crm-tab"} onClick={onClick}>
    {label}
  </button>
);

export const CustomerWorkspace = ({
  clients,
  reports,
  uid,
  isOnline,
  language,
  currentUserLabel,
  currentUserEmail,
  onOpenReport
}: CustomerWorkspaceProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const userLabel = currentUserLabel?.trim() || "User";
  const userEmail = currentUserEmail?.trim() || "";

  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [activeTab, setActiveTab] = useState<ClientWorkspaceTab>("summary");
  const [clientModalMode, setClientModalMode] = useState<"create" | "edit" | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ClientData | null>(null);
  const [visitClient, setVisitClient] = useState<ClientData | null>(null);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(EMPTY_CLIENT_FORM);
  const [visitDraft, setVisitDraft] = useState<VisitDraft>(createVisitDraft());
  const [saving, setSaving] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [sendingReportId, setSendingReportId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredClients = useMemo(() => searchClients(clients, query), [clients, query]);
  const reportCountByClientId = useMemo(() => getReportCountByClientId(reports), [reports]);
  const visitCountByClientId = useMemo(() => getVisitCountByClientId(reports), [reports]);
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );
  const relatedReports = useMemo(
    () => getClientReports(reports, selectedClient?.id),
    [reports, selectedClient?.id]
  );
  const { past: completedVisits, upcoming: upcomingVisits } = useMemo(
    () => splitClientVisits(relatedReports, new Date().toISOString()),
    [relatedReports]
  );

  const clientsWithReports = useMemo(
    () => clients.filter((client) => (reportCountByClientId[client.id] ?? 0) > 0).length,
    [clients, reportCountByClientId]
  );
  const finalizedReports = useMemo(
    () => reports.filter((report) => report.status === "finalized").length,
    [reports]
  );

  useEffect(() => {
    if (selectedClientId && !selectedClient) {
      setSelectedClientId("");
    }
  }, [selectedClient, selectedClientId]);

  const resetClientModal = () => {
    setClientModalMode(null);
    setClientDraft(EMPTY_CLIENT_FORM);
  };

  const openCreateClientModal = () => {
    setClientDraft(EMPTY_CLIENT_FORM);
    setClientModalMode("create");
    setError("");
  };

  const openEditClientModal = (client: ClientData) => {
    setClientDraft({
      name: client.name,
      surname: client.surname,
      principalContact: client.principalContact,
      email: client.email,
      phone: client.phone,
      location: client.location
    });
    setSelectedClientId(client.id);
    setClientModalMode("edit");
    setError("");
  };

  const openVisitModal = (client: ClientData) => {
    setVisitClient(client);
    setVisitDraft(createVisitDraft(client.id));
    setError("");
  };

  const closeVisitModal = () => {
    setVisitClient(null);
    setVisitDraft(createVisitDraft());
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isOnline) {
      setError(t("Sin conexión: no se pueden guardar clientes.", "Offline: Kunden können nicht gespeichert werden."));
      return;
    }

    if (
      !clientDraft.name.trim()
      || !clientDraft.surname.trim()
      || !clientDraft.principalContact.trim()
      || !clientDraft.email.trim()
      || !clientDraft.phone.trim()
      || !clientDraft.location.trim()
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
      if (clientModalMode === "edit" && selectedClient) {
        await updateDoc(doc(db, "clients", selectedClient.id), {
          name: clientDraft.name.trim(),
          surname: clientDraft.surname.trim(),
          principalContact: clientDraft.principalContact.trim(),
          email: clientDraft.email.trim(),
          phone: clientDraft.phone.trim(),
          location: clientDraft.location.trim(),
          updatedAt: serverTimestamp()
        });
        setNotice(t("Cliente actualizado.", "Kunde aktualisiert."));
      } else {
        const docRef = await addDoc(collection(db, "clients"), {
          name: clientDraft.name.trim(),
          surname: clientDraft.surname.trim(),
          principalContact: clientDraft.principalContact.trim(),
          email: clientDraft.email.trim(),
          phone: clientDraft.phone.trim(),
          location: clientDraft.location.trim(),
          createdBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setSelectedClientId(docRef.id);
        setActiveTab("summary");
        setNotice(t("Cliente creado.", "Kunde angelegt."));
      }

      resetClientModal();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("No se pudo guardar el cliente.", "Kunde konnte nicht gespeichert werden.")
      );
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async () => {
    if (!deleteCandidate) {
      return;
    }

    if (!isOnline) {
      setError(t("Sin conexión: no se puede eliminar.", "Offline: Löschen ist nicht möglich."));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await deleteDoc(doc(db, "clients", deleteCandidate.id));
      setNotice(t("Cliente eliminado.", "Kunde gelöscht."));
      if (selectedClientId === deleteCandidate.id) {
        setSelectedClientId("");
      }
      setDeleteCandidate(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("No se pudo eliminar el cliente.", "Kunde konnte nicht gelöscht werden.")
      );
    } finally {
      setSaving(false);
    }
  };

  const createVisit = async () => {
    if (!visitClient) {
      return;
    }

    if (!isOnline) {
      setError(t("Sin conexión: no se pueden crear visitas.", "Offline: Einsätze können nicht erstellt werden."));
      return;
    }

    if (!visitDraft.date || !visitDraft.time) {
      setError(t("Fecha y hora son obligatorias para la visita.", "Datum und Uhrzeit sind für den Einsatz erforderlich."));
      return;
    }

    const appointmentDate = `${visitDraft.date}T${visitDraft.time}`;
    const projectNumber = `VIS-${visitDraft.date.replaceAll("-", "")}-${visitDraft.time.replace(":", "")}`;
    const clientFullName = getClientFullName(visitClient) || visitClient.principalContact || visitClient.location;

    setCreatingVisit(true);
    setError("");
    setNotice("");

    try {
      const payload = createDefaultReport(uid);
      const docRef = await addDoc(collection(db, "reports"), {
        ...payload,
        clientId: visitClient.id,
        createdByEmail: userEmail,
        createdByName: userLabel,
        projectInfo: {
          ...payload.projectInfo,
          projectNumber,
          appointmentDate,
          technicianName: userLabel,
          firstReportBy: visitClient.principalContact,
          locationObject: visitClient.location
        },
        contacts: {
          ...payload.contacts,
          name1: clientFullName,
          name2: visitClient.principalContact,
          street1: visitClient.location,
          phone1: visitClient.phone,
          email: visitClient.email
        },
        signature: {
          ...payload.signature,
          technicianName: userLabel
        },
        templateFields: {
          ...payload.templateFields,
          visitDurationMinutes: visitDraft.durationMinutes || "60",
          visitNotificationRecipient: visitClient.email,
          visitClientId: visitClient.id,
          visitClientName: clientFullName,
          visitClientContact: visitClient.principalContact,
          visitClientPhone: visitClient.phone,
          visitClientLocation: visitClient.location
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNotice(t("Visita creada y vinculada al cliente.", "Einsatz erstellt und dem Kunden zugeordnet."));
      closeVisitModal();
      onOpenReport?.(docRef.id);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("No se pudo crear la visita.", "Einsatz konnte nicht erstellt werden.")
      );
    } finally {
      setCreatingVisit(false);
    }
  };

  const sendReportByEmail = async (reportId: string, clientId: string) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede enviar el correo.", "Offline: E-Mail kann nicht gesendet werden."));
      return;
    }

    setSendingReportId(reportId);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<{ reportId: string; clientId: string }, { recipient: string }>(functions, "sendReportEmail");
      const result = await callable({ reportId, clientId });
      setNotice(t(`PDF enviado a ${result.data.recipient}.`, `PDF gesendet an ${result.data.recipient}.`));
    } catch (emailError) {
      setError(
        emailError instanceof Error
          ? emailError.message
          : t("No se pudo enviar el correo.", "E-Mail konnte nicht gesendet werden.")
      );
    } finally {
      setSendingReportId("");
    }
  };

  const renderOverview = () => (
    <SectionCard
      title={t("Clientes", "Kunden")}
      eyebrow={t("CRM Clientes", "Kunden CRM")}
      description={t(
        "Un espacio más claro para abrir fichas, actuar rápido y seguir el historial comercial y técnico.",
        "Ein klarerer Bereich, um Kundenkarten zu öffnen, schnell zu handeln und Vertriebs- sowie Technikverlauf zu verfolgen."
      )}
      actions={
        <button type="button" onClick={openCreateClientModal}>
          <PlusIcon />
          {t("Nuevo cliente", "Neuer Kunde")}
        </button>
      }
    >
      <div className="crm-overview">
        <div className="crm-overview__hero">
          <div className="crm-overview__copy">
            <span className="section-card__eyebrow">{t("Workspace", "Workspace")}</span>
            <h4>{t("Base de clientes con acceso directo a agenda e informes", "Kundenbasis mit Direktzugriff auf Agenda und Berichte")}</h4>
            <p>
              {t(
                "Busca, abre una ficha completa y gestiona el trabajo desde una experiencia más limpia y rápida.",
                "Suche, öffne eine vollständige Karte und steuere die Arbeit aus einer klareren und schnelleren Oberfläche."
              )}
            </p>
          </div>
          <div className="crm-overview__stats">
            <SummaryMetric label={t("Clientes", "Kunden")} value={clients.length} />
            <SummaryMetric label={t("Con informes", "Mit Berichten")} value={clientsWithReports} />
            <SummaryMetric label={t("Informes finales", "Finale Berichte")} value={finalizedReports} />
          </div>
        </div>

        <div className="crm-toolbar">
          <label className="crm-toolbar__search">
            <span>{t("Buscar", "Suchen")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(
                "Buscar por nombre, contacto, correo, teléfono o ubicación",
                "Nach Name, Kontakt, E-Mail, Telefon oder Standort suchen"
              )}
            />
          </label>
          <div className="crm-toolbar__meta">
            <StatusChip tone="info">{t(`${filteredClients.length} visible(s)`, `${filteredClients.length} sichtbar`)}</StatusChip>
            <StatusChip tone="neutral">{t(`${reports.length} informe(s)`, `${reports.length} Bericht(e)`)}</StatusChip>
          </div>
        </div>

        {filteredClients.length === 0 ? (
          <EmptyState
            title={t("No hay clientes para mostrar", "Keine Kunden zum Anzeigen")}
            description={t(
              clients.length === 0
                ? "Empieza creando la primera ficha de cliente."
                : "No hay coincidencias con la búsqueda actual.",
              clients.length === 0
                ? "Beginne mit dem ersten Kundenprofil."
                : "Für die aktuelle Suche gibt es keine Treffer."
            )}
            action={
              <button type="button" onClick={openCreateClientModal}>
                {t("Crear cliente", "Kunde anlegen")}
              </button>
            }
          />
        ) : (
          <div className="crm-card-grid">
            {filteredClients.map((client) => {
              const relatedCount = reportCountByClientId[client.id] ?? 0;
              const visitCount = visitCountByClientId[client.id] ?? 0;
              const lastTouch = getClientLastActivity(client, getClientReports(reports, client.id));
              return (
                <article key={client.id} className="crm-client-card">
                  <div className="crm-client-card__top">
                    <div className="crm-client-card__identity">
                      <span className="crm-client-card__avatar">{getClientInitials(client)}</span>
                      <div>
                        <strong>{getClientPrimaryLabel(client)}</strong>
                        <p>{client.principalContact || client.email || t("Sin contacto", "Kein Kontakt")}</p>
                      </div>
                    </div>
                    <StatusChip tone={visitCount > 0 ? "info" : "neutral"}>
                      {t(`${visitCount} visita(s)`, `${visitCount} Einsatz/Einsätze`)}
                    </StatusChip>
                  </div>

                  <div className="crm-client-card__details">
                    <span>{client.location || t("Sin ubicación", "Kein Standort")}</span>
                    <small>{t("Última actividad", "Letzte Aktivität")}: {formatDate(lastTouch, locale)}</small>
                  </div>

                  <div className="crm-client-card__metrics">
                    <SummaryMetric label={t("Informes", "Berichte")} value={relatedCount} />
                    <SummaryMetric label={t("Agenda", "Agenda")} value={visitCount} />
                  </div>

                  <div className="crm-client-card__actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setActiveTab("summary");
                      }}
                    >
                      {t("Abrir ficha", "Karte öffnen")}
                    </button>
                    <button type="button" className="ghost" onClick={() => openEditClientModal(client)}>
                      <EditIcon />
                      {t("Editar", "Bearbeiten")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );

  const renderSummaryTab = (client: ClientData) => (
    <div className="crm-detail-section">
      <div className="crm-summary-grid">
        <SummaryMetric label={t("Contacto principal", "Hauptkontakt")} value={client.principalContact || "—"} />
        <SummaryMetric label={t("Correo", "E-Mail")} value={client.email || "—"} />
        <SummaryMetric label={t("Teléfono", "Telefon")} value={client.phone || "—"} />
        <SummaryMetric label={t("Informes asignados", "Zugeordnete Berichte")} value={relatedReports.length} />
        <SummaryMetric label={t("Visitas realizadas", "Abgeschlossene Einsätze")} value={completedVisits.length} />
        <SummaryMetric label={t("Último movimiento", "Letzte Aktivität")} value={formatDate(getClientLastActivity(client, relatedReports), locale)} />
      </div>

      <section className="crm-panel">
        <div className="crm-panel__header">
          <div>
            <span className="section-card__eyebrow">{t("Resumen operativo", "Operative Übersicht")}</span>
            <h4>{t("Ficha rápida del cliente", "Schnelle Kundenkarte")}</h4>
          </div>
        </div>
        <div className="crm-info-list">
          <div>
            <span>{t("Ubicación", "Standort")}</span>
            <strong>{client.location || "—"}</strong>
          </div>
          <div>
            <span>{t("Creado", "Angelegt")}</span>
            <strong>{formatDate(client.createdAt, locale)}</strong>
          </div>
          <div>
            <span>{t("Actualizado", "Aktualisiert")}</span>
            <strong>{formatDate(client.updatedAt, locale)}</strong>
          </div>
        </div>
      </section>

      <section className="crm-panel">
        <div className="crm-panel__header">
          <div>
            <span className="section-card__eyebrow">{t("Actividad reciente", "Letzte Aktivität")}</span>
            <h4>{t("Últimos informes vinculados", "Neueste verknüpfte Berichte")}</h4>
          </div>
        </div>
        {relatedReports.length === 0 ? (
          <EmptyState
            title={t("Sin informes todavía", "Noch keine Berichte")}
            description={t(
              "Cuando este cliente tenga informes o visitas vinculadas aparecerán aquí.",
              "Sobald für diesen Kunden Berichte oder Einsätze vorhanden sind, erscheinen sie hier."
            )}
            action={
              <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
                {t("Crear visita", "Einsatz anlegen")}
              </button>
            }
          />
        ) : (
          <div className="crm-mini-report-list">
            {relatedReports.slice(0, 3).map((report) => (
              <button key={report.id} type="button" className="crm-mini-report" onClick={() => onOpenReport?.(report.id)}>
                <div>
                  <strong>{report.projectNumber}</strong>
                  <p>{report.objectLabel}</p>
                </div>
                <small>{formatDateTime(report.updatedAt, locale)}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const renderAgendaTab = (client: ClientData) => (
    <div className="crm-detail-section">
      <section className="crm-panel">
        <div className="crm-panel__header">
          <div>
            <span className="section-card__eyebrow">{t("Timeline", "Timeline")}</span>
            <h4>{t("Visitas realizadas", "Durchgeführte Einsätze")}</h4>
            <p>
              {t(
                "Historial cronológico de visitas e informes ya ejecutados para este cliente.",
                "Chronologischer Verlauf bereits durchgeführter Einsätze und Berichte für diesen Kunden."
              )}
            </p>
          </div>
        </div>

        {completedVisits.length === 0 ? (
          <EmptyState
            title={t("Todavía no hay visitas realizadas", "Noch keine durchgeführten Einsätze")}
            description={t(
              "Las visitas con fecha pasada aparecerán aquí automáticamente.",
              "Einsätze mit vergangenem Datum erscheinen hier automatisch."
            )}
            action={
              <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
                {t("Programar visita", "Einsatz planen")}
              </button>
            }
          />
        ) : (
          <div className="crm-timeline">
            {completedVisits.map((report) => (
              <article key={report.id} className="crm-timeline__item">
                <div className="crm-timeline__dot" aria-hidden="true" />
                <div className="crm-timeline__content">
                  <div className="crm-timeline__top">
                    <div>
                      <strong>{report.projectNumber || t("Visita sin número", "Einsatz ohne Nummer")}</strong>
                      <p>{report.objectLabel || client.location || t("Sin ubicación", "Kein Standort")}</p>
                    </div>
                    <StatusChip tone={report.status === "finalized" ? "success" : "warning"}>
                      {report.status === "finalized" ? t("Final", "Final") : t("Borrador", "Entwurf")}
                    </StatusChip>
                  </div>
                  <div className="crm-timeline__meta">
                    <small>{formatDateTime(report.appointmentDate ?? report.updatedAt, locale)}</small>
                    <small>{report.technicianName || userLabel}</small>
                  </div>
                  <div className="crm-timeline__actions">
                    <button type="button" className="ghost" onClick={() => onOpenReport?.(report.id)}>
                      {t("Abrir informe", "Bericht öffnen")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {upcomingVisits.length > 0 && (
        <section className="crm-panel crm-panel--secondary">
          <div className="crm-panel__header">
            <div>
              <span className="section-card__eyebrow">{t("Próximas", "Bevorstehend")}</span>
              <h4>{t("Visitas programadas", "Geplante Einsätze")}</h4>
            </div>
          </div>
          <div className="crm-upcoming-list">
            {upcomingVisits.map((report) => (
              <div key={report.id} className="crm-upcoming-card">
                <div>
                  <strong>{report.projectNumber}</strong>
                  <p>{formatDateTime(report.appointmentDate ?? report.updatedAt, locale)}</p>
                </div>
                <button type="button" className="ghost" onClick={() => onOpenReport?.(report.id)}>
                  {t("Abrir", "Öffnen")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  const renderReportsTab = (client: ClientData) => (
    <section className="crm-panel">
      <div className="crm-panel__header">
        <div>
          <span className="section-card__eyebrow">{t("Documentación", "Dokumentation")}</span>
          <h4>{t("Informes asignados", "Zugeordnete Berichte")}</h4>
          <p>
            {t(
              "Abre, consulta el PDF final o envía el informe por correo desde la propia ficha.",
              "Berichte direkt aus der Kundenkarte öffnen, das finale PDF ansehen oder per E-Mail versenden."
            )}
          </p>
        </div>
      </div>

      {relatedReports.length === 0 ? (
        <EmptyState
          title={t("No hay informes asignados", "Keine zugeordneten Berichte")}
          description={t(
            "Asigna o crea una visita para empezar a construir el historial documental del cliente.",
            "Lege einen Einsatz an, um die Dokumentationshistorie dieses Kunden zu starten."
          )}
          action={
            <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
              {t("Crear visita", "Einsatz anlegen")}
            </button>
          }
        />
      ) : (
        <div className="crm-report-list">
          {relatedReports.map((report) => {
            const canOpenPdf = canOpenPdfForReport(report);
            const canMail = canSendReportEmail(report, client);

            return (
              <article key={report.id} className="crm-report-card">
                <div className="crm-report-card__copy">
                  <div className="crm-report-card__top">
                    <strong>{report.projectNumber}</strong>
                    <StatusChip tone={report.status === "finalized" ? "success" : "warning"}>
                      {report.status === "finalized" ? t("Final", "Final") : t("Borrador", "Entwurf")}
                    </StatusChip>
                  </div>
                  <p>{report.objectLabel || client.location || t("Sin ubicación", "Kein Standort")}</p>
                  <div className="crm-report-card__meta">
                    <small>{report.technicianName || userLabel}</small>
                    <small>{formatDateTime(report.updatedAt, locale)}</small>
                    {report.finalization?.finalizedAt ? <small>{formatDate(report.finalization.finalizedAt, locale)}</small> : null}
                  </div>
                </div>

                <div className="crm-report-card__actions">
                  <IconButton
                    label={t("Abrir informe", "Bericht öffnen")}
                    icon={<EditIcon />}
                    onClick={() => onOpenReport?.(report.id)}
                  />
                  {canOpenPdf ? (
                    <IconButton
                      label={t("Ver PDF", "PDF ansehen")}
                      icon={<PdfIcon />}
                      href={report.finalization?.pdfUrl ?? ""}
                      target="_blank"
                      rel="noreferrer"
                    />
                  ) : (
                    <IconButton
                      label={t("PDF no disponible", "PDF nicht verfügbar")}
                      icon={<PdfIcon />}
                      disabled
                    />
                  )}
                  <IconButton
                    label={t("Enviar por correo", "Per E-Mail senden")}
                    icon={<SendIcon />}
                    disabled={!canMail || sendingReportId === report.id}
                    onClick={() => void sendReportByEmail(report.id, client.id)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderDetail = (client: ClientData) => (
    <SectionCard
      title={getClientPrimaryLabel(client)}
      eyebrow={t("Ficha de cliente", "Kundenkarte")}
      description={t(
        "Acciones rápidas, historial de agenda e informes dentro de una vista completa.",
        "Schnellaktionen, Einsatzhistorie und Berichte in einer vollständigen Detailansicht."
      )}
      actions={
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setSelectedClientId("");
            setActiveTab("summary");
          }}
        >
          <ArrowLeftIcon />
          {t("Volver al listado", "Zur Liste")}
        </button>
      }
    >
      <div className="crm-detail">
        <div className="crm-detail__topbar">
          <div className="crm-detail__hero">
            <span className="crm-detail__avatar">{getClientInitials(client)}</span>
            <div className="crm-detail__copy">
              <span className="section-card__eyebrow">{t("Cliente activo", "Aktiver Kunde")}</span>
              <h4>{getClientPrimaryLabel(client)}</h4>
              <p>{client.location || t("Sin ubicación", "Kein Standort")}</p>
              <div className="crm-detail__badges">
                <StatusChip tone="info">{t(`${completedVisits.length} visita(s)`, `${completedVisits.length} Einsatz/Einsätze`)}</StatusChip>
                <StatusChip tone="neutral">{t(`${relatedReports.length} informe(s)`, `${relatedReports.length} Bericht(e)`)}</StatusChip>
                <StatusChip tone="neutral">{client.principalContact || t("Sin contacto", "Kein Kontakt")}</StatusChip>
              </div>
            </div>
          </div>

          <div className="crm-detail__actions">
            <button type="button" className="ghost" onClick={() => openEditClientModal(client)}>
              <EditIcon />
              {t("Editar", "Bearbeiten")}
            </button>
            <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
              <CalendarIcon />
              {t("Nueva visita", "Neuer Einsatz")}
            </button>
            <button type="button" className="ghost" onClick={() => setDeleteCandidate(client)} disabled={saving}>
              <TrashIcon />
              {t("Eliminar", "Löschen")}
            </button>
          </div>
        </div>

        <div className="crm-quick-actions">
          {client.email ? (
            <a className="crm-quick-action" href={`mailto:${client.email}`}>
              <MailIcon />
              <span>{t("Escribir correo", "E-Mail schreiben")}</span>
            </a>
          ) : (
            <button type="button" className="crm-quick-action ghost" disabled>
              <MailIcon />
              <span>{t("Correo pendiente", "E-Mail fehlt")}</span>
            </button>
          )}
          {client.phone ? (
            <a className="crm-quick-action" href={`tel:${client.phone}`}>
              <PhoneIcon />
              <span>{t("Llamar", "Anrufen")}</span>
            </a>
          ) : (
            <button type="button" className="crm-quick-action ghost" disabled>
              <PhoneIcon />
              <span>{t("Teléfono pendiente", "Telefon fehlt")}</span>
            </button>
          )}
          <button type="button" className="crm-quick-action ghost" onClick={() => setActiveTab("agenda")}>
            <CalendarIcon />
            <span>{t("Agenda", "Agenda")}</span>
          </button>
          <button type="button" className="crm-quick-action ghost" onClick={() => setActiveTab("reports")}>
            <ReportsIcon />
            <span>{t("Informes", "Berichte")}</span>
          </button>
        </div>

        <div className="crm-tabs" role="tablist" aria-label={t("Secciones del cliente", "Kundenbereiche")}>
          <DetailTab active={activeTab === "summary"} label={t("Resumen", "Übersicht")} onClick={() => setActiveTab("summary")} />
          <DetailTab active={activeTab === "agenda"} label={t("Agenda", "Agenda")} onClick={() => setActiveTab("agenda")} />
          <DetailTab active={activeTab === "reports"} label={t("Informes", "Berichte")} onClick={() => setActiveTab("reports")} />
        </div>

        {activeTab === "summary" && renderSummaryTab(client)}
        {activeTab === "agenda" && renderAgendaTab(client)}
        {activeTab === "reports" && renderReportsTab(client)}
      </div>
    </SectionCard>
  );

  const deleteCandidateReports = deleteCandidate ? getClientReports(reports, deleteCandidate.id) : [];

  return (
    <div className="customer-workspace customer-workspace--crm">
      {(error || notice) && (
        <section className="stack">
          {error ? <p className="notice-banner error">{error}</p> : null}
          {notice ? <p className="notice-banner notice">{notice}</p> : null}
        </section>
      )}

      {selectedClient ? renderDetail(selectedClient) : renderOverview()}

      <Dialog
        open={clientModalMode !== null}
        title={clientModalMode === "edit" ? t("Editar cliente", "Kunden bearbeiten") : t("Nuevo cliente", "Neuer Kunde")}
        description={t(
          clientModalMode === "edit"
            ? "Actualiza la ficha del cliente sin salir del workspace."
            : "Crea una nueva ficha y ábrela al terminar.",
          clientModalMode === "edit"
            ? "Die Kundenkarte direkt im Workspace aktualisieren."
            : "Eine neue Karte anlegen und danach direkt öffnen."
        )}
        onClose={resetClientModal}
        footer={
          <div className="row">
            <button type="submit" form="client-dialog-form" disabled={saving || !isOnline}>
              {clientModalMode === "edit" ? t("Guardar cambios", "Änderungen speichern") : t("Crear cliente", "Kunde anlegen")}
            </button>
            <button type="button" className="ghost" onClick={resetClientModal}>
              {t("Cancelar", "Abbrechen")}
            </button>
          </div>
        }
      >
        <form id="client-dialog-form" className="stack" onSubmit={submitClient}>
          <div className="grid two">
            <label>
              {t("Nombre", "Vorname")}
              <input value={clientDraft.name} onChange={(event) => setClientDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              {t("Apellido", "Nachname")}
              <input value={clientDraft.surname} onChange={(event) => setClientDraft((current) => ({ ...current, surname: event.target.value }))} />
            </label>
            <label>
              {t("Contacto principal", "Hauptkontakt")}
              <input
                value={clientDraft.principalContact}
                onChange={(event) => setClientDraft((current) => ({ ...current, principalContact: event.target.value }))}
              />
            </label>
            <label>
              {t("Correo", "E-Mail")}
              <input
                type="email"
                value={clientDraft.email}
                onChange={(event) => setClientDraft((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              {t("Teléfono", "Telefon")}
              <input value={clientDraft.phone} onChange={(event) => setClientDraft((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              {t("Dirección / ubicación", "Adresse / Standort")}
              <input
                value={clientDraft.location}
                onChange={(event) => setClientDraft((current) => ({ ...current, location: event.target.value }))}
              />
            </label>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(visitClient)}
        title={t("Nueva visita", "Neuer Einsatz")}
        description={t(
          "La visita crea un borrador de informe ya vinculado al cliente.",
          "Der Einsatz erstellt direkt einen Berichtsentwurf, der mit dem Kunden verknüpft ist."
        )}
        onClose={closeVisitModal}
        footer={
          <div className="row">
            <button type="button" disabled={creatingVisit || !isOnline} onClick={() => void createVisit()}>
              {creatingVisit ? t("Creando visita...", "Einsatz wird erstellt...") : t("Guardar visita", "Einsatz speichern")}
            </button>
            <button type="button" className="ghost" onClick={closeVisitModal}>
              {t("Cancelar", "Abbrechen")}
            </button>
          </div>
        }
      >
        <div className="stack">
          <div className="crm-callout">
            <strong>{visitClient ? getClientPrimaryLabel(visitClient) : ""}</strong>
            <small>{visitClient?.location || visitClient?.email || ""}</small>
          </div>
          <div className="grid two">
            <label>
              {t("Fecha", "Datum")}
              <input
                type="date"
                value={visitDraft.date}
                onChange={(event) => setVisitDraft((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label>
              {t("Hora de la visita", "Uhrzeit des Einsatzes")}
              <input
                type="time"
                value={visitDraft.time}
                onChange={(event) => setVisitDraft((current) => ({ ...current, time: event.target.value }))}
              />
            </label>
            <label>
              {t("Duración (min)", "Dauer (Min.)")}
              <input
                type="number"
                min="15"
                step="15"
                value={visitDraft.durationMinutes}
                onChange={(event) => setVisitDraft((current) => ({ ...current, durationMinutes: event.target.value }))}
              />
            </label>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteCandidate)}
        size="narrow"
        title={t("Eliminar cliente", "Kunden löschen")}
        description={t(
          "La ficha del cliente se eliminará, pero los informes ya creados seguirán existiendo si están vinculados.",
          "Die Kundenkarte wird gelöscht, bereits erstellte Berichte bleiben jedoch bestehen, wenn sie verknüpft sind."
        )}
        onClose={() => setDeleteCandidate(null)}
        footer={
          <div className="row">
            <button type="button" className="btn-danger" disabled={saving} onClick={() => void removeClient()}>
              {t("Eliminar cliente", "Kunden löschen")}
            </button>
            <button type="button" className="ghost" onClick={() => setDeleteCandidate(null)}>
              {t("Cancelar", "Abbrechen")}
            </button>
          </div>
        }
      >
        <div className="stack">
          <p>
            {deleteCandidate
              ? t(
                  `${getClientPrimaryLabel(deleteCandidate)} tiene ${deleteCandidateReports.length} informe(s) vinculados.`,
                  `${getClientPrimaryLabel(deleteCandidate)} hat ${deleteCandidateReports.length} verknüpfte Berichte.`
                )
              : ""}
          </p>
          <small>
            {t(
              "Usa esta opción solo si quieres retirar la ficha del CRM.",
              "Diese Option nur verwenden, wenn die Karte aus dem CRM entfernt werden soll."
            )}
          </small>
        </div>
      </Dialog>
    </div>
  );
};

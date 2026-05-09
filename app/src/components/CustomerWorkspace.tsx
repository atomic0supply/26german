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
import { defaultUserLabel, Language, localeForLanguage, translate } from "../i18n";
import { createDefaultReport } from "../lib/defaultReport";
import {
  canFillLeckortungForReport,
  canOpenLeckortungPdfForReport,
  canOpenPdfForReport,
  canSendReportEmail,
  canSendLeckortungEmail,
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
  street: string;
  streetNumber: string;
  postalCode: string;
  city: string;
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
  street: "",
  streetNumber: "",
  postalCode: "",
  city: ""
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
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1.2em" height="1.2em" style={{ verticalAlign: "middle" }}>
    <path d="M4 6.5h16v11H4z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m5.5 8 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1.2em" height="1.2em" style={{ verticalAlign: "middle" }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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

const SummaryIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

const LeckortungIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3.5H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9l-5-5.5H9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M13 3.5V9h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8.5 13h7M8.5 16.5h4M11 10h1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="17.5" cy="17.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="m16.5 17.5 .8.8 1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

const MapIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1.2em" height="1.2em" style={{ verticalAlign: "middle" }}>
    <path d="M12 21.5c-3-4-8-9.5-8-14a8 8 0 1 1 16 0c0 4.5-5 10-8 14z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1em" height="1em" style={{ verticalAlign: "middle" }}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="1.2em" height="1.2em" style={{ verticalAlign: "middle" }}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);


const SummaryMetric = ({ label, value }: { label: string; value: string | number }) => (
  <article className="crm-metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
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
  const userLabel = currentUserLabel?.trim() || defaultUserLabel(language);
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
  const [sendingLeckortungReportId, setSendingLeckortungReportId] = useState("");
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
      street: client.street || "",
      streetNumber: client.streetNumber || "",
      postalCode: client.postalCode || "",
      city: client.city || ""
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
      || !clientDraft.street.trim()
      || !clientDraft.city.trim()
    ) {
      setError(
        t(
          "Nombre, apellido, contacto principal, correo, teléfono y dirección (calle, ciudad) son obligatorios.",
          "Name, Nachname, Hauptkontakt, E-Mail, Telefon und Adresse (Straße, Stadt) sind erforderlich."
        )
      );
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const computedLocation = `${clientDraft.street.trim()} ${clientDraft.streetNumber.trim()}`.trim() + `, ${clientDraft.postalCode.trim()} ${clientDraft.city.trim()}`.trim();

    try {
      if (clientModalMode === "edit" && selectedClient) {
        await updateDoc(doc(db, "clients", selectedClient.id), {
          name: clientDraft.name.trim(),
          surname: clientDraft.surname.trim(),
          principalContact: clientDraft.principalContact.trim(),
          email: clientDraft.email.trim(),
          phone: clientDraft.phone.trim(),
          street: clientDraft.street.trim(),
          streetNumber: clientDraft.streetNumber.trim(),
          postalCode: clientDraft.postalCode.trim(),
          city: clientDraft.city.trim(),
          location: computedLocation,
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
          street: clientDraft.street.trim(),
          streetNumber: clientDraft.streetNumber.trim(),
          postalCode: clientDraft.postalCode.trim(),
          city: clientDraft.city.trim(),
          location: computedLocation,
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

  const sendLeckortungByEmail = async (reportId: string, clientId: string) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede enviar el correo.", "Offline: E-Mail kann nicht gesendet werden."));
      return;
    }

    setSendingLeckortungReportId(reportId);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<{ reportId: string; clientId: string }, { recipient: string }>(functions, "sendLeckortungEmail");
      const result = await callable({ reportId, clientId });
      setNotice(
        t(
          `Notificación Leckortung enviada a ${result.data.recipient}.`,
          `Leckortung-Benachrichtigung an ${result.data.recipient} gesendet.`
        )
      );
    } catch (emailError) {
      setError(
        emailError instanceof Error
          ? emailError.message
          : t("No se pudo enviar el correo.", "E-Mail konnte nicht gesendet werden.")
      );
    } finally {
      setSendingLeckortungReportId("");
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
      setNotice(
        t(
          `Informe enviado a ${result.data.recipient}.`,
          `Bericht an ${result.data.recipient} gesendet.`
        )
      );
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
        {client.principalContact && (
          <article className="crm-metric-card">
            <span>{t("Contacto principal", "Hauptkontakt")}</span>
            <strong>{client.principalContact}</strong>
          </article>
        )}
        <article className="crm-metric-card">
          <span>{t("Correo", "E-Mail")}</span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
            <strong>{client.email || t("No definido", "Nicht definiert")}</strong>
            {client.email && (
              <button
                type="button"
                className="ghost icon-only"
                style={{ padding: "0.2rem" }}
                onClick={() => void navigator.clipboard.writeText(client.email)}
                title={t("Copiar", "Kopieren")}
              >
                <CopyIcon />
              </button>
            )}
          </div>
        </article>
        <article className="crm-metric-card">
          <span>{t("Teléfono", "Telefon")}</span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
            <strong>{client.phone || t("No definido", "Nicht definiert")}</strong>
            {client.phone && (
              <button
                type="button"
                className="ghost icon-only"
                style={{ padding: "0.2rem" }}
                onClick={() => void navigator.clipboard.writeText(client.phone)}
                title={t("Copiar", "Kopieren")}
              >
                <CopyIcon />
              </button>
            )}
          </div>
        </article>
        <SummaryMetric label={t("Último movimiento", "Letzte Aktivität")} value={formatDate(getClientLastActivity(client, relatedReports), locale)} />
        <SummaryMetric label={t("Creado", "Angelegt")} value={formatDate(client.createdAt, locale)} />
        <SummaryMetric label={t("Actualizado", "Aktualisiert")} value={formatDate(client.updatedAt, locale)} />
      </div>

      <section className="crm-panel">
        <div className="crm-panel__header">
          <div>
            <span className="section-card__eyebrow">{t("Actividad reciente", "Letzte Aktivität")}</span>
            <h4>{relatedReports.length === 0 ? t("Sin actividad", "Keine Aktivität") : t("Últimos informes", "Neueste Berichte")}</h4>
          </div>
        </div>
        {relatedReports.length === 0 ? (
          <EmptyState
            title={t("Sin actividad todavía", "Noch keine Aktivität")}
            description={t(
              "Este cliente aún no tiene visitas ni informes registrados.",
              "Dieser Kunde hat noch keine Einsätze oder Berichte."
            )}
            action={
              <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
                {t("Crear primera visita", "Ersten Einsatz erstellen")}
              </button>
            }
          />
        ) : (
          <div className="crm-mini-report-list">
            {relatedReports.slice(0, 3).map((report) => (
              <button key={report.id} type="button" className="crm-mini-report" onClick={() => onOpenReport?.(report.id)}>
                <div>
                  <strong>{report.projectNumber}</strong>
                  <p>{report.objectLabel || client.location || t("Sin ubicación", "Kein Standort")}</p>
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
            const canFillLeckortung = canFillLeckortungForReport(report);
            const hasLeckortungPdf = canOpenLeckortungPdfForReport(report);
            const canSendReport = canSendReportEmail(report, client);
            const canSendLeckortung = canSendLeckortungEmail(report, client);
            const leckortungNotificationSent = report.lastLeckortungEmailDelivery?.sentAt;

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
                    {leckortungNotificationSent ? (
                      <small>
                        {t("Notificación Leckortung enviada", "Leckortung-Benachrichtigung gesendet")}:{" "}
                        {formatDateTime(leckortungNotificationSent, locale)}
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className="crm-report-card__actions-block">
                  <small className="crm-report-card__actions-title">
                    {t("Acciones disponibles", "Verfugbare Aktionen")}
                  </small>
                  <div className="crm-report-card__actions">
                    {!hasLeckortungPdf && (
                      <IconButton
                        label={t("Leckortung", "Leckortung")}
                        description={
                          report.status === "draft"
                            ? t("Disponible cuando el informe principal este finalizado.", "Verfugbar, sobald der Hauptbericht finalisiert ist.")
                            : t("Rellenar y firmar el formulario con el cliente.", "Das Formular mit dem Kunden ausfullen und unterschreiben.")
                        }
                        icon={<LeckortungIcon />}
                        tone="accent"
                        disabled={!isOnline || !canFillLeckortung}
                        onClick={() => { window.location.hash = `leckortung/${report.id}`; }}
                      />
                    )}
                    {hasLeckortungPdf && (
                      <IconButton
                        label={t("Ver Leckortung PDF", "Leckortung-PDF ansehen")}
                        description={t(
                          "Abrir el PDF firmado del Leckortung en una nueva pestaña.",
                          "Das unterschriebene Leckortung-PDF in einem neuen Tab offnen."
                        )}
                        icon={<PdfIcon />}
                        href={report.leckortungFinalization?.pdfUrl ?? ""}
                        target="_blank"
                        rel="noreferrer"
                      />
                    )}
                    <IconButton
                      label={t("Ver informe PDF", "Bericht-PDF ansehen")}
                      description={
                        canOpenPdf
                          ? t("Abrir el informe tecnico final en una nueva pestaña.", "Den finalen technischen Bericht in einem neuen Tab offnen.")
                          : t("Solo disponible cuando el informe este guardado y finalizado.", "Nur verfugbar, wenn der Bericht korrekt gespeichert und finalisiert wurde.")
                      }
                      icon={<PdfIcon />}
                      href={canOpenPdf ? (report.finalization?.pdfUrl ?? "") : undefined}
                      target={canOpenPdf ? "_blank" : undefined}
                      rel={canOpenPdf ? "noreferrer" : undefined}
                      disabled={!canOpenPdf}
                    />
                    <IconButton
                      label={t("Enviar informe", "Bericht senden")}
                      description={
                        canSendReport
                          ? t("Enviar el informe principal al correo del cliente.", "Den Hauptbericht an die E-Mail des Kunden senden.")
                          : t("Se activara cuando exista el PDF del informe y el cliente tenga correo.", "Wird aktiv, sobald das Bericht-PDF existiert und der Kunde eine E-Mail hat.")
                      }
                      icon={<SendIcon />}
                      disabled={!canSendReport || sendingReportId === report.id}
                      onClick={() => void sendReportByEmail(report.id, client.id)}
                    />
                    <IconButton
                      label={
                        leckortungNotificationSent
                          ? t("Reenviar Leckortung", "Leckortung erneut senden")
                          : t("Enviar Leckortung", "Leckortung senden")
                      }
                      description={
                        leckortungNotificationSent
                          ? t("Volver a enviar el PDF Leckortung al cliente.", "Das Leckortung-PDF erneut an den Kunden senden.")
                          : t("Enviar el informe Leckortung al correo del cliente.", "Den Leckortung-Bericht an die E-Mail des Kunden senden.")
                      }
                      icon={<SendIcon />}
                      disabled={!canSendLeckortung || sendingLeckortungReportId === report.id}
                      onClick={() => void sendLeckortungByEmail(report.id, client.id)}
                    />
                  </div>
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
          <div className="crm-detail__hero" style={{ flexDirection: "column", gap: "1.2rem", width: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", width: "100%" }}>
              <span className="crm-detail__avatar">{getClientInitials(client)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0 }}>{getClientPrimaryLabel(client)}</h4>
                  <StatusChip tone="info">{t("Cliente activo", "Aktiver Kunde")}</StatusChip>
                </div>
                <p style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", marginBottom: 0 }}>
                  {client.location || t("Sin ubicación", "Kein Standort")}
                  {client.location && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(client.location)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("Ver en el mapa", "Auf der Karte anzeigen")}
                      title={t("Ver en el mapa", "Auf der Karte anzeigen")}
                      style={{ color: "inherit", opacity: 0.7, textDecoration: "none", display: "flex" }}
                    >
                      <MapIcon />
                    </a>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={() => openVisitModal(client)} disabled={!isOnline}>
                  <CalendarIcon />
                  {t("Nueva visita", "Neuer Einsatz")}
                </button>
                {client.email && (
                  <a className="button-link ghost" href={`mailto:${client.email}`}>
                    <MailIcon />
                    {t("Correo", "E-Mail")}
                  </a>
                )}
                {client.phone && (
                  <a className="button-link ghost" href={`tel:${client.phone}`}>
                    <PhoneIcon />
                    {t("Llamar", "Anrufen")}
                  </a>
                )}
                {client.phone && (
                  <a className="button-link ghost" href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                    <WhatsAppIcon />
                    WhatsApp
                  </a>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="ghost icon-only" onClick={() => openEditClientModal(client)} title={t("Editar", "Bearbeiten")}>
                  <EditIcon />
                </button>
                <button type="button" className="ghost icon-only" onClick={() => setDeleteCandidate(client)} disabled={saving} title={t("Eliminar", "Löschen")}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="crm-tabs">
          <button
            type="button"
            className={activeTab === "summary" ? "crm-tab active" : "crm-tab"}
            onClick={() => setActiveTab("summary")}
          >
            {t("Resumen", "Übersicht")}
          </button>
          <button
            type="button"
            className={activeTab === "agenda" ? "crm-tab active" : "crm-tab"}
            onClick={() => setActiveTab("agenda")}
          >
            {t("Agenda", "Agenda")}
          </button>
          <button
            type="button"
            className={activeTab === "reports" ? "crm-tab active" : "crm-tab"}
            onClick={() => setActiveTab("reports")}
          >
            {t("Informes", "Berichte")}
          </button>
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
              {t("Calle", "Straße")}
              <input
                value={clientDraft.street}
                onChange={(event) => setClientDraft((current) => ({ ...current, street: event.target.value }))}
              />
            </label>
            <label>
              {t("Número", "Hausnummer")}
              <input
                value={clientDraft.streetNumber}
                onChange={(event) => setClientDraft((current) => ({ ...current, streetNumber: event.target.value }))}
              />
            </label>
            <label>
              {t("Código Postal", "PLZ")}
              <input
                value={clientDraft.postalCode}
                onChange={(event) => setClientDraft((current) => ({ ...current, postalCode: event.target.value }))}
              />
            </label>
            <label>
              {t("Ciudad", "Stadt")}
              <input
                value={clientDraft.city}
                onChange={(event) => setClientDraft((current) => ({ ...current, city: event.target.value }))}
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

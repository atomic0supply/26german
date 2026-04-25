import { useEffect, useMemo, useState } from "react";
import { User, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  DocumentData,
  doc,
  FirestoreError,
  onSnapshot,
  orderBy,
  QuerySnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db } from "../firebase";
import { functions } from "../firebase";
import { COMPANY_OPTIONS, REPORT_TEMPLATE, resolveReportTemplateName } from "../constants";
import { Language, localeForLanguage, translate } from "../i18n";
import { createDefaultReport } from "../lib/defaultReport";
import { toIsoString } from "../lib/firestore";
import { BrandingConfig } from "../lib/useBranding";
import { ClientData, CompanyId, ReportListItem, UserRole } from "../types";
import { AdminPanel } from "./AdminPanel";
import { CustomerWorkspace } from "./CustomerWorkspace";
import { HomeDashboard } from "./HomeDashboard";
import { VisitCalendar, VisitItem } from "./VisitCalendar";
import { VisitList } from "./VisitList";
import { AppShell } from "./layout/AppShell";
import { SidebarNavItem } from "./layout/SidebarNav";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface ReportListProps {
  uid: string;
  user: User;
  userRole: UserRole;
  isOnline: boolean;
  onOpenReport: (id: string) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  branding: BrandingConfig;
}

const getClientFullName = (client?: Pick<ClientData, "name" | "surname"> | null) =>
  client ? [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ") : "";

const buildVisitItems = (reports: ReportListItem[], clients: ClientData[], userLabel: string): VisitItem[] => {
  const clientMap = new Map(clients.map((client) => [client.id, client]));

  return reports
    .filter((report) => report.appointmentDate)
    .map((report) => {
      const client = report.clientId ? clientMap.get(report.clientId) : undefined;
      return {
        id: `visit-${report.id}`,
        title: getClientFullName(client) || report.projectNumber || "Visit",
        address: report.objectLabel || client?.location || "",
        clientLabel: client ? [client.principalContact, client.email].filter(Boolean).join(" · ") : "",
        technician: report.technicianName || userLabel,
        when: report.appointmentDate || new Date().toISOString(),
        durationMinutes: report.visitDurationMinutes,
        notificationRecipient: report.visitNotificationRecipient || client?.email || "",
        notificationSentAt: report.visitNotificationSentAt,
        status: report.status === "finalized" ? "done" : "draft",
        reportId: report.id
      } satisfies VisitItem;
    })
    .sort((left, right) => left.when.localeCompare(right.when));
};

const ReportsWorkspace = ({
  language,
  reports,
  isOnline,
  deletingReportId,
  currentUid,
  companyId,
  onCompanyChange,
  creating,
  onCreateReport,
  onOpenReport,
  onDeleteDraftReport
}: {
  language: Language;
  reports: ReportListItem[];
  isOnline: boolean;
  deletingReportId: string;
  currentUid: string;
  companyId: CompanyId | "";
  onCompanyChange: (value: CompanyId | "") => void;
  creating: boolean;
  onCreateReport: () => void;
  onOpenReport: (id: string) => void;
  onDeleteDraftReport: (item: ReportListItem) => void;
}) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);

  return (
    <div className="workspace-stack">
      <SectionCard
        title={t("Nuevo informe", "Neuer Bericht")}
        eyebrow={t("Acción principal", "Schnellstart")}
        description={t("Empieza un informe con la empresa ya seleccionada.", "Starte einen Bericht mit bereits ausgewähltem Unternehmen.")}
      >
        <div className="report-launchpad">
          <label>
            {t("Empresa / logo", "Unternehmen / Logo")}
            <select value={companyId} onChange={(event) => onCompanyChange(event.target.value as CompanyId | "")}>
              <option value="">{t("Sin logo específico", "Kein spezielles Logo")}</option>
              {COMPANY_OPTIONS.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <div className="report-launchpad__info">
            <strong>{resolveReportTemplateName(language, REPORT_TEMPLATE.name)}</strong>
            <span>{t("El flujo guiado se abrirá con guardado automático y pasos adaptados al móvil.", "Der geführte Ablauf öffnet sich mit Autosave und mobilen Arbeitsschritten.")}</span>
          </div>

          <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
            {creating ? t("Creando informe...", "Bericht wird erstellt...") : t("Crear informe", "Bericht erstellen")}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Informes", "Berichte")}
        eyebrow={t("Seguimiento", "Übersicht")}
        description={t("Borradores, finales y actividad reciente.", "Entwürfe, finale Berichte und letzte Aktivität.")}
      >
        {reports.length === 0 ? (
          <EmptyState
            title={t("No hay informes todavía", "Noch keine Berichte")}
            description={t("Crea el primero para empezar a trabajar desde la nueva experiencia guiada.", "Erstelle den ersten Bericht, um mit dem neuen geführten Ablauf zu arbeiten.")}
          />
        ) : (
          <div className="report-stack">
            {reports.map((item) => (
              <article key={item.id} className="report-row">
                <div className="report-row__copy">
                  <strong>{item.projectNumber}</strong>
                  <p>{item.objectLabel}</p>
                  <small>{new Date(item.updatedAt).toLocaleString(locale)}</small>
                </div>
                <div className="report-row__actions">
                  <StatusChip tone={item.status === "finalized" ? "success" : "warning"}>
                    {item.status === "finalized" ? t("Final", "Final") : t("Borrador", "Entwurf")}
                  </StatusChip>
                  {item.createdBy && (
                    <small className="report-row__owner">
                      {t("Creado por", "Erstellt von")}: {item.createdByEmail || item.createdByLabel || item.createdBy}
                    </small>
                  )}
                  <button type="button" className="ghost" onClick={() => onOpenReport(item.id)}>
                    {t("Abrir", "Öffnen")}
                  </button>
                  <button
                    type="button"
                    disabled={!isOnline || item.status !== "draft" || deletingReportId === item.id || item.createdBy !== currentUid}
                    onClick={() => onDeleteDraftReport(item)}
                  >
                    {deletingReportId === item.id ? t("Eliminando...", "Löscht...") : t("Eliminar", "Löschen")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export const ReportList = ({ uid, user, userRole, isOnline, onOpenReport, language, onLanguageChange, branding }: ReportListProps) => {
  const [activeMenu, setActiveMenu] = useState<"home" | "agenda" | "clients" | "reports" | "admin">("home");
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [notifyingVisitId, setNotifyingVisitId] = useState("");
  const [deletingReportId, setDeletingReportId] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyId | "">("");
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitDraft, setVisitDraft] = useState({
    clientId: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    durationMinutes: "60"
  });
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const userLabel = user.displayName?.trim() || user.email?.trim() || "User";

  const navItems: SidebarNavItem[] = [
    { id: "home", label: t("Hoy", "Heute"), description: t("Qué hacer ahora", "Was jetzt ansteht") },
    { id: "agenda", label: t("Visitas", "Einsätze"), description: t("Agenda operativa", "Operative Planung") },
    { id: "clients", label: t("Clientes", "Kunden"), description: t("Contactos e historial", "Kontakte und Verlauf"), badge: String(clients.length) },
    { id: "reports", label: t("Trabajo", "Arbeit"), description: t("Borradores y entregas", "Entwürfe und Ausgaben"), badge: String(reports.length) },
    ...(userRole === "admin" ? [{ id: "admin", label: t("Admin", "Admin"), description: t("Sistema y control", "System und Steuerung") }] : [])
  ];

  useEffect(() => {
    const reportsRef = collection(db, "reports");
    const canReadAllReports = userRole === "admin" || userRole === "office";
    const indexedQuery = canReadAllReports
      ? query(reportsRef, orderBy("updatedAt", "desc"))
      : query(reportsRef, where("createdBy", "==", uid), orderBy("updatedAt", "desc"));
    const fallbackQuery = canReadAllReports
      ? query(reportsRef)
      : query(reportsRef, where("createdBy", "==", uid));

    const mapReports = (snapshot: QuerySnapshot<DocumentData>, sortInClient: boolean) => {
      const next = snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          createdBy: String(data.createdBy ?? ""),
          createdByEmail: String(
            data.createdByEmail
            ?? (data.createdBy === uid ? user.email?.trim() : "")
            ?? ""
          ).trim(),
          createdByLabel: String(
            data.createdByName
            ?? (data.projectInfo as { technicianName?: string } | undefined)?.technicianName
            ?? (data.createdBy === uid ? userLabel : "")
          ).trim(),
          projectNumber: String((data.projectInfo as { projectNumber?: string } | undefined)?.projectNumber ?? "(sin número)"),
          objectLabel: String((data.projectInfo as { locationObject?: string } | undefined)?.locationObject ?? "(sin ubicación)"),
          clientId: String(data.clientId ?? ""),
          appointmentDate: String((data.projectInfo as { appointmentDate?: string } | undefined)?.appointmentDate ?? ""),
          visitDurationMinutes: String(
            (data.templateFields as Record<string, unknown> | undefined)?.visitDurationMinutes
            ?? ""
          ),
          visitNotificationRecipient: String(
            (data.templateFields as Record<string, unknown> | undefined)?.visitNotificationRecipient
            ?? ""
          ),
          visitNotificationSentAt: String(
            (data.templateFields as Record<string, unknown> | undefined)?.visitNotificationSentAt
            ?? ""
          ),
          technicianName: String((data.projectInfo as { technicianName?: string } | undefined)?.technicianName ?? ""),
          companyId: data.companyId as CompanyId | undefined,
          status: data.status === "finalized" ? "finalized" : "draft",
          templateName: String(data.templateName ?? REPORT_TEMPLATE.name),
          finalization: data.finalization
            ? {
                pdfUrl: String((data.finalization as { pdfUrl?: string }).pdfUrl ?? ""),
                finalizedAt: (data.finalization as { finalizedAt?: unknown }).finalizedAt
                  ? toIsoString((data.finalization as { finalizedAt?: unknown }).finalizedAt)
                  : "",
                pdfVersion: Number((data.finalization as { pdfVersion?: number }).pdfVersion ?? 0) || undefined
              }
            : undefined,
          updatedAt: toIsoString(data.updatedAt)
        } satisfies ReportListItem;
      });

      if (sortInClient) {
        next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      }

      setReports(next);
      setLoadingReports(false);
    };

    let unsubscribe = onSnapshot(
      indexedQuery,
      (snapshot) => {
        mapReports(snapshot, false);
      },
      (snapshotError: FirestoreError) => {
        const message = snapshotError.message.toLowerCase();
        if (message.includes("requires an index") || message.includes("currently building") || snapshotError.code === "failed-precondition") {
          unsubscribe = onSnapshot(
            fallbackQuery,
            (snapshot) => mapReports(snapshot, true),
            (fallbackError) => {
              setError(fallbackError.message);
              setLoadingReports(false);
            }
          );
          return;
        }

        setError(snapshotError.message);
        setLoadingReports(false);
      }
    );

    return unsubscribe;
  }, [uid, userRole]);

  useEffect(() => {
    const clientsRef = collection(db, "clients");
    const canReadAllClients = userRole === "admin" || userRole === "office";
    const clientsQuery = canReadAllClients
      ? query(clientsRef, orderBy("updatedAt", "desc"))
      : query(clientsRef, where("createdBy", "==", uid));
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
              createdBy: String(data.createdBy ?? uid),
              createdAt: toIsoString(data.createdAt),
              updatedAt: toIsoString(data.updatedAt)
            } satisfies ClientData;
          })
          .sort((left, right) => {
            const leftLabel = `${left.name} ${left.surname}`.trim() || left.location;
            const rightLabel = `${right.name} ${right.surname}`.trim() || right.location;
            return leftLabel.localeCompare(rightLabel, localeForLanguage(language));
          });
        setClients(next);
        setLoadingClients(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoadingClients(false);
      }
    );

    return unsubscribe;
  }, [language, uid, userRole]);

  useEffect(() => {
    setVisitDraft((current) => ({
      ...current,
      date: selectedAgendaDate
    }));
  }, [selectedAgendaDate]);

  const createReport = async () => {
    if (!isOnline) {
      setError(t("Sin conexión: solo puedes crear informes en línea.", "Offline: Berichte können nur online erstellt werden."));
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      const payload = createDefaultReport(uid, selectedCompany || undefined);
      const docRef = await addDoc(collection(db, "reports"), {
        ...payload,
        createdByEmail: user.email?.trim() || "",
        createdByName: userLabel,
        projectInfo: {
          ...payload.projectInfo,
          technicianName: userLabel
        },
        signature: {
          ...payload.signature,
          technicianName: userLabel
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNotice(t("Informe creado.", "Bericht erstellt."));
      onOpenReport(docRef.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("No se pudo crear el informe.", "Bericht konnte nicht erstellt werden."));
    } finally {
      setCreating(false);
    }
  };

  const createVisit = async () => {
    if (!isOnline) {
      setError(t("Sin conexión: no se pueden crear visitas.", "Offline: Einsätze können nicht erstellt werden."));
      return;
    }

    const selectedClient = clients.find((client) => client.id === visitDraft.clientId);
    if (!selectedClient) {
      setError(t("Primero debes seleccionar un cliente existente.", "Bitte zuerst einen vorhandenen Kunden auswählen."));
      return;
    }

    if (!visitDraft.date || !visitDraft.time) {
      setError(t("Fecha y hora son obligatorias para la visita.", "Datum und Uhrzeit sind für den Einsatz erforderlich."));
      return;
    }

    const appointmentDate = `${visitDraft.date}T${visitDraft.time}`;
    const projectNumber = `VIS-${visitDraft.date.replaceAll("-", "")}-${visitDraft.time.replace(":", "")}`;
    const clientFullName = getClientFullName(selectedClient) || selectedClient.principalContact || selectedClient.location;

    setCreatingVisit(true);
    setError("");
    setNotice("");

    try {
      const payload = createDefaultReport(uid, selectedCompany || undefined);
      const docRef = await addDoc(collection(db, "reports"), {
        ...payload,
        clientId: selectedClient.id,
        createdByEmail: user.email?.trim() || "",
        createdByName: userLabel,
        projectInfo: {
          ...payload.projectInfo,
          projectNumber,
          appointmentDate,
          technicianName: userLabel,
          firstReportBy: selectedClient.principalContact,
          locationObject: selectedClient.location
        },
        contacts: {
          ...payload.contacts,
          name1: clientFullName,
          name2: selectedClient.principalContact,
          street1: selectedClient.location,
          phone1: selectedClient.phone,
          email: selectedClient.email
        },
        signature: {
          ...payload.signature,
          technicianName: userLabel
        },
        templateFields: {
          ...payload.templateFields,
          visitDurationMinutes: visitDraft.durationMinutes || "60",
          visitNotificationRecipient: selectedClient.email,
          visitClientId: selectedClient.id,
          visitClientName: clientFullName,
          visitClientContact: selectedClient.principalContact,
          visitClientPhone: selectedClient.phone,
          visitClientLocation: selectedClient.location
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNotice(t("Visita creada y vinculada al cliente.", "Einsatz erstellt und dem Kunden zugeordnet."));
      setShowVisitForm(false);
      setVisitDraft({
        clientId: "",
        date: selectedAgendaDate,
        time: "09:00",
        durationMinutes: "60"
      });
      onOpenReport(docRef.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("No se pudo crear la visita.", "Einsatz konnte nicht erstellt werden."));
    } finally {
      setCreatingVisit(false);
    }
  };

  const notifyVisitByEmail = async (reportId: string) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede enviar el correo.", "Offline: E-Mail kann nicht gesendet werden."));
      return;
    }

    const confirmed = window.confirm(
      t("¿Enviar la notificación de visita al cliente ahora?", "Die Einsatzbenachrichtigung jetzt an den Kunden senden?")
    );
    if (!confirmed) {
      return;
    }

    setNotifyingVisitId(reportId);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<{ reportId: string }, { recipient: string; sentAt: string }>(functions, "sendVisitNotification");
      const result = await callable({ reportId });
      setNotice(
        t(
          `Visita notificada a ${result.data.recipient}.`,
          `Einsatz an ${result.data.recipient} benachrichtigt.`
        )
      );
    } catch (notifyError) {
      setError(notifyError instanceof Error ? notifyError.message : t("No se pudo enviar la notificación.", "Benachrichtigung konnte nicht gesendet werden."));
    } finally {
      setNotifyingVisitId("");
    }
  };

  const deleteDraftReport = async (item: ReportListItem) => {
    if (!isOnline || item.status !== "draft") {
      return;
    }

    setDeletingReportId(item.id);
    setError("");
    setNotice("");

    try {
      await deleteDoc(doc(db, "reports", item.id));
      setNotice(t("Informe eliminado.", "Bericht gelöscht."));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("No se pudo eliminar el informe.", "Bericht konnte nicht gelöscht werden."));
    } finally {
      setDeletingReportId("");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const handleSlotClick = (date: string, time: string) => {
    setVisitDraft((current) => ({ ...current, date, time }));
    setShowVisitForm(true);
    setSelectedAgendaDate(date);
  };

  const handleMoveVisit = async (reportId: string, newDate: string, newTime: string) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede mover la visita.", "Offline: Einsatz kann nicht verschoben werden."));
      return;
    }
    try {
      await updateDoc(doc(db, "reports", reportId), {
        "projectInfo.appointmentDate": `${newDate}T${newTime}`,
        updatedAt: serverTimestamp()
      });
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("No se pudo mover la visita.", "Einsatz konnte nicht verschoben werden."));
    }
  };

  const handleResizeVisit = async (reportId: string, newDurationMinutes: string) => {
    if (!isOnline) {
      setError(t("Sin conexión: no se puede ajustar la duración.", "Offline: Einsatzdauer kann nicht angepasst werden."));
      return;
    }
    try {
      await updateDoc(doc(db, "reports", reportId), {
        "templateFields.visitDurationMinutes": newDurationMinutes,
        updatedAt: serverTimestamp()
      });
    } catch (resizeError) {
      setError(resizeError instanceof Error ? resizeError.message : t("No se pudo ajustar la duración.", "Einsatzdauer konnte nicht angepasst werden."));
    }
  };

  const visitItems = useMemo(() => buildVisitItems(reports, clients, userLabel), [reports, clients, userLabel]);
  const agendaItems = visitItems.filter((visit) => visit.when.slice(0, 10) === selectedAgendaDate);

  const pageTitle =
    activeMenu === "home"
      ? t("Centro de hoy", "Heutige Zentrale")
      : activeMenu === "agenda"
        ? t("Visitas y agenda", "Einsätze und Agenda")
          : activeMenu === "clients"
            ? t("Clientes", "Kunden")
            : activeMenu === "reports"
              ? t("Trabajo en curso", "Aktuelle Arbeit")
            : t("Admin", "Admin");

  const pageSubtitle =
    activeMenu === "home"
      ? t("Qué hacer ahora, qué está pendiente y cuál es la siguiente mejor acción.", "Was jetzt ansteht, was noch offen ist und was als Nächstes sinnvoll ist.")
      : activeMenu === "agenda"
        ? t("Vista híbrida de calendario y lista operativa.", "Hybride Kalender- und Einsatzliste.")
        : activeMenu === "clients"
          ? t("Contactos con historial y acceso rápido.", "Kontakte mit Verlauf und Schnellzugriff.")
          : activeMenu === "reports"
            ? t("Crea, retoma y cierra informes desde el nuevo flujo guiado.", "Berichte im neuen geführten Ablauf erstellen, fortsetzen und abschließen.")
            : t("Usuarios, perfil y configuración técnica en un solo panel.", "Benutzer, Profil und technische Konfiguration in einem Panel.");

  return (
    <AppShell
      brandTitle={branding.companyName}
      brandSubtitle={t("Inspección, clientes e informes en una sola vista.", "Inspektion, Kunden und Berichte in einer Oberfläche.")}
      logoUrl={branding.logoUrl || undefined}
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      language={language}
      isOnline={isOnline}
      navItems={navItems}
      activeItem={activeMenu}
      onSelect={(id) => setActiveMenu(id as typeof activeMenu)}
      user={user}
      userRole={userRole}
      onLanguageChange={onLanguageChange}
      onLogout={logout}
    >
      <div className="workspace-stack">
        {(error || notice) && (
          <section className="stack">
            {error && <p className="notice-banner error">{error}</p>}
            {notice && <p className="notice-banner notice">{notice}</p>}
          </section>
        )}

        {(loadingReports || loadingClients) && (
          <SectionCard
            title={t("Cargando espacio de trabajo", "Arbeitsbereich wird geladen")}
            eyebrow={t("Estado", "Status")}
            description={t("Preparando datos operativos y CRM.", "Operative Daten und CRM werden vorbereitet.")}
          >
            <p>{t("Un momento…", "Einen Moment...")}</p>
          </SectionCard>
        )}

        {!loadingReports && !loadingClients && activeMenu === "home" && (
          <HomeDashboard
            user={user}
            userRole={userRole}
            reports={reports}
            clients={clients}
            companyId={selectedCompany}
            onCompanyChange={setSelectedCompany}
            creating={creating}
            isOnline={isOnline}
            language={language}
            onCreateReport={createReport}
            onOpenReport={onOpenReport}
            onJumpTo={(target) => setActiveMenu(target)}
          />
        )}

        {!loadingReports && !loadingClients && activeMenu === "agenda" && (
          <div className="workspace-stack">
            <SectionCard
              title={t("Agenda de visitas", "Einsatzplanung")}
              eyebrow={t("Planificación", "Planung")}
              description={t("Selecciona un día para ver o crear visitas. Pulsa una celda vacía para añadir.", "Wähle einen Tag zum Anzeigen oder Anlegen von Einsätzen. Leere Zelle antippen zum Hinzufügen.")}
              actions={
                <button
                  type="button"
                  disabled={!isOnline || clients.length === 0}
                  onClick={() => setShowVisitForm((current) => !current)}
                >
                  {showVisitForm ? t("Cerrar", "Schließen") : t("Crear visita", "Einsatz anlegen")}
                </button>
              }
            >
              <VisitCalendar
                visits={visitItems}
                selectedDate={selectedAgendaDate}
                language={language}
                onSelectDate={setSelectedAgendaDate}
                onSlotClick={handleSlotClick}
                onVisitClick={onOpenReport}
                onMoveVisit={(id, date, time) => void handleMoveVisit(id, date, time)}
                onResizeVisit={(id, durationMinutes) => void handleResizeVisit(id, durationMinutes)}
              />
              {showVisitForm && (
                <div className="visit-create-panel">
                  {clients.length === 0 ? (
                    <EmptyState
                      title={t("Primero crea un cliente", "Zuerst einen Kunden anlegen")}
                      description={t("La visita debe vincularse a un cliente ya creado.", "Der Einsatz muss mit einem vorhandenen Kunden verknüpft werden.")}
                      action={
                        <button type="button" onClick={() => setActiveMenu("clients")}>
                          {t("Ir a clientes", "Zu Kunden")}
                        </button>
                      }
                    />
                  ) : (
                    <>
                      <div className="grid two">
                        <label>
                          {t("Cliente", "Kunde")}
                          <select
                            value={visitDraft.clientId}
                            onChange={(event) => setVisitDraft((current) => ({ ...current, clientId: event.target.value }))}
                          >
                            <option value="">{t("Seleccionar cliente", "Kunden auswählen")}</option>
                            {clients.map((client) => (
                              <option key={client.id} value={client.id}>
                                {[getClientFullName(client), client.location].filter(Boolean).join(" · ")}
                              </option>
                            ))}
                          </select>
                        </label>
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
                      <div className="row">
                        <button type="button" disabled={creatingVisit || !isOnline} onClick={() => void createVisit()}>
                          {creatingVisit ? t("Creando visita...", "Einsatz wird erstellt...") : t("Guardar visita", "Einsatz speichern")}
                        </button>
                        <small>{t("La visita crea un borrador enlazado al cliente para abrirlo luego como informe.", "Der Einsatz erstellt einen Entwurf, der später als Bericht geöffnet werden kann.")}</small>
                      </div>
                    </>
                  )}
                </div>
              )}
            </SectionCard>

            {agendaItems.length === 0 ? (
              <SectionCard
                title={t("Sin visitas en esta fecha", "Keine Termine an diesem Tag")}
                eyebrow={t("Agenda", "Agenda")}
                description={t(
                  clients.length === 0
                    ? "Primero crea un cliente y luego programa una visita."
                    : "Crea una visita para este día o revisa otra fecha del calendario.",
                  clients.length === 0
                    ? "Lege zuerst einen Kunden an und plane dann einen Einsatz."
                    : "Lege einen Einsatz für diesen Tag an oder prüfe ein anderes Datum im Kalender."
                )} 
              >
                <EmptyState
                  title={t(clients.length === 0 ? "No hay clientes todavía" : "Sin visitas reales todavía", clients.length === 0 ? "Noch keine Kunden" : "Noch keine echten Termine")}
                  description={t(
                    clients.length === 0
                      ? "Necesitas al menos un cliente para crear una visita."
                      : "Programa una visita desde esta pantalla para que aparezca en la agenda.",
                    clients.length === 0
                      ? "Du brauchst mindestens einen Kunden, um einen Einsatz anzulegen."
                      : "Plane einen Einsatz direkt auf diesem Bildschirm, damit er in der Agenda erscheint."
                  )}
                  action={
                    clients.length === 0 ? (
                      <button type="button" onClick={() => setActiveMenu("clients")}>
                        {t("Crear / abrir clientes", "Kunden öffnen")}
                      </button>
                    ) : undefined
                  }
                />
              </SectionCard>
            ) : (
              <VisitList
                visits={agendaItems}
                language={language}
                isOnline={isOnline}
                notifyingVisitId={notifyingVisitId}
                onOpenReport={onOpenReport}
                onNotifyVisit={(reportId) => void notifyVisitByEmail(reportId)}
              />
            )}
          </div>
        )}

        {!loadingReports && !loadingClients && activeMenu === "clients" && (
          <CustomerWorkspace
            clients={clients}
            reports={reports}
            uid={uid}
            isOnline={isOnline}
            language={language}
            currentUserLabel={userLabel}
            currentUserEmail={user.email?.trim() || ""}
            onOpenReport={onOpenReport}
          />
        )}

        {!loadingReports && !loadingClients && activeMenu === "reports" && (
          <ReportsWorkspace
            language={language}
            reports={reports}
            isOnline={isOnline}
            deletingReportId={deletingReportId}
            currentUid={uid}
            companyId={selectedCompany}
            onCompanyChange={setSelectedCompany}
            creating={creating}
            onCreateReport={createReport}
            onOpenReport={onOpenReport}
            onDeleteDraftReport={(item) => void deleteDraftReport(item)}
          />
        )}

        {activeMenu === "admin" && userRole === "admin" && (
          <AdminPanel
            language={language}
            isOnline={isOnline}
            uid={uid}
            onLanguageChange={onLanguageChange}
            user={user}
            userRole={userRole}
          />
        )}
      </div>
    </AppShell>
  );
};

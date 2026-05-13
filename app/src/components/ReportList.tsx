import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createTranslator, defaultUserLabel, Language, localeForLanguage } from "../i18n";
import { createDefaultReport } from "../lib/defaultReport";
import { toIsoString } from "../lib/firestore";
import { ClientData, CompanyId, BrandingConfig, ReportListItem, TemplateSummary, UserRole } from "../types";
import { AdminPanel } from "./AdminPanel";
import { CustomerWorkspace } from "./CustomerWorkspace";
import { HomeDashboard } from "./HomeDashboard";
import { VisitCalendar, VisitItem } from "./VisitCalendar";
import { VisitList } from "./VisitList";
import { AppShell } from "./layout/AppShell";
import { SidebarNavItem } from "./layout/SidebarNav";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Toast, ToastMessage, ToastTone } from "./ui/Toast";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";
import { CommandPalette, CommandPaletteItem } from "./ui/CommandPalette";

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
      const hasSavedReport = report.status === "finalized"
        || (report.createdAt ? report.updatedAt.localeCompare(report.createdAt) > 0 : false);
      const contactName = client?.principalContact?.trim() || getClientFullName(client);
      return {
        id: `visit-${report.id}`,
        title: getClientFullName(client) || report.projectNumber || "Visit",
        address: report.objectLabel || client?.location || "",
        clientLabel: contactName,
        clientEmail: client?.email || "",
        technician: report.technicianName || userLabel,
        when: report.appointmentDate || new Date().toISOString(),
        durationMinutes: report.visitDurationMinutes,
        notificationRecipient: report.visitNotificationRecipient || client?.email || "",
        notificationSentAt: report.visitNotificationSentAt,
        status: hasSavedReport ? "done" : "draft",
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
  userRole,
  companyId,
  templates,
  selectedTemplateId,
  templatesLoading,
  onCompanyChange,
  onTemplateChange,
  creating,
  onCreateReport,
  onOpenReport,
  onDeleteReport
}: {
  language: Language;
  reports: ReportListItem[];
  isOnline: boolean;
  deletingReportId: string;
  currentUid: string;
  userRole: UserRole;
  companyId: CompanyId | "";
  templates: TemplateSummary[];
  selectedTemplateId: string;
  templatesLoading: boolean;
  onCompanyChange: (value: CompanyId | "") => void;
  onTemplateChange: (value: string) => void;
  creating: boolean;
  onCreateReport: () => void;
  onOpenReport: (id: string) => void;
  onDeleteReport: (item: ReportListItem) => void;
}) => {
  const t = createTranslator(language);
  const locale = localeForLanguage(language);
  const canDeleteOthers = userRole === "admin" || userRole === "office";
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const devMode = localStorage.getItem("leakops_dev_mode") === "true";

  // Búsqueda + filtro de estado (client-side, sin tocar backend)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "finalized">("all");

  const filteredReports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return reports.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.projectNumber,
        item.objectLabel,
        item.technicianName ?? "",
        item.createdByEmail ?? "",
        item.createdByLabel ?? "",
        item.templateName ?? ""
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [reports, search, statusFilter]);

  return (
    <div className="workspace-stack">
      <SectionCard
        title={t("Neuer Bericht", "Nuevo informe")}
        eyebrow={t("Schnellstart", "Acción principal")}
        description={t("Starte einen Bericht mit bereits ausgewähltem Unternehmen.", "Empieza un informe con la empresa ya seleccionada.")}
      >
        <div className="report-launchpad">
          {devMode && (
            <label>
              {t("PDF-Vorlage", "Plantilla PDF")}
              <select value={selectedTemplateId} onChange={(event) => onTemplateChange(event.target.value)} disabled={templatesLoading}>
                <option value={REPORT_TEMPLATE.id}>{resolveReportTemplateName(language, REPORT_TEMPLATE.name)}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.brand}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {t("Unternehmen / Logo", "Empresa / logo")}
            <select value={companyId} onChange={(event) => onCompanyChange(event.target.value as CompanyId | "")}>
              <option value="">{t("Kein spezielles Logo", "Sin logo específico")}</option>
              {COMPANY_OPTIONS.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          {devMode && (
            <div className="report-launchpad__info">
              <strong>{selectedTemplate?.name ?? resolveReportTemplateName(language, REPORT_TEMPLATE.name)}</strong>
              <span>{selectedTemplate
                ? t(
                    `Veröffentlichte Vorlage von ${selectedTemplate.brand}. Neue Berichte nutzen deren letzte Version.`,
                    `Plantilla publicada de ${selectedTemplate.brand}. Los nuevos informes usarán su última versión.`
                  )
                : t(
                    "Der geführte Ablauf öffnet sich mit Autosave und mobilen Arbeitsschritten.",
                    "El flujo guiado se abrirá con guardado automático y pasos adaptados al móvil."
                  )}</span>
            </div>
          )}

          <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
            {creating ? t("Bericht wird erstellt...", "Creando informe...") : t("Bericht erstellen", "Crear informe")}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Berichte", "Informes")}
        eyebrow={t("Übersicht", "Seguimiento")}
        description={t("Entwürfe, finale Berichte und letzte Aktivität.", "Borradores, finales y actividad reciente.")}
      >
        {reports.length === 0 ? (
          <EmptyState
            title={t("Noch keine Berichte", "No hay informes todavía")}
            description={t("Erstelle den ersten Bericht, um mit dem neuen geführten Ablauf zu arbeiten.", "Crea el primero para empezar a trabajar desde la nueva experiencia guiada.")}
          />
        ) : (
          <div className="report-list-wrap">
            <div className="report-toolbar">
              <label className="report-toolbar__search">
                <span className="visually-hidden">{t("Suchen", "Buscar")}</span>
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t(
                    "Nach Nummer, Objekt, Techniker suchen…",
                    "Buscar por número, objeto, técnico…"
                  )}
                  aria-label={t("Berichte durchsuchen", "Buscar informes")}
                />
                {search && (
                  <button
                    type="button"
                    className="report-toolbar__clear"
                    onClick={() => setSearch("")}
                    aria-label={t("Suche löschen", "Limpiar búsqueda")}
                  >
                    ×
                  </button>
                )}
              </label>
              <div className="report-toolbar__filters" role="tablist" aria-label={t("Statusfilter", "Filtro de estado")}>
                {(["all", "draft", "finalized"] as const).map((option) => {
                  const label =
                    option === "all"     ? t("Alle", "Todos") :
                    option === "draft"   ? t("Entwürfe", "Borradores") :
                                           t("Final", "Finalizados");
                  const count =
                    option === "all"   ? reports.length :
                    reports.filter((r) => r.status === option).length;
                  const active = statusFilter === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`report-toolbar__chip${active ? " report-toolbar__chip--active" : ""}`}
                      onClick={() => setStatusFilter(option)}
                    >
                      {label} <span className="report-toolbar__count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <EmptyState
                title={t("Keine Treffer", "Sin resultados")}
                description={t(
                  "Kein Bericht passt zu deiner Suche oder dem Filter.",
                  "Ningún informe coincide con la búsqueda o el filtro."
                )}
              />
            ) : (
          <div className="report-stack">
            {filteredReports.map((item) => (
              <article key={item.id} className="report-row">
                <div className="report-row__copy">
                  <strong>{item.projectNumber}</strong>
                  <p>{item.objectLabel}</p>
                  <small>{new Date(item.updatedAt).toLocaleString(locale)}</small>
                </div>
                <div className="report-row__actions">
                  <StatusChip tone={item.status === "finalized" ? "success" : "warning"}>
                    {item.status === "finalized" ? t("Final", "Final") : t("Entwurf", "Borrador")}
                  </StatusChip>
                  {item.createdBy && (
                    <small className="report-row__owner">
                      {t("Erstellt von", "Creado por")}: {item.createdByEmail || item.createdByLabel || item.createdBy}
                    </small>
                  )}
                  <button type="button" className="ghost" onClick={() => onOpenReport(item.id)}>
                    {t("Öffnen", "Abrir")}
                  </button>
                  <button
                    type="button"
                    disabled={!isOnline || deletingReportId === item.id || (!canDeleteOthers && item.createdBy !== currentUid)}
                    onClick={() => onDeleteReport(item)}
                  >
                    {deletingReportId === item.id ? t("Löscht...", "Eliminando...") : t("Löschen", "Eliminar")}
                  </button>
                </div>
              </article>
            ))}
          </div>
            )}
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
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const pushToast = useCallback((text: string, tone: ToastTone = "success") =>
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, text, tone }]), []);
  const [creating, setCreating] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [notifyingVisitId, setNotifyingVisitId] = useState("");
  const [deletingReportId, setDeletingReportId] = useState("");
  const [pendingDeleteReport, setPendingDeleteReport] = useState<ReportListItem | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyId | "">("");
  const [availableTemplates, setAvailableTemplates] = useState<TemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(REPORT_TEMPLATE.id);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitDraft, setVisitDraft] = useState({
    clientId: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    durationMinutes: "60",
    technicianName: "",
    sendNotification: false
  });
  const t = createTranslator(language);
  const userLabel = user.displayName?.trim() || user.email?.trim() || defaultUserLabel(language);

  useEffect(() => {
    setLoadingTemplates(true);
    const callable = httpsCallable<unknown, TemplateSummary[]>(functions, "listTemplates");
    callable({})
      .then((result) => {
        setAvailableTemplates(result.data.filter((item) => item.publishedVersionId));
      })
      .catch((templateError) => {
        setError(templateError instanceof Error ? templateError.message : t("Vorlagen konnten nicht geladen werden.", "No se pudieron cargar las plantillas."));
      })
      .finally(() => setLoadingTemplates(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navItems: SidebarNavItem[] = [
    { id: "home", label: t("Heute", "Hoy"), description: t("Was jetzt ansteht", "Qué hacer ahora") },
    { id: "agenda", label: t("Einsätze", "Visitas"), description: t("Operative Planung", "Agenda operativa") },
    { id: "clients", label: t("Kunden", "Clientes"), description: t("Kontakte und Verlauf", "Contactos e historial"), badge: String(clients.length) },
    { id: "reports", label: t("Arbeit", "Trabajo"), description: t("Entwürfe und Ausgaben", "Borradores y entregas"), badge: String(reports.length) },
    ...(userRole === "admin" ? [{ id: "admin", label: t("Admin", "Admin"), description: t("System und Steuerung", "Sistema y control") }] : [])
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
          createdAt: toIsoString(data.createdAt),
          projectNumber: String((data.projectInfo as { projectNumber?: string } | undefined)?.projectNumber ?? "(sin número)"),
          objectLabel: String((data.projectInfo as { locationObject?: string } | undefined)?.locationObject ?? "(sin ubicación)"),
          clientId: String(data.clientId ?? ""),
          appointmentDate: String((data.projectInfo as { appointmentDate?: string } | undefined)?.appointmentDate ?? ""),
          templateVersionId: String(data.templateVersionId ?? "").trim() || undefined,
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
          brandTemplateId: data.brandTemplateId as import("../types").TemplateId | undefined,
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
          leckortungFinalization: data.leckortungFinalization
            ? {
                pdfUrl: String((data.leckortungFinalization as { pdfUrl?: string }).pdfUrl ?? ""),
                finalizedAt: (data.leckortungFinalization as { finalizedAt?: unknown }).finalizedAt
                  ? toIsoString((data.leckortungFinalization as { finalizedAt?: unknown }).finalizedAt)
                  : "",
                pdfVersion: Number((data.leckortungFinalization as { pdfVersion?: number }).pdfVersion ?? 0) || undefined
              }
            : undefined,
          lastEmailDelivery: data.lastEmailDelivery
            ? {
                clientId: String((data.lastEmailDelivery as { clientId?: string }).clientId ?? ""),
                recipient: String((data.lastEmailDelivery as { recipient?: string }).recipient ?? ""),
                sentAt: (data.lastEmailDelivery as { sentAt?: unknown }).sentAt
                  ? toIsoString((data.lastEmailDelivery as { sentAt?: unknown }).sentAt)
                  : ""
              }
            : undefined,
          lastLeckortungEmailDelivery: data.lastLeckortungEmailDelivery
            ? {
                clientId: String((data.lastLeckortungEmailDelivery as { clientId?: string }).clientId ?? ""),
                recipient: String((data.lastLeckortungEmailDelivery as { recipient?: string }).recipient ?? ""),
                sentAt: (data.lastLeckortungEmailDelivery as { sentAt?: unknown }).sentAt
                  ? toIsoString((data.lastLeckortungEmailDelivery as { sentAt?: unknown }).sentAt)
                  : ""
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

  // Atajo global Cmd/Ctrl+K → abre la command palette del shell.
  // No se monta cuando hay un informe abierto (el editor tiene su propio listener).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const cmd = event.metaKey || event.ctrlKey;
      if (cmd && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const createReport = async () => {
    if (!isOnline) {
      setError(t("Offline: Berichte können nur online erstellt werden.", "Sin conexión: solo puedes crear informes en línea."));
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      const selectedTemplate = availableTemplates.find((item) => item.id === selectedTemplateId);
      const payload = createDefaultReport(uid, {
        companyId: selectedCompany || undefined,
        templateId: selectedTemplate?.id ?? REPORT_TEMPLATE.id,
        templateName: selectedTemplate?.name ?? REPORT_TEMPLATE.name,
        templateVersionId: selectedTemplate?.publishedVersionId
      });
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
      setNotice(t("Bericht erstellt.", "Informe creado."));
      onOpenReport(docRef.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("Bericht konnte nicht erstellt werden.", "No se pudo crear el informe."));
    } finally {
      setCreating(false);
    }
  };

  const createVisit = async () => {
    if (!isOnline) {
      setError(t("Offline: Einsätze können nicht erstellt werden.", "Sin conexión: no se pueden crear visitas."));
      return;
    }

    const selectedClient = clients.find((client) => client.id === visitDraft.clientId);
    if (!selectedClient) {
      setError(t("Bitte zuerst einen vorhandenen Kunden auswählen.", "Primero debes seleccionar un cliente existente."));
      return;
    }

    if (!visitDraft.date || !visitDraft.time) {
      setError(t("Datum und Uhrzeit sind für den Einsatz erforderlich.", "Fecha y hora son obligatorias para la visita."));
      return;
    }

    const technicianName = visitDraft.technicianName.trim() || userLabel;
    const appointmentDate = `${visitDraft.date}T${visitDraft.time}`;
    const projectNumber = `VIS-${visitDraft.date.replaceAll("-", "")}-${visitDraft.time.replace(":", "")}`;
    const clientFullName = getClientFullName(selectedClient) || selectedClient.principalContact || selectedClient.location;

    setCreatingVisit(true);
    setError("");
    setNotice("");

    try {
      const payload = createDefaultReport(uid, { companyId: selectedCompany || undefined });
      const docRef = await addDoc(collection(db, "reports"), {
        ...payload,
        clientId: selectedClient.id,
        createdByEmail: user.email?.trim() || "",
        createdByName: userLabel,
        projectInfo: {
          ...payload.projectInfo,
          projectNumber,
          appointmentDate,
          technicianName,
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
          technicianName
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

      // Optionally notify the client by email right from the modal
      if (visitDraft.sendNotification && selectedClient.email) {
        try {
          const callable = httpsCallable<{ reportId: string }, { recipient: string }>(functions, "sendVisitNotification");
          const result = await callable({ reportId: docRef.id });
          pushToast(t(
            `✉ Benachrichtigung gesendet an ${result.data.recipient}`,
            `✉ Notificación enviada a ${result.data.recipient}`
          ), "success");
        } catch {
          pushToast(t(
            "Einsatz erstellt, aber E-Mail konnte nicht gesendet werden.",
            "Visita creada, pero el correo no se pudo enviar."
          ), "error");
        }
      } else {
        pushToast(t("Einsatz erfolgreich erstellt.", "Visita creada correctamente."), "success");
      }

      setVisitModalOpen(false);
      setVisitDraft({
        clientId: "",
        date: selectedAgendaDate,
        time: "09:00",
        durationMinutes: "60",
        technicianName: "",
        sendNotification: false
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("Einsatz konnte nicht erstellt werden.", "No se pudo crear la visita."));
    } finally {
      setCreatingVisit(false);
    }
  };

  const notifyVisitByEmail = async (reportId: string) => {
    if (!isOnline) {
      setError(t("Offline: E-Mail kann nicht gesendet werden.", "Sin conexión: no se puede enviar el correo."));
      return;
    }

    const confirmed = window.confirm(
      t("Die Einsatzbenachrichtigung jetzt an den Kunden senden?", "¿Enviar la notificación de visita al cliente ahora?")
    );
    if (!confirmed) {
      return;
    }

    setNotifyingVisitId(reportId);
    setError("");

    try {
      const callable = httpsCallable<{ reportId: string }, { recipient: string; sentAt: string }>(functions, "sendVisitNotification");
      const result = await callable({ reportId });
      pushToast(t(
        `✉ Benachrichtigung gesendet an ${result.data.recipient}`,
        `✉ Notificación enviada a ${result.data.recipient}`
      ), "success");
    } catch (notifyError) {
      pushToast(
        notifyError instanceof Error ? notifyError.message : t("Benachrichtigung konnte nicht gesendet werden.", "No se pudo enviar la notificación."),
        "error"
      );
    } finally {
      setNotifyingVisitId("");
    }
  };

  // Solo abre el modal — la confirmación real ocurre en `confirmDeleteReport`.
  const deleteReportHandler = (item: ReportListItem) => {
    if (!isOnline) return;
    setPendingDeleteReport(item);
  };

  const confirmDeleteReport = async () => {
    const item = pendingDeleteReport;
    if (!item || !isOnline) return;
    setPendingDeleteReport(null);
    setDeletingReportId(item.id);
    setError("");
    setNotice("");

    try {
      const callable = httpsCallable<{ reportId: string }, { deleted: boolean }>(functions, "deleteReport");
      await callable({ reportId: item.id });
      pushToast(t("Bericht gelöscht.", "Informe eliminado."), "success");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("Bericht konnte nicht gelöscht werden.", "No se pudo eliminar el informe."));
    } finally {
      setDeletingReportId("");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const handleSlotClick = (date: string, time: string) => {
    setVisitDraft((current) => ({ ...current, date, time }));
    setVisitModalOpen(true);
    setSelectedAgendaDate(date);
  };

  const handleMoveVisit = async (reportId: string, newDate: string, newTime: string) => {
    if (!isOnline) {
      setError(t("Offline: Einsatz kann nicht verschoben werden.", "Sin conexión: no se puede mover la visita."));
      return;
    }
    try {
      await updateDoc(doc(db, "reports", reportId), {
        "projectInfo.appointmentDate": `${newDate}T${newTime}`,
        updatedAt: serverTimestamp()
      });
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("Einsatz konnte nicht verschoben werden.", "No se pudo mover la visita."));
    }
  };

  const handleResizeVisit = async (reportId: string, newDurationMinutes: string) => {
    if (!isOnline) {
      setError(t("Offline: Einsatzdauer kann nicht angepasst werden.", "Sin conexión: no se puede ajustar la duración."));
      return;
    }
    try {
      await updateDoc(doc(db, "reports", reportId), {
        "templateFields.visitDurationMinutes": newDurationMinutes,
        updatedAt: serverTimestamp()
      });
    } catch (resizeError) {
      setError(resizeError instanceof Error ? resizeError.message : t("Einsatzdauer konnte nicht angepasst werden.", "No se pudo ajustar la duración."));
    }
  };

  const visitItems = useMemo(() => buildVisitItems(reports, clients, userLabel), [reports, clients, userLabel]);
  const agendaItems = visitItems.filter((visit) => visit.when.slice(0, 10) === selectedAgendaDate);

  const pageTitle =
    activeMenu === "home"
      ? t("Heutige Zentrale", "Centro de hoy")
      : activeMenu === "agenda"
        ? t("Einsätze und Agenda", "Visitas y agenda")
          : activeMenu === "clients"
            ? t("Kunden", "Clientes")
            : activeMenu === "reports"
              ? t("Aktuelle Arbeit", "Trabajo en curso")
            : t("Admin", "Admin");

  const pageSubtitle =
    activeMenu === "home"
      ? t("Was jetzt ansteht, was noch offen ist und was als Nächstes sinnvoll ist.", "Qué hacer ahora, qué está pendiente y cuál es la siguiente mejor acción.")
      : activeMenu === "agenda"
        ? t("Hybride Kalender- und Einsatzliste.", "Vista híbrida de calendario y lista operativa.")
        : activeMenu === "clients"
          ? t("Kontakte mit Verlauf und Schnellzugriff.", "Contactos con historial y acceso rápido.")
          : activeMenu === "reports"
            ? t("Berichte im neuen geführten Ablauf erstellen, fortsetzen und abschließen.", "Crea, retoma y cierra informes desde el nuevo flujo guiado.")
            : t("Benutzer, Profil und technische Konfiguration in einem Panel.", "Usuarios, perfil y configuración técnica en un solo panel.");

  return (
    <>
    <AppShell
      brandTitle={branding.companyName}
      brandSubtitle={t("Inspektion, Kunden und Berichte in einer Oberfläche.", "Inspección, clientes e informes en una sola vista.")}
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
      onOpenPalette={() => setPaletteOpen(true)}
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
            title={t("Arbeitsbereich wird geladen", "Cargando espacio de trabajo")}
            eyebrow={t("Status", "Estado")}
            description={t("Operative Daten und CRM werden vorbereitet.", "Preparando datos operativos y CRM.")}
          >
            <p>{t("Einen Moment...", "Un momento…")}</p>
          </SectionCard>
        )}

        {!loadingReports && !loadingClients && activeMenu === "home" && (
          <HomeDashboard
            user={user}
            userRole={userRole}
            reports={reports}
            clients={clients}
            companyId={selectedCompany}
            templates={availableTemplates}
            selectedTemplateId={selectedTemplateId}
            templatesLoading={loadingTemplates}
            onCompanyChange={setSelectedCompany}
            onTemplateChange={setSelectedTemplateId}
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
            {/* ── Quick visit modal ── */}
            <Dialog
              open={visitModalOpen}
              title={t("Neuer Einsatz", "Nueva visita")}
              description={t(
                "Einsatzdaten ausfüllen. Der Einsatz erscheint im Kalender ohne das Formular zu öffnen.",
                "Rellena los datos de la visita. La visita quedará en el calendario sin abrir el formulario."
              )}
              onClose={() => setVisitModalOpen(false)}
              size="default"
              footer={
                <div className="row">
                  <button
                    type="button"
                    disabled={creatingVisit || !isOnline || !visitDraft.clientId}
                    onClick={() => void createVisit()}
                  >
                    {creatingVisit ? t("Wird gespeichert...", "Guardando...") : t("Einsatz speichern", "Guardar visita")}
                  </button>
                  <button type="button" className="ghost" onClick={() => setVisitModalOpen(false)} disabled={creatingVisit}>
                    {t("Abbrechen", "Cancelar")}
                  </button>
                </div>
              }
            >
              {clients.length === 0 ? (
                <EmptyState
                  title={t("Zuerst einen Kunden anlegen", "Primero crea un cliente")}
                  description={t("Der Einsatz muss mit einem vorhandenen Kunden verknüpft werden.", "La visita debe vincularse a un cliente ya creado.")}
                  action={
                    <button type="button" onClick={() => { setVisitModalOpen(false); setActiveMenu("clients"); }}>
                      {t("Zu Kunden", "Ir a clientes")}
                    </button>
                  }
                />
              ) : (
                <div className="stack">
                  <div className="grid two">
                    <label style={{ gridColumn: "1 / -1" }}>
                      {t("Kunde", "Cliente")}
                      <select
                        value={visitDraft.clientId}
                        onChange={(e) => setVisitDraft((c) => ({ ...c, clientId: e.target.value }))}
                        required
                      >
                        <option value="">{t("Kunden auswählen…", "Seleccionar cliente…")}</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {[getClientFullName(client), client.location].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Datum", "Fecha")}
                      <input
                        type="date"
                        value={visitDraft.date}
                        onChange={(e) => setVisitDraft((c) => ({ ...c, date: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t("Uhrzeit", "Hora")}
                      <input
                        type="time"
                        value={visitDraft.time}
                        onChange={(e) => setVisitDraft((c) => ({ ...c, time: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t("Dauer (Min.)", "Duración (min)")}
                      <input
                        type="number"
                        min="15"
                        step="15"
                        value={visitDraft.durationMinutes}
                        onChange={(e) => setVisitDraft((c) => ({ ...c, durationMinutes: e.target.value }))}
                      />
                    </label>
                    <label>
                      {t("Zuständiger Techniker", "Técnico asignado")}
                      <input
                        type="text"
                        value={visitDraft.technicianName}
                        placeholder={userLabel}
                        onChange={(e) => setVisitDraft((c) => ({ ...c, technicianName: e.target.value }))}
                      />
                    </label>
                  </div>
                  {(() => {
                    const clientForNotify = clients.find((cl) => cl.id === visitDraft.clientId);
                    if (!clientForNotify?.email) return null;
                    return (
                      <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={visitDraft.sendNotification}
                          onChange={(e) => setVisitDraft((c) => ({ ...c, sendNotification: e.target.checked }))}
                        />
                        <span>{t(
                          `Kunden per E-Mail benachrichtigen (${clientForNotify.email})`,
                          `Notificar al cliente por correo (${clientForNotify.email})`
                        )}</span>
                      </label>
                    );
                  })()}
                </div>
              )}
            </Dialog>

            <SectionCard
              title={t("Einsatzplanung", "Agenda de visitas")}
              eyebrow={t("Planung", "Planificación")}
              description={t("Leere Zelle antippen um schnell einen Einsatz hinzuzufügen.", "Pulsa una celda vacía del calendario para añadir una visita rápidamente.")}
              actions={
                <button
                  type="button"
                  disabled={!isOnline || clients.length === 0}
                  onClick={() => {
                    setVisitDraft((c) => ({ ...c, date: selectedAgendaDate }));
                    setVisitModalOpen(true);
                  }}
                >
                  {t("+ Neuer Einsatz", "+ Nueva visita")}
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
            </SectionCard>

            {agendaItems.length === 0 ? (
              <SectionCard
                title={t("Keine Termine an diesem Tag", "Sin visitas en esta fecha")}
                eyebrow={t("Agenda", "Agenda")}
                description={t(
                  clients.length === 0
                    ? "Lege zuerst einen Kunden an und plane dann einen Einsatz."
                    : "Lege einen Einsatz für diesen Tag an oder prüfe ein anderes Datum im Kalender.",
                  clients.length === 0
                    ? "Primero crea un cliente y luego programa una visita."
                    : "Crea una visita para este día o revisa otra fecha del calendario."
                )}
              >
                <EmptyState
                  title={t(
                    clients.length === 0 ? "Noch keine Kunden" : "Noch keine echten Termine",
                    clients.length === 0 ? "No hay clientes todavía" : "Sin visitas reales todavía"
                  )}
                  description={t(
                    clients.length === 0
                      ? "Du brauchst mindestens einen Kunden, um einen Einsatz anzulegen."
                      : "Plane einen Einsatz direkt auf diesem Bildschirm, damit er in der Agenda erscheint.",
                    clients.length === 0
                      ? "Necesitas al menos un cliente para crear una visita."
                      : "Programa una visita desde esta pantalla para que aparezca en la agenda."
                  )}
                  action={
                    clients.length === 0 ? (
                      <button type="button" onClick={() => setActiveMenu("clients")}>
                        {t("Kunden öffnen", "Crear / abrir clientes")}
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
            userRole={userRole}
            companyId={selectedCompany}
            templates={availableTemplates}
            selectedTemplateId={selectedTemplateId}
            templatesLoading={loadingTemplates}
            onCompanyChange={setSelectedCompany}
            onTemplateChange={setSelectedTemplateId}
            creating={creating}
            onCreateReport={createReport}
            onOpenReport={onOpenReport}
            onDeleteReport={deleteReportHandler}
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

    <Dialog
      open={Boolean(pendingDeleteReport)}
      onClose={() => setPendingDeleteReport(null)}
      title={t("Bericht endgültig löschen?", "¿Eliminar este informe definitivamente?")}
      description={t(
        "Dieser Vorgang kann nicht rückgängig gemacht werden.",
        "Esta acción no se puede deshacer."
      )}
      size="narrow"
      footer={
        <>
          <button type="button" className="ghost" onClick={() => setPendingDeleteReport(null)}>
            {t("Abbrechen", "Cancelar")}
          </button>
          <button
            type="button"
            className="danger"
            disabled={!isOnline}
            onClick={() => void confirmDeleteReport()}
          >
            {t("Endgültig löschen", "Eliminar definitivamente")}
          </button>
        </>
      }
    >
      {pendingDeleteReport && (
        <div className="confirm-delete">
          <p>
            <strong>
              {pendingDeleteReport.projectNumber || t("(ohne Nummer)", "(sin número)")}
            </strong>
            {pendingDeleteReport.objectLabel && (
              <>
                {" "}— {pendingDeleteReport.objectLabel}
              </>
            )}
          </p>
          <ul className="confirm-delete__warnings">
            <li>{t("Alle Fotos werden gelöscht.", "Se eliminarán todas las fotos.")}</li>
            <li>{t("Generierte PDFs werden entfernt.", "Se eliminarán los PDFs generados.")}</li>
            <li>{t("Diese Aktion ist nicht rückgängig zu machen.", "Esta acción es irreversible.")}</li>
          </ul>
        </div>
      )}
    </Dialog>

    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      placeholder={t("Aktion, Bereich oder Bericht suchen…", "Buscar acción, sección o informe…")}
      items={(() => {
        const items: CommandPaletteItem[] = [
          {
            id: "nav-home",
            label: t("Heute / Dashboard", "Hoy / Dashboard"),
            group: t("Navigation", "Navegación"),
            keywords: "home heute hoy dashboard panel inicio",
            onRun: () => setActiveMenu("home"),
          },
          {
            id: "nav-agenda",
            label: t("Termine / Besuche", "Visitas / Agenda"),
            group: t("Navigation", "Navegación"),
            keywords: "agenda visitas termine besuche calendar",
            onRun: () => setActiveMenu("agenda"),
          },
          {
            id: "nav-clients",
            label: t(`Kunden (${clients.length})`, `Clientes (${clients.length})`),
            group: t("Navigation", "Navegación"),
            keywords: "kunden clientes clients",
            onRun: () => setActiveMenu("clients"),
          },
          {
            id: "nav-reports",
            label: t(`Berichte (${reports.length})`, `Trabajo / Informes (${reports.length})`),
            group: t("Navigation", "Navegación"),
            keywords: "berichte informes reports trabajo",
            onRun: () => setActiveMenu("reports"),
          },
        ];
        if (userRole === "admin") {
          items.push({
            id: "nav-admin",
            label: "Admin",
            group: t("Navigation", "Navegación"),
            keywords: "admin verwaltung",
            onRun: () => setActiveMenu("admin"),
          });
        }
        items.push(
          {
            id: "action-new-report",
            label: t("Neuen Bericht anlegen", "Crear nuevo informe"),
            group: t("Aktionen", "Acciones"),
            keywords: "nuevo crear informe report neu",
            onRun: () => { setActiveMenu("reports"); void createReport(); },
          },
          {
            id: "action-logout",
            label: t("Abmelden", "Cerrar sesión"),
            group: t("Aktionen", "Acciones"),
            keywords: "logout cerrar sesion abmelden",
            onRun: () => { void logout(); },
          },
        );
        // Acceso directo a los primeros 12 informes recientes
        for (const r of reports.slice(0, 12)) {
          items.push({
            id: `report-${r.id}`,
            label: `${r.projectNumber || t("Ohne Nummer", "Sin número")} · ${r.objectLabel || ""}`.trim(),
            hint: r.status === "finalized" ? "Final" : t("Entwurf", "Borrador"),
            group: t("Berichte", "Informes"),
            keywords: `${r.projectNumber} ${r.objectLabel} ${r.technicianName ?? ""}`,
            onRun: () => onOpenReport(r.id),
          });
        }
        return items;
      })()}
    />

    <Toast messages={toasts} onDismiss={dismissToast} />
    </>
  );
};

import { User } from "firebase/auth";
import { COMPANY_OPTIONS, REPORT_TEMPLATE, resolveReportTemplateName } from "../constants";
import { createTranslator, defaultUserLabel, Language, localeForLanguage } from "../i18n";
import { ClientData, CompanyId, ReportListItem, TemplateSummary, UserRole } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface HomeDashboardProps {
  user: User;
  userRole: UserRole;
  reports: ReportListItem[];
  clients: ClientData[];
  companyId: CompanyId | "";
  templates: TemplateSummary[];
  selectedTemplateId: string;
  templatesLoading: boolean;
  onCompanyChange: (value: CompanyId | "") => void;
  onTemplateChange: (value: string) => void;
  creating: boolean;
  isOnline: boolean;
  language: Language;
  onCreateReport: () => void;
  onOpenReport: (id: string) => void;
  onJumpTo: (target: "agenda" | "clients" | "reports") => void;
}

const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

export const HomeDashboard = ({
  user,
  userRole,
  reports,
  clients,
  companyId,
  templates,
  selectedTemplateId,
  templatesLoading,
  onCompanyChange,
  onTemplateChange,
  creating,
  isOnline,
  language,
  onCreateReport,
  onOpenReport,
  onJumpTo
}: HomeDashboardProps) => {
  const t = createTranslator(language);
  const locale = localeForLanguage(language);
  const today = startOfToday();
  const devMode = localStorage.getItem("leakops_dev_mode") === "true";
  const openDrafts = reports.filter((item) => item.status === "draft");
  const pendingVisits = reports.filter((item) => {
    if (!item.appointmentDate) {
      return false;
    }
    const appointment = new Date(item.appointmentDate);
    appointment.setHours(0, 0, 0, 0);
    return appointment >= today;
  });
  const priorityDraft = openDrafts[0];
  const nextVisit = pendingVisits
    .slice()
    .sort((left, right) => (left.appointmentDate ?? "").localeCompare(right.appointmentDate ?? ""))[0];
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const roleHeadline = userRole === "technician"
    ? t("Feldeinsatz aktiv", "Campo activo")
    : t("Bürobetrieb", "Operativa de oficina");

  return (
    <div className="workspace-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <span className="hero-panel__eyebrow">{roleHeadline}</span>
          <h2>
            {t("Alles Wichtige des Tages in einer Oberfläche.", "Todo lo importante del día en una sola vista.")}
          </h2>
          <p>
            {userRole === "technician"
              ? t(
                  "Entwürfe fortsetzen, das richtige Zielunternehmen vorbereiten und den Bericht mobil ohne Kontextverlust weiterführen.",
                  "Retoma borradores, prepara la empresa destinataria correcta y avanza el informe desde el móvil sin perder contexto."
                )
              : t(
                  "Agenda, Kunden und offene Berichte mit einer klareren Office-Sicht steuern.",
                  "Coordina agenda, clientes e informes pendientes con una vista más clara para oficina."
                )}
          </p>
        </div>

        <div className="hero-panel__actions">
          {devMode && (
            <label className="hero-panel__field">
              <span>{t("PDF-Vorlage", "Plantilla PDF")}</span>
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

          <label className="hero-panel__field">
            <span>{t("Zielunternehmen", "Empresa destinataria")}</span>
            <select value={companyId} onChange={(event) => onCompanyChange(event.target.value as CompanyId | "")}>
              <option value="">{t("Kein spezielles Logo", "Sin logo específico")}</option>
              {COMPANY_OPTIONS.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
            {creating ? t("Bericht wird vorbereitet...", "Preparando informe...") : t("Bericht starten", "Crear informe")}
          </button>

          {devMode && selectedTemplate && (
            <small>{t(`Verwendete veröffentlichte Vorlage: ${selectedTemplate.name}.`, `Usando plantilla publicada: ${selectedTemplate.name}.`)}</small>
          )}

          <div className="hero-panel__status-row">
            <StatusChip tone={priorityDraft ? "warning" : "neutral"}>
              {priorityDraft ? t("Entwurf bereit zum Fortsetzen", "Borrador listo para retomar") : t("Keine aktiven Entwürfe", "Sin borradores activos")}
            </StatusChip>
            <StatusChip tone={nextVisit ? "info" : "neutral"}>
              {nextVisit ? t("Termin geplant", "Visita planificada") : t("Keine nächsten Termine", "Sin visitas próximas")}
            </StatusChip>
          </div>
        </div>
      </section>

      <SectionCard
        title={t("Prioritäten heute", "Prioridades de hoy")}
        eyebrow={t("Aktion", "Acción")}
        description={t("Die drei wichtigsten Aktionen direkt beim Einstieg.", "Las tres acciones principales al entrar en la app.")}
      >
        <div className="priority-grid">
          <button type="button" className="priority-card priority-card--draft" onClick={() => priorityDraft ? onOpenReport(priorityDraft.id) : onJumpTo("reports")}>
            <small>{t("Fortsetzen", "Continuar")}</small>
            <strong>{priorityDraft ? priorityDraft.projectNumber : t("Kein aktiver Entwurf", "Sin borrador activo")}</strong>
            <span>
              {priorityDraft
                ? priorityDraft.objectLabel || t("Öffnen und Bericht weiter ausfüllen.", "Abrir y seguir completando el informe.")
                : t("Gehe zu Arbeit, um einen Bericht zu erstellen oder fortzusetzen.", "Ve a trabajo para crear o retomar un informe.")}
            </span>
          </button>

          <button type="button" className="priority-card priority-card--create" disabled={!isOnline || creating} onClick={onCreateReport}>
            <small>{t("Erstellen", "Crear")}</small>
            <strong>{creating ? t("Bericht wird vorbereitet...", "Preparando informe...") : t("Neuer Bericht", "Nuevo informe")}</strong>
            <span>{t("Starte einen neuen Einsatz mit geführtem Ablauf und Autosave.", "Empieza una visita nueva con el flujo guiado y guardado continuo.")}</span>
          </button>

          <button type="button" className="priority-card priority-card--visit" onClick={() => nextVisit ? onOpenReport(nextVisit.id) : onJumpTo("agenda")}>
            <small>{t("Plan", "Plan")}</small>
            <strong>{nextVisit ? nextVisit.projectNumber : t("Nächster Einsatz", "Siguiente visita")}</strong>
            <span>
              {nextVisit?.appointmentDate
                ? new Date(nextVisit.appointmentDate).toLocaleString(locale)
                : t("Öffne die Agenda, um geplante Einsätze zu sehen.", "Abre la agenda para ver lo programado.")}
            </span>
          </button>
        </div>
      </SectionCard>

      <section className="metric-grid metric-grid--secondary">
        <article className="metric-card metric-card--secondary">
          <span>{t("Aktive Entwürfe", "Borradores activos")}</span>
          <strong>{openDrafts.length}</strong>
          <small>{t("Direkt aus Feld oder Büro fortsetzbar.", "Listos para retomar desde campo u oficina.")}</small>
        </article>
        <article className="metric-card metric-card--secondary">
          <span>{t("Nächste Termine", "Visitas próximas")}</span>
          <strong>{pendingVisits.length}</strong>
          <small>{t("Abgeleitet aus den vorhandenen Berichten.", "Basadas en los informes ya creados.")}</small>
        </article>
        <article className="metric-card metric-card--secondary">
          <span>{t("Aktive Kunden", "Clientes activos")}</span>
          <strong>{clients.length}</strong>
          <small>{t("Mit Historie direkt aus der Kundenkarte.", "Con historial accesible desde la ficha.")}</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <SectionCard
          title={t("Operative Abkürzungen", "Atajos operativos")}
          eyebrow={t("Navigieren", "Navegar")}
          description={t("Springe in die wichtigsten Bereiche, ohne den Tagesfokus zu verlieren.", "Accede a las áreas clave sin perder el foco del día.")}
        >
          <div className="quick-actions">
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("agenda")}>
              <strong>{t("Agenda öffnen", "Ver agenda")}</strong>
              <span>{t("Kalender und Tagesliste.", "Calendario y lista del día.")}</span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("clients")}>
              <strong>{t("Kunden öffnen", "Abrir clientes")}</strong>
              <span>{t("Kontakte und Historie finden.", "Busca contactos e historial.")}</span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("reports")}>
              <strong>{t("Berichte prüfen", "Revisar informes")}</strong>
              <span>{t("Entwürfe, Finale und Versand.", "Borradores, finales y envíos.")}</span>
            </button>
          </div>
        </SectionCard>

        <SectionCard
          className="section-card--quiet"
          title={t("Letzte Aktivität", "Actividad reciente")}
          eyebrow={t("Live", "Live")}
          description={t("Deine letzten Bewegungen, bewusst leiser als die Hauptaktion.", "Tus últimos movimientos, con menos protagonismo que la acción principal.")}
        >
          {reports.length === 0 ? (
            <EmptyState
              title={t("Noch keine Aktivität", "Aún no hay actividad")}
              description={t("Erstelle den ersten Bericht, um die operative Sicht zu starten.", "Crea el primer informe para empezar a poblar la vista operativa.")}
              action={
                <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
                  {creating ? t("Wird vorbereitet...", "Preparando...") : t("Ersten Bericht erstellen", "Crear primer informe")}
                </button>
              }
            />
          ) : (
            <div className="timeline-list">
              {reports.slice(0, 4).map((item) => (
                <button key={item.id} type="button" className="timeline-item" onClick={() => onOpenReport(item.id)}>
                  <div>
                    <strong>{item.projectNumber}</strong>
                    <p>{item.objectLabel}</p>
                  </div>
                  <div className="timeline-item__meta">
                    <StatusChip tone={item.status === "finalized" ? "success" : "warning"}>
                      {item.status === "finalized" ? t("Final", "Final") : t("Entwurf", "Borrador")}
                    </StatusChip>
                    <small>{new Date(item.updatedAt).toLocaleString(locale)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="dashboard-footer-note">
        <span>{user.displayName?.trim() || user.email?.trim() || defaultUserLabel(language)}</span>
        <small>{t("Neue mobile-first Erfahrung aktiv.", "Nueva experiencia mobile-first activa.")}</small>
      </div>
    </div>
  );
};

import { User } from "firebase/auth";
import { COMPANY_OPTIONS } from "../constants";
import { Language, localeForLanguage, translate } from "../i18n";
import { ClientData, CompanyId, ReportListItem, UserRole } from "../types";
import { EmptyState } from "./ui/EmptyState";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface HomeDashboardProps {
  user: User;
  userRole: UserRole;
  reports: ReportListItem[];
  clients: ClientData[];
  companyId: CompanyId | "";
  onCompanyChange: (value: CompanyId | "") => void;
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
  onCompanyChange,
  creating,
  isOnline,
  language,
  onCreateReport,
  onOpenReport,
  onJumpTo
}: HomeDashboardProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const today = startOfToday();
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
  const roleHeadline = userRole === "technician"
    ? t("Campo activo", "Trabajo de campo")
    : t("Operativa de oficina", "Operativa de oficina");

  return (
    <div className="workspace-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <span className="hero-panel__eyebrow">{roleHeadline}</span>
          <h2>
            {t("Todo lo importante del día en una sola vista.", "Alles Wichtige des Tages in einer Oberfläche.")}
          </h2>
          <p>
            {userRole === "technician"
              ? t(
                  "Retoma borradores, prepara la empresa destinataria correcta y avanza el informe desde el móvil sin perder contexto.",
                  "Entwürfe fortsetzen, das richtige Zielunternehmen vorbereiten und den Bericht mobil ohne Kontextverlust weiterführen."
                )
              : t(
                  "Coordina agenda, clientes e informes pendientes con una vista más clara para oficina.",
                  "Agenda, Kunden und offene Berichte mit einer klareren Office-Sicht steuern."
                )}
          </p>
        </div>

        <div className="hero-panel__actions">
          <label className="hero-panel__field">
            <span>{t("Empresa destinataria", "Zielunternehmen")}</span>
            <select value={companyId} onChange={(event) => onCompanyChange(event.target.value as CompanyId | "")}>
              <option value="">{t("Sin logo específico", "Kein spezielles Logo")}</option>
              {COMPANY_OPTIONS.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
            {creating ? t("Preparando informe...", "Bericht wird vorbereitet...") : t("Crear informe", "Bericht starten")}
          </button>

          <div className="hero-panel__status-row">
            <StatusChip tone={priorityDraft ? "warning" : "neutral"}>
              {priorityDraft ? t("Borrador listo para retomar", "Entwurf bereit zum Fortsetzen") : t("Sin borradores activos", "Keine aktiven Entwürfe")}
            </StatusChip>
            <StatusChip tone={nextVisit ? "info" : "neutral"}>
              {nextVisit ? t("Visita planificada", "Termin geplant") : t("Sin visitas próximas", "Keine nächsten Termine")}
            </StatusChip>
          </div>
        </div>
      </section>

      <SectionCard
        title={t("Prioridades de hoy", "Prioritäten heute")}
        eyebrow={t("Acción", "Aktion")}
        description={t("Las tres acciones principales al entrar en la app.", "Die drei wichtigsten Aktionen direkt beim Einstieg.")}
      >
        <div className="priority-grid">
          <button type="button" className="priority-card priority-card--draft" onClick={() => priorityDraft ? onOpenReport(priorityDraft.id) : onJumpTo("reports")}>
            <small>{t("Continuar", "Fortsetzen")}</small>
            <strong>{priorityDraft ? priorityDraft.projectNumber : t("Sin borrador activo", "Kein aktiver Entwurf")}</strong>
            <span>
              {priorityDraft
                ? priorityDraft.objectLabel || t("Abrir y seguir completando el informe.", "Öffnen und Bericht weiter ausfüllen.")
                : t("Ve a trabajo para crear o retomar un informe.", "Gehe zu Arbeit, um einen Bericht zu erstellen oder fortzusetzen.")}
            </span>
          </button>

          <button type="button" className="priority-card priority-card--create" disabled={!isOnline || creating} onClick={onCreateReport}>
            <small>{t("Crear", "Erstellen")}</small>
            <strong>{creating ? t("Preparando informe...", "Bericht wird vorbereitet...") : t("Nuevo informe", "Neuer Bericht")}</strong>
            <span>{t("Empieza una visita nueva con el flujo guiado y guardado continuo.", "Starte einen neuen Einsatz mit geführtem Ablauf und Autosave.")}</span>
          </button>

          <button type="button" className="priority-card priority-card--visit" onClick={() => nextVisit ? onOpenReport(nextVisit.id) : onJumpTo("agenda")}>
            <small>{t("Plan", "Plan")}</small>
            <strong>{nextVisit ? nextVisit.projectNumber : t("Siguiente visita", "Nächster Einsatz")}</strong>
            <span>
              {nextVisit?.appointmentDate
                ? new Date(nextVisit.appointmentDate).toLocaleString(locale)
                : t("Abre la agenda para ver lo programado.", "Öffne die Agenda, um geplante Einsätze zu sehen.")}
            </span>
          </button>
        </div>
      </SectionCard>

      <section className="metric-grid metric-grid--secondary">
        <article className="metric-card metric-card--secondary">
          <span>{t("Borradores activos", "Aktive Entwürfe")}</span>
          <strong>{openDrafts.length}</strong>
          <small>{t("Listos para retomar desde campo u oficina.", "Direkt aus Feld oder Büro fortsetzbar.")}</small>
        </article>
        <article className="metric-card metric-card--secondary">
          <span>{t("Visitas próximas", "Nächste Termine")}</span>
          <strong>{pendingVisits.length}</strong>
          <small>{t("Basadas en los informes ya creados.", "Abgeleitet aus den vorhandenen Berichten.")}</small>
        </article>
        <article className="metric-card metric-card--secondary">
          <span>{t("Clientes activos", "Aktive Kunden")}</span>
          <strong>{clients.length}</strong>
          <small>{t("Con historial accesible desde la ficha.", "Mit Historie direkt aus der Kundenkarte.")}</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <SectionCard
          title={t("Atajos operativos", "Operative Abkürzungen")}
          eyebrow={t("Navegar", "Navigieren")}
          description={t("Accede a las áreas clave sin perder el foco del día.", "Springe in die wichtigsten Bereiche, ohne den Tagesfokus zu verlieren.")}
        >
          <div className="quick-actions">
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("agenda")}>
              <strong>{t("Ver agenda", "Agenda öffnen")}</strong>
              <span>{t("Calendario y lista del día.", "Kalender und Tagesliste.")}</span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("clients")}>
              <strong>{t("Abrir clientes", "Kunden öffnen")}</strong>
              <span>{t("Busca contactos e historial.", "Kontakte und Historie finden.")}</span>
            </button>
            <button type="button" className="quick-action-card" onClick={() => onJumpTo("reports")}>
              <strong>{t("Revisar informes", "Berichte prüfen")}</strong>
              <span>{t("Borradores, finales y envíos.", "Entwürfe, Finale und Versand.")}</span>
            </button>
          </div>
        </SectionCard>

        <SectionCard
          className="section-card--quiet"
          title={t("Actividad reciente", "Letzte Aktivität")}
          eyebrow={t("Live", "Live")}
          description={t("Tus últimos movimientos, con menos protagonismo que la acción principal.", "Deine letzten Bewegungen, bewusst leiser als die Hauptaktion.")}
        >
          {reports.length === 0 ? (
            <EmptyState
              title={t("Aún no hay actividad", "Noch keine Aktivität")}
              description={t("Crea el primer informe para empezar a poblar la vista operativa.", "Erstelle den ersten Bericht, um die operative Sicht zu starten.")}
              action={
                <button type="button" disabled={!isOnline || creating} onClick={onCreateReport}>
                  {creating ? t("Preparando...", "Wird vorbereitet...") : t("Crear primer informe", "Ersten Bericht erstellen")}
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
                      {item.status === "finalized" ? t("Final", "Final") : t("Borrador", "Entwurf")}
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
        <span>{user.displayName?.trim() || user.email?.trim() || "User"}</span>
        <small>{t("Nueva experiencia mobile-first activa.", "Neue mobile-first Erfahrung aktiv.")}</small>
      </div>
    </div>
  );
};

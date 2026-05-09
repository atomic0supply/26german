import { createTranslator, Language, localeForLanguage } from "../i18n";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";
import { VisitItem } from "./VisitCalendar";

interface VisitListProps {
  visits: VisitItem[];
  language: Language;
  onOpenReport?: (reportId: string) => void;
  onNotifyVisit?: (reportId: string) => void;
  notifyingVisitId?: string;
  isOnline?: boolean;
}

export const VisitList = ({ visits, language, onOpenReport, onNotifyVisit, notifyingVisitId = "", isOnline = true }: VisitListProps) => {
  const t = createTranslator(language);
  const locale = localeForLanguage(language);

  return (
    <SectionCard
      title={t("Operative Liste", "Lista operativa")}
      eyebrow={t("Agenda", "Agenda")}
      description={t("Termine nach Priorität und Status gruppiert.", "Visitas agrupadas por prioridad y estado.")}
    >
      <div className="visit-list">
        {visits.map((visit) => (
          <article key={visit.id} className="visit-card">
            <div className="visit-card__header">
              <div>
                <strong>{visit.title}</strong>
                <p>{visit.address}</p>
              </div>
              <StatusChip tone={visit.status === "done" ? "success" : visit.status === "draft" ? "warning" : "info"}>
                {visit.status === "done"
                  ? t("Abgeschlossen", "Completada")
                  : visit.status === "draft"
                    ? t("Bericht läuft", "Informe en curso")
                    : t("Geplant", "Programada")}
              </StatusChip>
            </div>
            <div className="visit-card__meta">
              <span>{new Date(visit.when).toLocaleString(locale)}</span>
              <span>{visit.durationMinutes ? t(`${visit.durationMinutes} Min.`, `${visit.durationMinutes} min`) : t("60 Min.", "60 min")}</span>
              <span>{visit.technician}</span>
            </div>
            {visit.clientLabel && <small>{visit.clientLabel}</small>}
            <div className="row">
              {visit.reportId && (
                <button type="button" className="ghost" onClick={() => onOpenReport?.(visit.reportId!)}>
                  {t("Bericht öffnen", "Abrir informe")}
                </button>
              )}
              {visit.reportId && (
                <button
                  type="button"
                  disabled={!isOnline || !onNotifyVisit || !visit.notificationRecipient || notifyingVisitId === visit.reportId}
                  onClick={() => onNotifyVisit?.(visit.reportId!)}
                >
                  {notifyingVisitId === visit.reportId
                    ? t("Benachrichtigt...", "Notificando...")
                    : visit.notificationSentAt
                      ? t("E-Mail erneut senden", "Reenviar correo")
                      : t("Per E-Mail benachrichtigen", "Notificar por correo")}
                </button>
              )}
            </div>
            {visit.notificationSentAt && (
              <small>
                {t("E-Mail gesendet", "Correo enviado")}: {new Date(visit.notificationSentAt).toLocaleString(locale)}
              </small>
            )}
          </article>
        ))}
      </div>
    </SectionCard>
  );
};

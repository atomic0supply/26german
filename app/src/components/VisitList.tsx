import { Language, localeForLanguage, translate } from "../i18n";
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
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);

  return (
    <SectionCard
      title={t("Lista operativa", "Operative Liste")}
      eyebrow={t("Agenda", "Agenda")}
      description={t("Visitas agrupadas por prioridad y estado.", "Termine nach Priorität und Status gruppiert.")}
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
                  ? t("Completada", "Abgeschlossen")
                  : visit.status === "draft"
                    ? t("Informe en curso", "Bericht läuft")
                    : t("Programada", "Geplant")}
              </StatusChip>
            </div>
            <div className="visit-card__meta">
              <span>{new Date(visit.when).toLocaleString(locale)}</span>
              <span>{visit.durationMinutes ? t(`${visit.durationMinutes} min`, `${visit.durationMinutes} Min.`) : t("60 min", "60 Min.")}</span>
              <span>{visit.technician}</span>
            </div>
            {visit.clientLabel && <small>{visit.clientLabel}</small>}
            <div className="row">
              {visit.reportId && (
                <button type="button" className="ghost" onClick={() => onOpenReport?.(visit.reportId!)}>
                  {t("Abrir informe", "Bericht öffnen")}
                </button>
              )}
              {visit.reportId && (
                <button
                  type="button"
                  disabled={!isOnline || !onNotifyVisit || !visit.notificationRecipient || notifyingVisitId === visit.reportId}
                  onClick={() => onNotifyVisit?.(visit.reportId!)}
                >
                  {notifyingVisitId === visit.reportId
                    ? t("Notificando...", "Benachrichtigt...")
                    : visit.notificationSentAt
                      ? t("Reenviar correo", "E-Mail erneut senden")
                      : t("Notificar por correo", "Per E-Mail benachrichtigen")}
                </button>
              )}
            </div>
            {visit.notificationSentAt && (
              <small>
                {t("Correo enviado", "E-Mail gesendet")}: {new Date(visit.notificationSentAt).toLocaleString(locale)}
              </small>
            )}
          </article>
        ))}
      </div>
    </SectionCard>
  );
};

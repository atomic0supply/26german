import { useState } from "react";
import {
  Building2,
  Clock,
  Edit3,
  FileText,
  MapPin,
  Mail,
  User as UserIcon,
  Bell,
  Plus
} from "lucide-react";
import { createTranslator, Language } from "../../i18n";
import { Dialog } from "../ui/Dialog";
import { StatusChip } from "../ui/StatusChip";
import { fmtDateLong, fmtTime, durationToMinutes, pad } from "./helpers";
import type { VisitItem } from "./types";

export interface EventDetailModalProps {
  visit: VisitItem | null;
  open: boolean;
  language: Language;
  locale: string;
  onClose: () => void;
  onOpenReport?: (reportId: string) => void;
  onOpenLeckortung?: (reportId: string) => void;
  onGeneratePdf?: (reportId: string) => void;
  onReschedule?: (reportId: string, date: string, time: string) => void;
}

const statusTone = (status: VisitItem["status"]) => {
  if (status === "done") return "success" as const;
  if (status === "draft") return "warning" as const;
  return "info" as const;
};

export const EventDetailModal = ({
  visit,
  open,
  language,
  locale,
  onClose,
  onOpenReport,
  onOpenLeckortung,
  onGeneratePdf,
  onReschedule
}: EventDetailModalProps) => {
  const t = createTranslator(language);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  if (!visit) return null;

  const date = visit.when.slice(0, 10);
  const start = fmtTime(visit.when, locale);
  const durationMinutes = durationToMinutes(visit.durationMinutes);
  const endDate = new Date(visit.when);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  const end = endDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const statusLabels: Record<VisitItem["status"], string> = {
    scheduled: t("Geplant", "Programado"),
    draft: t("Entwurf", "Borrador"),
    done: t("Fertig", "Completado")
  };

  const beginReschedule = () => {
    setNewDate(date);
    const d = new Date(visit.when);
    setNewTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setRescheduling(true);
  };

  const confirmReschedule = () => {
    if (!visit.reportId || !newDate || !newTime || !onReschedule) return;
    onReschedule(visit.reportId, newDate, newTime);
    setRescheduling(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={visit.title}
      description={`${fmtDateLong(date, locale)} · ${start} – ${end}`}
      onClose={onClose}
      size="default"
      footer={
        <div className="cal-detail__actions">
          {visit.reportId && onOpenReport ? (
            <button
              type="button"
              className="cal-detail__btn cal-detail__btn--primary"
              onClick={() => {
                onOpenReport(visit.reportId!);
                onClose();
              }}
            >
              <FileText size={16} aria-hidden="true" />
              {t("Bericht öffnen", "Abrir informe")}
            </button>
          ) : null}
          {visit.reportId && onOpenLeckortung ? (
            <button
              type="button"
              className="cal-detail__btn"
              onClick={() => {
                onOpenLeckortung(visit.reportId!);
                onClose();
              }}
            >
              <Plus size={16} aria-hidden="true" />
              {t("Leckortung", "Leckortung")}
            </button>
          ) : null}
          {visit.reportId && onGeneratePdf && visit.status === "done" ? (
            <button
              type="button"
              className="cal-detail__btn"
              onClick={() => {
                onGeneratePdf(visit.reportId!);
                onClose();
              }}
            >
              <FileText size={16} aria-hidden="true" />
              {t("PDF generieren", "Generar PDF")}
            </button>
          ) : null}
          {visit.reportId && onReschedule && !rescheduling ? (
            <button type="button" className="cal-detail__btn" onClick={beginReschedule}>
              <Edit3 size={16} aria-hidden="true" />
              {t("Termin verschieben", "Reprogramar")}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="cal-detail">
        <div className="cal-detail__status">
          <StatusChip tone={statusTone(visit.status)}>
            {statusLabels[visit.status]}
          </StatusChip>
        </div>

        <dl className="cal-detail__list">
          {visit.address ? (
            <div className="cal-detail__row">
              <dt>
                <MapPin size={14} aria-hidden="true" />
                {t("Messort", "Ubicación")}
              </dt>
              <dd>{visit.address}</dd>
            </div>
          ) : null}

          {visit.clientLabel ? (
            <div className="cal-detail__row">
              <dt>
                <UserIcon size={14} aria-hidden="true" />
                {t("Ansprechpartner", "Contacto")}
              </dt>
              <dd>{visit.clientLabel}</dd>
            </div>
          ) : null}

          {visit.clientEmail ? (
            <div className="cal-detail__row">
              <dt>
                <Mail size={14} aria-hidden="true" />
                {t("E-Mail", "Email")}
              </dt>
              <dd>{visit.clientEmail}</dd>
            </div>
          ) : null}

          {visit.partnerLabel ? (
            <div className="cal-detail__row">
              <dt>
                <Building2 size={14} aria-hidden="true" />
                {t("Partner", "Partner")}
              </dt>
              <dd>{visit.partnerLabel}</dd>
            </div>
          ) : null}

          <div className="cal-detail__row">
            <dt>
              <UserIcon size={14} aria-hidden="true" />
              {t("Techniker", "Técnico")}
            </dt>
            <dd>{visit.technician}</dd>
          </div>

          <div className="cal-detail__row">
            <dt>
              <Clock size={14} aria-hidden="true" />
              {t("Dauer", "Duración")}
            </dt>
            <dd>{durationMinutes} min</dd>
          </div>

          {visit.notificationSentAt ? (
            <div className="cal-detail__row">
              <dt>
                <Bell size={14} aria-hidden="true" />
                {t("Benachrichtigung", "Notificación")}
              </dt>
              <dd>
                {t("Gesendet am", "Enviada el")}{" "}
                {new Date(visit.notificationSentAt).toLocaleDateString(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric"
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        {rescheduling ? (
          <div className="cal-detail__reschedule">
            <h4>{t("Neuer Termin", "Nueva fecha y hora")}</h4>
            <div className="cal-detail__reschedule-row">
              <label>
                {t("Datum", "Fecha")}
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </label>
              <label>
                {t("Zeit", "Hora")}
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </label>
            </div>
            <div className="cal-detail__reschedule-actions">
              <button type="button" className="cal-detail__btn" onClick={() => setRescheduling(false)}>
                {t("Abbrechen", "Cancelar")}
              </button>
              <button
                type="button"
                className="cal-detail__btn cal-detail__btn--primary"
                onClick={confirmReschedule}
                disabled={!newDate || !newTime}
              >
                {t("Speichern", "Guardar")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
};

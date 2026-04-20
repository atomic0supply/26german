import { Language, localeForLanguage, translate } from "../i18n";

export interface VisitItem {
  id: string;
  title: string;
  address: string;
  clientLabel?: string;
  technician: string;
  when: string;
  durationMinutes?: string;
  notificationRecipient?: string;
  notificationSentAt?: string;
  status: "scheduled" | "draft" | "done";
  reportId?: string;
}

interface VisitCalendarProps {
  visits: VisitItem[];
  selectedDate: string;
  language: Language;
  onSelectDate: (date: string) => void;
}

const buildWeek = (seed: string): string[] => {
  const start = new Date(seed);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
};

export const VisitCalendar = ({ visits, selectedDate, language, onSelectDate }: VisitCalendarProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const week = buildWeek(selectedDate);

  return (
    <div className="visit-calendar">
      {week.map((date) => {
        const count = visits.filter((visit) => visit.when.slice(0, 10) === date).length;
        const isActive = date === selectedDate;
        return (
          <button
            key={date}
            type="button"
            className={isActive ? "visit-calendar__day active" : "visit-calendar__day"}
            onClick={() => onSelectDate(date)}
          >
            <strong>{new Date(date).toLocaleDateString(locale, { weekday: "short" })}</strong>
            <span>{new Date(date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}</span>
            <small>{count === 0 ? t("Libre", "Frei") : t(`${count} visita(s)`, `${count} Termin(e)`)}</small>
          </button>
        );
      })}
    </div>
  );
};

import { useMemo } from "react";
import { CalendarPlus } from "lucide-react";
import { createTranslator, Language } from "../../i18n";
import { EmptyState } from "../ui/EmptyState";
import { EventCard } from "./EventCard";
import { addDays, relativeDayLabel } from "./helpers";
import type { VisitItem } from "./types";

export interface AgendaViewProps {
  visits: VisitItem[];
  today: string;
  language: Language;
  locale: string;
  onVisitOpen: (visit: VisitItem) => void;
  onCreateVisit?: () => void;
  daysAhead?: number;
}

export const AgendaView = ({
  visits,
  today,
  language,
  locale,
  onVisitOpen,
  onCreateVisit,
  daysAhead = 30
}: AgendaViewProps) => {
  const t = createTranslator(language);

  const upcoming = useMemo(() => {
    const cutoff = addDays(today, daysAhead);
    const list = visits
      .filter((v) => {
        const date = v.when.slice(0, 10);
        return date >= today && date <= cutoff;
      })
      .sort((a, b) => a.when.localeCompare(b.when));

    const groups = new Map<string, VisitItem[]>();
    for (const v of list) {
      const date = v.when.slice(0, 10);
      const arr = groups.get(date) ?? [];
      arr.push(v);
      groups.set(date, arr);
    }
    return Array.from(groups.entries());
  }, [visits, today, daysAhead]);

  if (upcoming.length === 0) {
    return (
      <EmptyState
        title={t("Keine bevorstehenden Termine", "Sin próximas visitas")}
        description={t(
          "Lege einen neuen Termin im Kalender an oder passe deine Filter an.",
          "Crea una nueva visita en el calendario o ajusta los filtros."
        )}
        action={
          onCreateVisit ? (
            <button type="button" className="cal-empty-cta" onClick={onCreateVisit}>
              <CalendarPlus size={16} aria-hidden="true" />
              {t("Neuer Einsatz", "Nueva visita")}
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="cal-agenda">
      {upcoming.map(([date, items]) => (
        <section key={date} className="cal-agenda__group">
          <header className="cal-agenda__group-head">
            <span className="cal-agenda__group-label">
              {relativeDayLabel(
                date,
                today,
                locale,
                t("Heute", "Hoy"),
                t("Morgen", "Mañana")
              )}
            </span>
            <span className="cal-agenda__group-count">{items.length}</span>
          </header>
          <ul className="cal-agenda__list">
            {items.map((visit) => (
              <li key={visit.id}>
                <EventCard
                  visit={visit}
                  locale={locale}
                  onClick={() => onVisitOpen(visit)}
                  variant="agenda"
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

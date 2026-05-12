import { useMemo } from "react";
import { createTranslator, Language } from "../../i18n";
import { EventCard } from "./EventCard";
import { addDays, fmtDateShort } from "./helpers";
import type { VisitItem } from "./types";

export interface UpcomingPanelProps {
  visits: VisitItem[];
  today: string;
  language: Language;
  locale: string;
  onVisitOpen: (visit: VisitItem) => void;
}

export const UpcomingPanel = ({
  visits,
  today,
  language,
  locale,
  onVisitOpen
}: UpcomingPanelProps) => {
  const t = createTranslator(language);

  const { todayItems, weekItems } = useMemo(() => {
    const weekEnd = addDays(today, 7);
    const sorted = [...visits].sort((a, b) => a.when.localeCompare(b.when));
    const todayItems = sorted.filter((v) => v.when.slice(0, 10) === today);
    const weekItems = sorted.filter((v) => {
      const date = v.when.slice(0, 10);
      return date > today && date <= weekEnd;
    });
    return { todayItems, weekItems: weekItems.slice(0, 6) };
  }, [visits, today]);

  return (
    <aside className="cal-upcoming">
      <section className="cal-upcoming__section">
        <header className="cal-upcoming__head">
          <span className="cal-upcoming__title">{t("Heute", "Hoy")}</span>
          <span className="cal-upcoming__count">{todayItems.length}</span>
        </header>
        {todayItems.length === 0 ? (
          <p className="cal-upcoming__empty">
            {t("Keine Termine heute.", "Sin visitas hoy.")}
          </p>
        ) : (
          <ul className="cal-upcoming__list">
            {todayItems.map((v) => (
              <li key={v.id}>
                <EventCard
                  visit={v}
                  locale={locale}
                  onClick={() => onVisitOpen(v)}
                  variant="compact"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cal-upcoming__section">
        <header className="cal-upcoming__head">
          <span className="cal-upcoming__title">
            {t("Diese Woche", "Esta semana")}
          </span>
          <span className="cal-upcoming__count">{weekItems.length}</span>
        </header>
        {weekItems.length === 0 ? (
          <p className="cal-upcoming__empty">
            {t("Keine weiteren Termine.", "Sin más visitas.")}
          </p>
        ) : (
          <ul className="cal-upcoming__list">
            {weekItems.map((v) => (
              <li key={v.id}>
                <div className="cal-upcoming__date">
                  {fmtDateShort(v.when.slice(0, 10), locale)}
                </div>
                <EventCard
                  visit={v}
                  locale={locale}
                  onClick={() => onVisitOpen(v)}
                  variant="compact"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
};

import { CalendarDays, ChevronLeft, ChevronRight, LayoutList } from "lucide-react";
import { createTranslator, Language } from "../../i18n";
import type { CalendarView } from "./types";

export interface CalendarHeaderProps {
  view: CalendarView;
  onViewChange: (next: CalendarView) => void;
  title: string;
  onPrev?: () => void;
  onNext?: () => void;
  onToday: () => void;
  language: Language;
}

export const CalendarHeader = ({
  view,
  onViewChange,
  title,
  onPrev,
  onNext,
  onToday,
  language
}: CalendarHeaderProps) => {
  const t = createTranslator(language);

  const showNav = view !== "agenda";

  return (
    <header className="cal-header">
      <div className="cal-header__left">
        {showNav && onPrev ? (
          <button
            type="button"
            className="cal-header__nav-btn"
            onClick={onPrev}
            aria-label={t("Zurück", "Anterior")}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <h3 className="cal-header__title">{title}</h3>
        {showNav && onNext ? (
          <button
            type="button"
            className="cal-header__nav-btn"
            onClick={onNext}
            aria-label={t("Weiter", "Siguiente")}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="cal-header__right">
        <button type="button" className="cal-header__today" onClick={onToday}>
          {t("Heute", "Hoy")}
        </button>
        <div className="cal-header__views" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "week"}
            className={view === "week" ? "cal-header__view-tab active" : "cal-header__view-tab"}
            onClick={() => onViewChange("week")}
          >
            <CalendarDays size={14} aria-hidden="true" />
            <span>{t("Woche", "Semana")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "month"}
            className={view === "month" ? "cal-header__view-tab active" : "cal-header__view-tab"}
            onClick={() => onViewChange("month")}
          >
            <CalendarDays size={14} aria-hidden="true" />
            <span>{t("Monat", "Mes")}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "agenda"}
            className={view === "agenda" ? "cal-header__view-tab active" : "cal-header__view-tab"}
            onClick={() => onViewChange("agenda")}
          >
            <LayoutList size={14} aria-hidden="true" />
            <span>{t("Agenda", "Agenda")}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

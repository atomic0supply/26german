import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createTranslator, Language, localeForLanguage } from "../i18n";
import { EmptyState } from "./ui/EmptyState";
import { AgendaView } from "./calendar/AgendaView";
import { CalendarHeader } from "./calendar/CalendarHeader";
import { EventDetailModal } from "./calendar/EventDetailModal";
import { EventFilters } from "./calendar/EventFilters";
import { MonthGridView } from "./calendar/MonthGrid";
import { UpcomingPanel } from "./calendar/UpcomingPanel";
import { WeekGrid } from "./calendar/WeekGrid";
import {
  buildMonthGrid,
  buildWeekDays,
  fmtMonthLabel,
  fmtWeekLabel,
  groupByDate,
  toLocalDateString
} from "./calendar/helpers";
import type { CalendarStatusFilter, CalendarView, VisitItem } from "./calendar/types";

export type { VisitItem } from "./calendar/types";

export interface VisitCalendarProps {
  visits: VisitItem[];
  selectedDate: string;
  language: Language;
  onSelectDate: (date: string) => void;
  onSlotClick?: (date: string, time: string) => void;
  onVisitClick?: (reportId: string) => void;
  onMoveVisit?: (reportId: string, newDate: string, newTime: string) => void;
  onResizeVisit?: (reportId: string, newDurationMinutes: string) => void;
  onOpenLeckortung?: (reportId: string) => void;
  onGeneratePdf?: (reportId: string) => void;
  loading?: boolean;
}

const isMobileViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

export const VisitCalendar = ({
  visits,
  selectedDate,
  language,
  onSelectDate,
  onSlotClick,
  onVisitClick,
  onMoveVisit,
  onResizeVisit,
  onOpenLeckortung,
  onGeneratePdf,
  loading = false
}: VisitCalendarProps) => {
  const t = createTranslator(language);
  const locale = localeForLanguage(language);
  const today = toLocalDateString(new Date());

  const [view, setView] = useState<CalendarView>(() =>
    isMobileViewport() ? "agenda" : "week"
  );
  const [navMonth, setNavMonth] = useState(() => {
    const b = new Date(selectedDate + "T00:00:00");
    return { year: b.getFullYear(), month: b.getMonth() };
  });
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("");
  const [detailVisit, setDetailVisit] = useState<VisitItem | null>(null);

  const partners = useMemo(() => {
    const set = new Set<string>();
    for (const v of visits) {
      if (v.partnerLabel) set.add(v.partnerLabel);
    }
    return Array.from(set).sort();
  }, [visits]);

  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (partnerFilter && v.partnerLabel !== partnerFilter) return false;
      return true;
    });
  }, [visits, statusFilter, partnerFilter]);

  const visitsByDate = useMemo(() => groupByDate(filteredVisits), [filteredVisits]);
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const monthGrid = useMemo(
    () => buildMonthGrid(navMonth.year, navMonth.month),
    [navMonth.year, navMonth.month]
  );

  const headerTitle = useMemo(() => {
    if (view === "week") return fmtWeekLabel(weekDays, locale, t("KW", "Sem."));
    if (view === "month") return fmtMonthLabel(navMonth.year, navMonth.month, locale);
    return t("Nächste Termine", "Próximas visitas");
  }, [view, weekDays, locale, t, navMonth.year, navMonth.month]);

  const handleNavMonth = (delta: -1 | 1) =>
    setNavMonth((cur) => {
      let m = cur.month + delta;
      let y = cur.year;
      if (m < 0) {
        m = 11;
        y--;
      }
      if (m > 11) {
        m = 0;
        y++;
      }
      return { year: y, month: m };
    });

  const handleSelectFromMonth = (date: string) => {
    onSelectDate(date);
    const b = new Date(date + "T00:00:00");
    setNavMonth({ year: b.getFullYear(), month: b.getMonth() });
    setView("week");
  };

  const handlePrev = () => {
    if (view === "week") {
      const d = new Date(weekDays[0] + "T00:00:00");
      d.setDate(d.getDate() - 7);
      onSelectDate(toLocalDateString(d));
    } else if (view === "month") {
      handleNavMonth(-1);
    }
  };

  const handleNext = () => {
    if (view === "week") {
      const d = new Date(weekDays[6] + "T00:00:00");
      d.setDate(d.getDate() + 1);
      onSelectDate(toLocalDateString(d));
    } else if (view === "month") {
      handleNavMonth(1);
    }
  };

  const handleToday = () => {
    onSelectDate(today);
    const now = new Date();
    setNavMonth({ year: now.getFullYear(), month: now.getMonth() });
  };

  const openDetail = (visit: VisitItem) => setDetailVisit(visit);
  const closeDetail = () => setDetailVisit(null);

  const handleQuickCreate = () => {
    onSlotClick?.(today, "09:00");
  };

  const showSidebar = view !== "agenda";
  const hasAnyVisits = visits.length > 0;
  const hasFilteredVisits = filteredVisits.length > 0;

  return (
    <div className="visit-calendar">
      <CalendarHeader
        view={view}
        onViewChange={setView}
        title={headerTitle}
        onPrev={view !== "agenda" ? handlePrev : undefined}
        onNext={view !== "agenda" ? handleNext : undefined}
        onToday={handleToday}
        language={language}
      />

      <EventFilters
        visits={visits}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        partnerFilter={partnerFilter}
        partners={partners}
        onPartnerChange={setPartnerFilter}
        language={language}
      />

      {loading ? (
        <div className="cal-skeleton" aria-busy="true" aria-live="polite">
          <div className="cal-skeleton__row" />
          <div className="cal-skeleton__row" />
          <div className="cal-skeleton__row" />
        </div>
      ) : (
        <div className={["visit-calendar__layout", !showSidebar && "visit-calendar__layout--full"]
          .filter(Boolean)
          .join(" ")}
        >
          <div className="visit-calendar__main">
            {view === "week" && (
              <WeekGrid
                days={weekDays}
                visitsByDate={visitsByDate}
                selectedDate={selectedDate}
                language={language}
                locale={locale}
                today={today}
                onSelectDate={onSelectDate}
                onSlotClick={onSlotClick}
                onVisitOpen={openDetail}
                onMoveVisit={onMoveVisit}
                onResizeVisit={onResizeVisit}
              />
            )}
            {view === "month" && (
              <MonthGridView
                grid={monthGrid}
                visitsByDate={visitsByDate}
                selectedDate={selectedDate}
                today={today}
                language={language}
                onSelectDate={handleSelectFromMonth}
              />
            )}
            {view === "agenda" && (
              <AgendaView
                visits={filteredVisits}
                today={today}
                language={language}
                locale={locale}
                onVisitOpen={openDetail}
                onCreateVisit={onSlotClick ? handleQuickCreate : undefined}
              />
            )}

            {view !== "agenda" && !hasFilteredVisits && hasAnyVisits && (
              <div className="cal-empty cal-empty--inline">
                <EmptyState
                  title={t("Keine Termine in dieser Auswahl", "Sin visitas en esta selección")}
                  description={t(
                    "Passe die Filter an oder lege einen neuen Termin an.",
                    "Ajusta los filtros o crea una nueva visita."
                  )}
                  action={
                    onSlotClick ? (
                      <button
                        type="button"
                        className="cal-empty-cta"
                        onClick={handleQuickCreate}
                      >
                        <CalendarPlus size={16} aria-hidden="true" />
                        {t("Neuer Einsatz", "Nueva visita")}
                      </button>
                    ) : null
                  }
                />
              </div>
            )}

            {!hasAnyVisits && view !== "agenda" && (
              <div className="cal-empty cal-empty--inline">
                <EmptyState
                  title={t("Noch keine Termine", "Aún no hay visitas")}
                  description={t(
                    "Lege deinen ersten Einsatz an, um die Agenda zu starten.",
                    "Crea tu primera visita para empezar la agenda."
                  )}
                  action={
                    onSlotClick ? (
                      <button
                        type="button"
                        className="cal-empty-cta"
                        onClick={handleQuickCreate}
                      >
                        <CalendarPlus size={16} aria-hidden="true" />
                        {t("Neuer Einsatz", "Nueva visita")}
                      </button>
                    ) : null
                  }
                />
              </div>
            )}
          </div>

          {showSidebar && (
            <UpcomingPanel
              visits={filteredVisits}
              today={today}
              language={language}
              locale={locale}
              onVisitOpen={openDetail}
            />
          )}
        </div>
      )}

      <EventDetailModal
        visit={detailVisit}
        open={!!detailVisit}
        language={language}
        locale={locale}
        onClose={closeDetail}
        onOpenReport={onVisitClick}
        onOpenLeckortung={onOpenLeckortung}
        onGeneratePdf={onGeneratePdf}
        onReschedule={onMoveVisit}
      />
    </div>
  );
};

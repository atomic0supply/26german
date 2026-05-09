import { useEffect, useMemo, useRef, useState } from "react";
import { Language, localeForLanguage, translate } from "../i18n";

// ─── Public types ─────────────────────────────────────────────────────────────

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

export interface VisitCalendarProps {
  visits: VisitItem[];
  selectedDate: string;
  language: Language;
  onSelectDate: (date: string) => void;
  onSlotClick?: (date: string, time: string) => void;
  onVisitClick?: (reportId: string) => void;
  onMoveVisit?: (reportId: string, newDate: string, newTime: string) => void;
  onResizeVisit?: (reportId: string, newDurationMinutes: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64;   // px per hour
const FIRST_HOUR  = 7;    // 07:00
const LAST_HOUR   = 21;   // renders up to 20:00
const TIME_COL_PX = 56;   // width of the left time-label column (3.5rem @ 16px)
const SNAP_MINS   = 15;   // snap-to grid for drag
const MIN_DURATION_MINS = 15;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;

// ─── Drag state ───────────────────────────────────────────────────────────────

interface DragState {
  mode: "move" | "resize";
  visit: VisitItem;
  /** Current preview position */
  previewDate: string;
  previewHour: number;
  previewMinute: number;
  previewDurationMinutes: number;
  /** Set to true after the first mousemove — prevents click firing on mouseup */
  moved: boolean;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const pad = (n: number) => n.toString().padStart(2, "0");
const toLocalDateString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const buildWeekDays = (seed: string): string[] => {
  const base = new Date(seed + "T00:00:00");
  const dow = base.getDay();
  base.setDate(base.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return toLocalDateString(d);
  });
};

interface MonthCell { date: string; isCurrentMonth: boolean; }
type MonthGrid = MonthCell[][];

const buildMonthGrid = (year: number, month: number): MonthGrid => {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  let startDow = first.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const cells: MonthCell[] = [];
  for (let i = startDow - 1; i >= 0; i--)
    cells.push({ date: toLocalDateString(new Date(year, month, -i)), isCurrentMonth: false });
  for (let d = 1; d <= last.getDate(); d++)
    cells.push({ date: toLocalDateString(new Date(year, month, d)), isCurrentMonth: true });
  const rem = cells.length % 7;
  if (rem > 0)
    for (let i = 1; i <= 7 - rem; i++)
      cells.push({ date: toLocalDateString(new Date(year, month + 1, i)), isCurrentMonth: false });
  const grid: MonthGrid = [];
  for (let r = 0; r < cells.length / 7; r++) grid.push(cells.slice(r * 7, r * 7 + 7));
  return grid;
};

const groupByDate = (visits: VisitItem[]): Map<string, VisitItem[]> => {
  const map = new Map<string, VisitItem[]>();
  for (const v of visits) {
    const key = v.when.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return map;
};

const fmtTime = (when: string, locale: string) => {
  try { return new Date(when).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }); }
  catch { return when.slice(11, 16); }
};

const durationToMinutes = (durationMinutes?: string) => {
  const parsed = parseInt(durationMinutes ?? "60", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
};

const eventTop = (when: string) => {
  const d = new Date(when);
  return Math.max(0, ((d.getHours() * 60 + d.getMinutes() - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT);
};

const eventHeight = (durationMinutes?: string | number) => {
  const minutes = typeof durationMinutes === "number" ? durationMinutes : durationToMinutes(durationMinutes);
  return Math.max(HOUR_HEIGHT / 4, (minutes / 60) * HOUR_HEIGHT);
};

// ─── View Toggle ──────────────────────────────────────────────────────────────

const ViewToggle = ({ view, onChange, language }: {
  view: "week" | "month"; onChange: (v: "week" | "month") => void; language: Language;
}) => {
  const t = (es: string, de: string) => translate(language, de, es);
  return (
    <div className="cal-toggle" role="tablist">
      <button role="tab" type="button" aria-selected={view === "week"}
        className={view === "week" ? "cal-toggle__tab active" : "cal-toggle__tab"}
        onClick={() => onChange("week")}>{t("Semana", "Woche")}</button>
      <button role="tab" type="button" aria-selected={view === "month"}
        className={view === "month" ? "cal-toggle__tab active" : "cal-toggle__tab"}
        onClick={() => onChange("month")}>{t("Mes", "Monat")}</button>
    </div>
  );
};

// ─── Week Grid ────────────────────────────────────────────────────────────────

const WeekGrid = ({
  days, visitsByDate, selectedDate, language, locale, today,
  onSelectDate, onSlotClick, onVisitClick, onMoveVisit, onResizeVisit, onPrevWeek, onNextWeek, onToday,
}: {
  days: string[];
  visitsByDate: Map<string, VisitItem[]>;
  selectedDate: string;
  language: Language;
  locale: string;
  today: string;
  onSelectDate: (date: string) => void;
  onSlotClick?: (date: string, time: string) => void;
  onVisitClick?: (reportId: string) => void;
  onMoveVisit?: (reportId: string, newDate: string, newTime: string) => void;
  onResizeVisit?: (reportId: string, newDurationMinutes: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}) => {
  const t = (es: string, de: string) => translate(language, de, es);

  // ── Current time ──────────────────────────────────────────────────────────
  const [nowMins, setNowMins] = useState(() => {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date(); setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const nowTop   = ((nowMins - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT;
  const nowVisible = nowMins >= FIRST_HOUR * 60 && nowMins < LAST_HOUR * 60;

  // ── Drag state ────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollTop = el.scrollTop;

      if (drag.mode === "move") {
        const relX = e.clientX - rect.left - TIME_COL_PX;
        const colW = Math.max(1, (el.clientWidth - TIME_COL_PX) / days.length);
        const dayIdx = Math.max(0, Math.min(days.length - 1, Math.floor(relX / colW)));

        const relY = e.clientY - rect.top + scrollTop;
        const rawMins = FIRST_HOUR * 60 + (relY / HOUR_HEIGHT) * 60;
        const snapped = Math.round(rawMins / SNAP_MINS) * SNAP_MINS;
        const clamped = Math.max(FIRST_HOUR * 60, Math.min((LAST_HOUR - 1) * 60 + 45, snapped));
        const hour = Math.floor(clamped / 60);
        const minute = clamped % 60;

        setDrag((prev) => prev ? {
          ...prev,
          moved: true,
          previewDate: days[dayIdx],
          previewHour: hour,
          previewMinute: minute
        } : null);
        return;
      }

      const relY = e.clientY - rect.top + scrollTop;
      const rawMins = FIRST_HOUR * 60 + (relY / HOUR_HEIGHT) * 60;
      const snapped = Math.round(rawMins / SNAP_MINS) * SNAP_MINS;
      const startMinutes = drag.previewHour * 60 + drag.previewMinute;
      const clampedEnd = Math.max(startMinutes + MIN_DURATION_MINS, Math.min(LAST_HOUR * 60, snapped));

      setDrag((prev) => prev ? {
        ...prev,
        moved: true,
        previewDurationMinutes: clampedEnd - startMinutes
      } : null);
    };

    const onUp = () => {
      if (drag.mode === "move" && drag.moved && drag.visit.reportId) {
        onMoveVisit?.(drag.visit.reportId, drag.previewDate, `${pad(drag.previewHour)}:${pad(drag.previewMinute)}`);
      }
      if (drag.mode === "resize" && drag.moved && drag.visit.reportId) {
        onResizeVisit?.(drag.visit.reportId, String(drag.previewDurationMinutes));
      }
      setDrag(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = drag.mode === "resize" ? "ns-resize" : "grabbing";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [drag, days, onMoveVisit, onResizeVisit]);

  // ── Week label ────────────────────────────────────────────────────────────
  const weekLabel = (() => {
    if (!days.length) return "";
    const from = new Date(days[0] + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
    const to   = new Date(days[6] + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    return `${from} – ${to}`;
  })();

  return (
    <div className={drag ? "week-grid week-grid--dragging" : "week-grid"}>

      {/* ── Week navigation bar ── */}
      <div className="week-grid__topbar">
        <button type="button" className="week-grid__nav-btn" onClick={onPrevWeek} aria-label={t("Semana anterior", "Vorherige Woche")}>‹</button>
        <button type="button" className="week-grid__today-btn" onClick={onToday}>{t("Hoy", "Heute")}</button>
        <span className="week-grid__week-label">{weekLabel}</span>
        <button type="button" className="week-grid__nav-btn" onClick={onNextWeek} aria-label={t("Semana siguiente", "Nächste Woche")}>›</button>
      </div>

      {/* ── Day headers ── */}
      <div className="week-grid__header">
        <div className="week-grid__corner" />
        {days.map((date) => {
          const isToday    = date === today;
          const isSelected = date === selectedDate;
          return (
            <button key={date} type="button"
              className={["week-grid__day-head", isToday && "today", isSelected && "selected"].filter(Boolean).join(" ")}
              onClick={() => onSelectDate(date)}>
              <strong>{parseInt(date.slice(8), 10)}</strong>
              <span>{new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short" })}</span>
            </button>
          );
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div className="week-grid__scroll" ref={scrollRef}>
        <div className="week-grid__body">

          {/* Time labels */}
          <div className="week-grid__time-col">
            {HOURS.map(h => (
              <div key={h} className="week-grid__time-label">{pad(h)}:00</div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((date) => {
            const dayVisits  = visitsByDate.get(date) ?? [];
            const isToday    = date === today;
            const showNow    = isToday && nowVisible;
            const showPreview = drag?.previewDate === date;
            const previewTop = showPreview
              ? ((drag!.previewHour * 60 + drag!.previewMinute - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT
              : 0;
            const previewH = showPreview ? eventHeight(drag!.previewDurationMinutes) : 0;
            const previewEnd = showPreview
              ? drag!.previewHour * 60 + drag!.previewMinute + drag!.previewDurationMinutes
              : 0;

            return (
              <div key={date}
                className={["week-grid__day-col", isToday && "week-grid__day-col--today"].filter(Boolean).join(" ")}
                style={{ height: GRID_HEIGHT }}>

                {/* Clickable hour slots */}
                {HOURS.map(h => (
                  <button key={h} type="button" className="week-grid__slot"
                    style={{ top: (h - FIRST_HOUR) * HOUR_HEIGHT }}
                    aria-label={`${date} ${pad(h)}:00`}
                    onClick={() => { onSelectDate(date); onSlotClick?.(date, `${pad(h)}:00`); }}>
                    <span className="week-grid__slot-hint">+</span>
                  </button>
                ))}

                {/* Current time indicator */}
                {showNow && (
                  <div className="week-grid__now" style={{ top: nowTop }}>
                    <div className="week-grid__now-dot" />
                  </div>
                )}

                {/* Drag preview ghost */}
                {showPreview && drag && (
                  <div
                    className={[
                      "week-grid__preview",
                      `week-grid__preview--${drag.visit.status}`,
                      drag.mode === "resize" && "week-grid__preview--resize"
                    ].filter(Boolean).join(" ")}
                    style={{ top: previewTop, height: previewH }}>
                    <span className="week-grid__event-time">
                      {pad(drag.previewHour)}:{pad(drag.previewMinute)}
                    </span>
                    <span className="week-grid__event-title">{drag.visit.title}</span>
                    {drag.mode === "resize" && (
                      <>
                        <span className="week-grid__resize-caption">{t("Hora final", "Endzeit")}</span>
                        <span className="week-grid__resize-time">
                          {pad(Math.floor(previewEnd / 60))}:{pad(previewEnd % 60)}
                        </span>
                        <span className="week-grid__resize-duration">
                          {drag.previewDurationMinutes} min
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Events */}
                {dayVisits.map((visit) => {
                  const isGhost  = drag?.visit.id === visit.id;
                  const top      = eventTop(visit.when);
                  const durationMinutes = durationToMinutes(visit.durationMinutes);
                  const height   = eventHeight(durationMinutes);
                  const tall     = height > HOUR_HEIGHT * 0.85;
                  return (
                    <button key={visit.id}
                      type="button"
                      className={[
                        "week-grid__event",
                        `week-grid__event--${visit.status}`,
                        visit.reportId && "week-grid__event--resizable",
                        isGhost && "week-grid__event--ghost",
                      ].filter(Boolean).join(" ")}
                      style={{ top, height, cursor: drag ? (drag.mode === "resize" ? "ns-resize" : "grabbing") : "grab" }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!visit.reportId) return;
                        const d = new Date(visit.when);
                        setDrag({
                          mode: "move",
                          visit,
                          previewDate: date,
                          previewHour: d.getHours(),
                          previewMinute: d.getMinutes(),
                          previewDurationMinutes: durationMinutes,
                          moved: false
                        });
                      }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest(".week-grid__resize-handle")) {
                          e.preventDefault();
                          return;
                        }
                        if (drag?.moved) { e.preventDefault(); return; }
                        onSelectDate(date);
                        if (visit.reportId) onVisitClick?.(visit.reportId);
                      }}
                      title={`${visit.title}\n${visit.address}\n${fmtTime(visit.when, locale)}`}>
                      <span className="week-grid__event-time">{fmtTime(visit.when, locale)}</span>
                      <span className="week-grid__event-title">{visit.title}</span>
                      {tall && <span className="week-grid__event-addr">{visit.address}</span>}
                      {tall && visit.durationMinutes && (
                        <span className="week-grid__event-dur">{visit.durationMinutes} min</span>
                      )}
                      {visit.reportId && (
                        <span
                          className="week-grid__resize-handle"
                          aria-hidden="true"
                          title={t("Ajustar duración", "Dauer anpassen")}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const d = new Date(visit.when);
                            setDrag({
                              mode: "resize",
                              visit,
                              previewDate: date,
                              previewHour: d.getHours(),
                              previewMinute: d.getMinutes(),
                              previewDurationMinutes: durationMinutes,
                              moved: false
                            });
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Month Grid ───────────────────────────────────────────────────────────────

const WD_DE: readonly string[] = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const WD_ES: readonly string[] = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

const MonthGridView = ({
  grid, visitsByDate, selectedDate, today, navMonth, language, locale, onSelectDate, onNavMonth,
}: {
  grid: MonthGrid; visitsByDate: Map<string, VisitItem[]>; selectedDate: string;
  today: string; navMonth: { year: number; month: number }; language: Language;
  locale: string; onSelectDate: (d: string) => void; onNavMonth: (delta: -1 | 1) => void;
}) => {
  const t = (es: string, de: string) => translate(language, de, es);
  const wd = language === "es" ? WD_ES : WD_DE;
  const monthLabel = new Date(navMonth.year, navMonth.month, 1)
    .toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="month-grid">
      <div className="month-grid__nav">
        <button type="button" onClick={() => onNavMonth(-1)} aria-label={t("Anterior", "Vorher")}>‹</button>
        <span className="month-grid__nav-title">{monthLabel}</span>
        <button type="button" onClick={() => onNavMonth(1)} aria-label={t("Siguiente", "Weiter")}>›</button>
      </div>
      <div className="month-grid__weekdays">
        {wd.map(w => <span key={w} className="month-grid__weekday">{w}</span>)}
      </div>
      {grid.map((week, ri) => (
        <div key={ri} className="month-grid__week">
          {week.map(cell => {
            const count      = (visitsByDate.get(cell.date) ?? []).length;
            const isSelected = cell.date === selectedDate;
            const isToday    = cell.date === today;
            return (
              <button key={cell.date} type="button" aria-pressed={isSelected}
                className={["month-grid__cell",
                  !cell.isCurrentMonth && "month-grid__cell--other-month",
                  isToday && !isSelected && "month-grid__cell--today",
                  isSelected && "month-grid__cell--selected",
                ].filter(Boolean).join(" ")}
                onClick={() => onSelectDate(cell.date)}>
                <span className="month-grid__cell-num">{parseInt(cell.date.slice(8), 10)}</span>
                {count === 1 && <span className="month-grid__dot" />}
                {count > 1  && <span className="month-grid__badge">{count}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ─── Root export ──────────────────────────────────────────────────────────────

export const VisitCalendar = ({
  visits, selectedDate, language, onSelectDate, onSlotClick, onVisitClick, onMoveVisit, onResizeVisit,
}: VisitCalendarProps) => {
  const locale = localeForLanguage(language);
  const today  = toLocalDateString(new Date());

  const [view, setView] = useState<"week" | "month">("week");
  const [navMonth, setNavMonth] = useState(() => {
    const b = new Date(selectedDate + "T00:00:00");
    return { year: b.getFullYear(), month: b.getMonth() };
  });

  const visitsByDate = useMemo(() => groupByDate(visits), [visits]);
  const weekDays     = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const monthGrid    = useMemo(() => buildMonthGrid(navMonth.year, navMonth.month), [navMonth.year, navMonth.month]);

  const handleNavMonth = (delta: -1 | 1) =>
    setNavMonth(cur => {
      let m = cur.month + delta, y = cur.year;
      if (m < 0)  { m = 11; y--; }
      if (m > 11) { m = 0;  y++; }
      return { year: y, month: m };
    });

  const handleSelectFromMonth = (date: string) => {
    onSelectDate(date);
    const b = new Date(date + "T00:00:00");
    setNavMonth({ year: b.getFullYear(), month: b.getMonth() });
    setView("week");
  };

  const handlePrevWeek = () => {
    const d = new Date(weekDays[0] + "T00:00:00");
    d.setDate(d.getDate() - 7);
    onSelectDate(toLocalDateString(d));
  };
  const handleNextWeek = () => {
    const d = new Date(weekDays[6] + "T00:00:00");
    d.setDate(d.getDate() + 1);
    onSelectDate(toLocalDateString(d));
  };
  const handleToday = () => onSelectDate(today);

  return (
    <div className="visit-calendar-root">
      <ViewToggle view={view} onChange={setView} language={language} />

      {view === "week" ? (
        <WeekGrid
          days={weekDays}
          visitsByDate={visitsByDate}
          selectedDate={selectedDate}
          language={language}
          locale={locale}
          today={today}
          onSelectDate={onSelectDate}
          onSlotClick={onSlotClick}
          onVisitClick={onVisitClick}
          onMoveVisit={onMoveVisit}
          onResizeVisit={onResizeVisit}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
        />
      ) : (
        <MonthGridView
          grid={monthGrid}
          visitsByDate={visitsByDate}
          selectedDate={selectedDate}
          today={today}
          navMonth={navMonth}
          language={language}
          locale={locale}
          onSelectDate={handleSelectFromMonth}
          onNavMonth={handleNavMonth}
        />
      )}
    </div>
  );
};

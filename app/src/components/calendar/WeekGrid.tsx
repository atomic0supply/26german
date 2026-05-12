import { useEffect, useRef, useState } from "react";
import { createTranslator, Language } from "../../i18n";
import {
  FIRST_HOUR,
  GRID_HEIGHT,
  HOUR_HEIGHT,
  HOURS,
  LAST_HOUR,
  MIN_DURATION_MINS,
  SNAP_MINS,
  TIME_COL_PX,
  durationToMinutes,
  eventHeight,
  eventTop,
  fmtTime,
  pad
} from "./helpers";
import type { VisitItem } from "./types";

interface DragState {
  mode: "move" | "resize";
  visit: VisitItem;
  previewDate: string;
  previewHour: number;
  previewMinute: number;
  previewDurationMinutes: number;
  moved: boolean;
}

export interface WeekGridProps {
  days: string[];
  visitsByDate: Map<string, VisitItem[]>;
  selectedDate: string;
  language: Language;
  locale: string;
  today: string;
  onSelectDate: (date: string) => void;
  onSlotClick?: (date: string, time: string) => void;
  onVisitOpen?: (visit: VisitItem) => void;
  onMoveVisit?: (reportId: string, newDate: string, newTime: string) => void;
  onResizeVisit?: (reportId: string, newDurationMinutes: string) => void;
}

export const WeekGrid = ({
  days,
  visitsByDate,
  selectedDate,
  language,
  locale,
  today,
  onSelectDate,
  onSlotClick,
  onVisitOpen,
  onMoveVisit,
  onResizeVisit
}: WeekGridProps) => {
  const t = createTranslator(language);

  const [nowMins, setNowMins] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const nowTop = ((nowMins - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT;
  const nowVisible = nowMins >= FIRST_HOUR * 60 && nowMins < LAST_HOUR * 60;

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
        const clamped = Math.max(
          FIRST_HOUR * 60,
          Math.min((LAST_HOUR - 1) * 60 + 45, snapped)
        );
        const hour = Math.floor(clamped / 60);
        const minute = clamped % 60;

        setDrag((prev) =>
          prev
            ? {
                ...prev,
                moved: true,
                previewDate: days[dayIdx],
                previewHour: hour,
                previewMinute: minute
              }
            : null
        );
        return;
      }

      const relY = e.clientY - rect.top + scrollTop;
      const rawMins = FIRST_HOUR * 60 + (relY / HOUR_HEIGHT) * 60;
      const snapped = Math.round(rawMins / SNAP_MINS) * SNAP_MINS;
      const startMinutes = drag.previewHour * 60 + drag.previewMinute;
      const clampedEnd = Math.max(
        startMinutes + MIN_DURATION_MINS,
        Math.min(LAST_HOUR * 60, snapped)
      );

      setDrag((prev) =>
        prev
          ? {
              ...prev,
              moved: true,
              previewDurationMinutes: clampedEnd - startMinutes
            }
          : null
      );
    };

    const onUp = () => {
      if (drag.mode === "move" && drag.moved && drag.visit.reportId) {
        onMoveVisit?.(
          drag.visit.reportId,
          drag.previewDate,
          `${pad(drag.previewHour)}:${pad(drag.previewMinute)}`
        );
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

  return (
    <div className={drag ? "week-grid week-grid--dragging" : "week-grid"}>
      <div className="week-grid__header">
        <div className="week-grid__corner" />
        {days.map((date) => {
          const isToday = date === today;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              className={["week-grid__day-head", isToday && "today", isSelected && "selected"]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(date)}
            >
              <strong>{parseInt(date.slice(8), 10)}</strong>
              <span>
                {new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short" })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="week-grid__scroll" ref={scrollRef}>
        <div className="week-grid__body">
          <div className="week-grid__time-col">
            {HOURS.map((h) => (
              <div key={h} className="week-grid__time-label">
                {pad(h)}:00
              </div>
            ))}
          </div>

          {days.map((date) => {
            const dayVisits = visitsByDate.get(date) ?? [];
            const isToday = date === today;
            const showNow = isToday && nowVisible;
            const showPreview = drag?.previewDate === date;
            const previewTop = showPreview
              ? ((drag!.previewHour * 60 + drag!.previewMinute - FIRST_HOUR * 60) / 60) *
                HOUR_HEIGHT
              : 0;
            const previewH = showPreview ? eventHeight(drag!.previewDurationMinutes) : 0;
            const previewEnd = showPreview
              ? drag!.previewHour * 60 + drag!.previewMinute + drag!.previewDurationMinutes
              : 0;

            return (
              <div
                key={date}
                className={["week-grid__day-col", isToday && "week-grid__day-col--today"]
                  .filter(Boolean)
                  .join(" ")}
                style={{ height: GRID_HEIGHT }}
              >
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="week-grid__slot"
                    style={{ top: (h - FIRST_HOUR) * HOUR_HEIGHT }}
                    aria-label={`${date} ${pad(h)}:00`}
                    onClick={() => {
                      onSelectDate(date);
                      onSlotClick?.(date, `${pad(h)}:00`);
                    }}
                  >
                    <span className="week-grid__slot-hint">+</span>
                  </button>
                ))}

                {showNow && (
                  <div className="week-grid__now" style={{ top: nowTop }}>
                    <div className="week-grid__now-dot" />
                  </div>
                )}

                {showPreview && drag && (
                  <div
                    className={[
                      "week-grid__preview",
                      `week-grid__preview--${drag.visit.status}`,
                      drag.mode === "resize" && "week-grid__preview--resize"
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top: previewTop, height: previewH }}
                  >
                    <span className="week-grid__event-time">
                      {pad(drag.previewHour)}:{pad(drag.previewMinute)}
                    </span>
                    <span className="week-grid__event-title">{drag.visit.title}</span>
                    {drag.mode === "resize" && (
                      <>
                        <span className="week-grid__resize-caption">
                          {t("Endzeit", "Hora final")}
                        </span>
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

                {dayVisits.map((visit) => {
                  const isGhost = drag?.visit.id === visit.id;
                  const top = eventTop(visit.when);
                  const durationMinutes = durationToMinutes(visit.durationMinutes);
                  const height = eventHeight(durationMinutes);
                  const tall = height > HOUR_HEIGHT * 0.85;
                  return (
                    <button
                      key={visit.id}
                      type="button"
                      className={[
                        "week-grid__event",
                        `week-grid__event--${visit.status}`,
                        visit.reportId && "week-grid__event--resizable",
                        isGhost && "week-grid__event--ghost"
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        top,
                        height,
                        cursor: drag ? (drag.mode === "resize" ? "ns-resize" : "grabbing") : "grab"
                      }}
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
                        if (drag?.moved) {
                          e.preventDefault();
                          return;
                        }
                        onSelectDate(date);
                        onVisitOpen?.(visit);
                      }}
                      title={`${visit.title}\n${visit.address}\n${fmtTime(visit.when, locale)}`}
                    >
                      <span className="week-grid__event-time">
                        {fmtTime(visit.when, locale)}
                      </span>
                      <span className="week-grid__event-title">{visit.title}</span>
                      {tall && <span className="week-grid__event-addr">{visit.address}</span>}
                      {tall && visit.durationMinutes && (
                        <span className="week-grid__event-dur">{visit.durationMinutes} min</span>
                      )}
                      {visit.reportId && (
                        <span
                          className="week-grid__resize-handle"
                          aria-hidden="true"
                          title={t("Dauer anpassen", "Ajustar duración")}
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

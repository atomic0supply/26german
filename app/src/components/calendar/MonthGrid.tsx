import { Language } from "../../i18n";
import type { MonthGrid } from "./helpers";
import type { VisitItem } from "./types";

const WD_DE: readonly string[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WD_ES: readonly string[] = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export interface MonthGridViewProps {
  grid: MonthGrid;
  visitsByDate: Map<string, VisitItem[]>;
  selectedDate: string;
  today: string;
  language: Language;
  onSelectDate: (date: string) => void;
}

export const MonthGridView = ({
  grid,
  visitsByDate,
  selectedDate,
  today,
  language,
  onSelectDate
}: MonthGridViewProps) => {
  const wd = language === "es" ? WD_ES : WD_DE;

  return (
    <div className="month-grid">
      <div className="month-grid__weekdays">
        {wd.map((w) => (
          <span key={w} className="month-grid__weekday">
            {w}
          </span>
        ))}
      </div>
      {grid.map((week, ri) => (
        <div key={ri} className="month-grid__week">
          {week.map((cell) => {
            const count = (visitsByDate.get(cell.date) ?? []).length;
            const isSelected = cell.date === selectedDate;
            const isToday = cell.date === today;
            return (
              <button
                key={cell.date}
                type="button"
                aria-pressed={isSelected}
                className={[
                  "month-grid__cell",
                  !cell.isCurrentMonth && "month-grid__cell--other-month",
                  isToday && !isSelected && "month-grid__cell--today",
                  isSelected && "month-grid__cell--selected"
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelectDate(cell.date)}
              >
                <span className="month-grid__cell-num">
                  {parseInt(cell.date.slice(8), 10)}
                </span>
                {count === 1 && <span className="month-grid__dot" />}
                {count > 1 && <span className="month-grid__badge">{count}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

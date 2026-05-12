import { createTranslator, Language } from "../../i18n";
import type { CalendarStatusFilter, VisitItem } from "./types";

export interface EventFiltersProps {
  visits: VisitItem[];
  statusFilter: CalendarStatusFilter;
  onStatusChange: (next: CalendarStatusFilter) => void;
  partnerFilter: string;
  partners: string[];
  onPartnerChange: (next: string) => void;
  language: Language;
}

const STATUSES: CalendarStatusFilter[] = ["all", "scheduled", "draft", "done"];

export const EventFilters = ({
  visits,
  statusFilter,
  onStatusChange,
  partnerFilter,
  partners,
  onPartnerChange,
  language
}: EventFiltersProps) => {
  const t = createTranslator(language);

  const labels: Record<CalendarStatusFilter, string> = {
    all: t("Alle", "Todos"),
    scheduled: t("Geplant", "Programados"),
    draft: t("Entwurf", "Borrador"),
    done: t("Fertig", "Completados")
  };

  const counts: Record<CalendarStatusFilter, number> = {
    all: visits.length,
    scheduled: 0,
    draft: 0,
    done: 0
  };
  for (const v of visits) counts[v.status]++;

  return (
    <div className="cal-filters">
      <div className="cal-filters__chips" role="group" aria-label={t("Status filtern", "Filtrar por estado")}>
        {STATUSES.map((s) => {
          const active = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              className={[
                "cal-filters__chip",
                active && "cal-filters__chip--active",
                s !== "all" && `cal-filters__chip--${s}`
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={active}
              onClick={() => onStatusChange(s)}
            >
              <span>{labels[s]}</span>
              <span className="cal-filters__count">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      {partners.length > 0 && (
        <label className="cal-filters__partner">
          <span className="cal-filters__partner-label">{t("Partner", "Partner")}</span>
          <select value={partnerFilter} onChange={(e) => onPartnerChange(e.target.value)}>
            <option value="">{t("Alle Partner", "Todos los partners")}</option>
            {partners.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

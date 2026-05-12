import { BellRing } from "lucide-react";
import { fmtTime } from "./helpers";
import type { VisitItem } from "./types";

interface EventCardProps {
  visit: VisitItem;
  locale: string;
  onClick?: () => void;
  variant?: "agenda" | "compact";
  className?: string;
}

export const EventCard = ({
  visit,
  locale,
  onClick,
  variant = "agenda",
  className
}: EventCardProps) => {
  const classes = [
    "cal-event",
    `cal-event--${visit.status}`,
    `cal-event--${variant}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={onClick}>
      <span className="cal-event__bar" aria-hidden="true" />
      <span className="cal-event__body">
        <span className="cal-event__row">
          <span className="cal-event__time">{fmtTime(visit.when, locale)}</span>
          {visit.durationMinutes ? (
            <span className="cal-event__dur">· {visit.durationMinutes} min</span>
          ) : null}
          {visit.notificationSentAt ? (
            <BellRing size={12} aria-hidden="true" className="cal-event__bell" />
          ) : null}
        </span>
        <span className="cal-event__title">{visit.title}</span>
        {variant === "agenda" && visit.address ? (
          <span className="cal-event__meta">{visit.address}</span>
        ) : null}
        {variant === "agenda" && visit.partnerLabel ? (
          <span className="cal-event__meta cal-event__meta--muted">
            {visit.partnerLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
};

import type { VisitItem } from "./types";

export const HOUR_HEIGHT = 64;
export const FIRST_HOUR = 7;
export const LAST_HOUR = 21;
export const TIME_COL_PX = 56;
export const SNAP_MINS = 15;
export const MIN_DURATION_MINS = 15;
export const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
export const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;

export const pad = (n: number) => n.toString().padStart(2, "0");

export const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const buildWeekDays = (seed: string): string[] => {
  const base = new Date(seed + "T00:00:00");
  const dow = base.getDay();
  base.setDate(base.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return toLocalDateString(d);
  });
};

export interface MonthCell {
  date: string;
  isCurrentMonth: boolean;
}
export type MonthGrid = MonthCell[][];

export const buildMonthGrid = (year: number, month: number): MonthGrid => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
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

export const groupByDate = (visits: VisitItem[]): Map<string, VisitItem[]> => {
  const map = new Map<string, VisitItem[]>();
  for (const v of visits) {
    const key = v.when.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return map;
};

export const fmtTime = (when: string, locale: string) => {
  try {
    return new Date(when).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return when.slice(11, 16);
  }
};

export const fmtDateLong = (date: string, locale: string) => {
  try {
    return new Date(date + "T00:00:00").toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return date;
  }
};

export const fmtDateShort = (date: string, locale: string) => {
  try {
    return new Date(date + "T00:00:00").toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  } catch {
    return date;
  }
};

export const durationToMinutes = (durationMinutes?: string) => {
  const parsed = parseInt(durationMinutes ?? "60", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
};

export const eventTop = (when: string) => {
  const d = new Date(when);
  return Math.max(
    0,
    ((d.getHours() * 60 + d.getMinutes() - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT
  );
};

export const eventHeight = (durationMinutes?: string | number) => {
  const minutes =
    typeof durationMinutes === "number" ? durationMinutes : durationToMinutes(durationMinutes);
  return Math.max(HOUR_HEIGHT / 4, (minutes / 60) * HOUR_HEIGHT);
};

const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
};

const isoWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const fmtWeekLabel = (days: string[], locale: string, kwLabel: string) => {
  if (!days.length) return "";
  const start = new Date(days[0] + "T00:00:00");
  const end = new Date(days[6] + "T00:00:00");
  const wk = isoWeek(start);
  const from = start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const to = end.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return `${kwLabel} ${wk} · ${from} – ${to}`;
};

export const fmtMonthLabel = (year: number, month: number, locale: string) =>
  new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

export const sameWeek = (a: string, b: string) =>
  toLocalDateString(startOfWeek(new Date(a + "T00:00:00"))) ===
  toLocalDateString(startOfWeek(new Date(b + "T00:00:00")));

export const addDays = (date: string, delta: number) => {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
};

export const relativeDayLabel = (date: string, today: string, locale: string, todayLabel: string, tomorrowLabel: string) => {
  if (date === today) return todayLabel;
  if (date === addDays(today, 1)) return tomorrowLabel;
  return fmtDateShort(date, locale);
};

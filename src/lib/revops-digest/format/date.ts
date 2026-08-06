/** Returns the ISO date (YYYY-MM-DD) of the Monday on or before `date`, computed in UTC. Used
 * as the RankedDigest.weekOf label and idempotency key. */
export function getMondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7; // Sunday (0) -> 6 days back, Monday (1) -> 0, etc.
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

/** weekOf is the Monday of the reporting week, e.g. "2026-08-03". Renders the full
 * Mon–Sun range in plain English, e.g. "August 3–9, 2026". */
export function formatReportPeriod(weekOf: string): string {
  const monday = new Date(`${weekOf}T00:00:00Z`);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);

  const monthDay = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const monthDayYear = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const start = sameMonth ? monthDay.format(monday) : monthDayYear.format(monday);
  return `${start}–${monthDayYear.format(sunday)}`;
}

/** Renders an ISO timestamp in the client's configured timezone rather than raw UTC — a digest
 * generated at "2026-08-06T02:04Z" reads as the wrong day to a Sao Paulo (UTC-3) recipient if
 * shown as-is, since it's still 2026-08-05 there. */
export function formatPreparedAt(isoTimestamp: string, timezone: string): string {
  const date = new Date(isoTimestamp);
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
  return `${formatted} (${timezone.replace(/_/g, " ")})`;
}

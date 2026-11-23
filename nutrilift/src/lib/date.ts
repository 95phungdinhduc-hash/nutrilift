// Ngày được lưu dưới dạng chuỗi "YYYY-MM-DD" theo giờ địa phương.
export function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Số ngày từ a đến b (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86400000);
}

/** Thứ trong tuần: 1 = Thứ 2 ... 7 = Chủ nhật. */
export function isoWeekday(s: string): number {
  const d = parseISODate(s).getDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(s: string): string {
  return addDays(s, 1 - isoWeekday(s));
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 5000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAYS_LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export function weekdayShort(s: string): string {
  return WEEKDAYS[parseISODate(s).getDay()];
}

export function formatDate(s: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseISODate(s);
  const base = `${d.getDate()}/${d.getMonth() + 1}${opts.year ? "/" + d.getFullYear() : ""}`;
  return opts.weekday ? `${WEEKDAYS_LONG[d.getDay()]}, ${base}` : base;
}

export function relativeDayLabel(s: string): string {
  const t = today();
  if (s === t) return "Hôm nay";
  if (s === addDays(t, -1)) return "Hôm qua";
  if (s === addDays(t, 1)) return "Ngày mai";
  return formatDate(s, { weekday: true, year: s.slice(0, 4) !== t.slice(0, 4) });
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function dateFromMs(ms: number): string {
  return toISODate(new Date(ms));
}

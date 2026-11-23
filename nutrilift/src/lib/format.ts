export function round(n: number, digits = 0): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function fmt(n: number | undefined | null, digits = 0): string {
  if (n == null || !isFinite(n)) return "–";
  return round(n, digits).toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

export function fmtKg(n: number | undefined | null): string {
  if (n == null || !isFinite(n)) return "–";
  return `${round(n, 2).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

export function avg(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

/** Chuyển chuỗi nhập (hỗ trợ dấu phẩy thập phân) thành số. */
export function parseNum(s: string): number | undefined {
  const t = s.replace(",", ".").trim();
  if (t === "") return undefined;
  const n = Number(t);
  return isFinite(n) ? n : undefined;
}

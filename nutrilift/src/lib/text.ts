/** Bỏ dấu tiếng Việt, viết thường — dùng cho tìm kiếm không dấu. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9%.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Điểm khớp đơn giản: tất cả từ trong truy vấn phải xuất hiện. Trả về -1 nếu không khớp. */
export function matchScore(query: string, ...fields: (string | undefined)[]): number {
  const q = normalize(query);
  if (!q) return 0;
  const words = q.split(" ");
  let best = -1;
  for (const f of fields) {
    if (!f) continue;
    const t = normalize(f);
    if (!words.every((w) => t.includes(w))) continue;
    let score = 10;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 60;
    else if (t.includes(q)) score = 40;
    else if (words.every((w) => t.split(" ").some((tw) => tw.startsWith(w)))) score = 25;
    score -= Math.min(9, t.length / 20);
    best = Math.max(best, score);
  }
  return best;
}

// Hiệu ứng tương tác cao cấp: đốm sáng/nghiêng 3D theo chuột, gợn sóng khi bấm,
// đổi giao diện sáng/tối bằng vòng tròn lan ra (View Transitions API).
import { confetti } from "./confetti";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let installed = false;
/** Một bộ lắng nghe duy nhất cho toàn app (event delegation) — rẻ và không cần sửa từng thẻ. */
export function installPointerFx() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let current: HTMLElement | null = null;
  const reset = (el: HTMLElement) => {
    el.style.setProperty("--mx", "-500px");
    el.style.setProperty("--my", "-500px");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  let raf = 0;
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as HTMLElement)?.closest?.(".card") as HTMLElement | null;
      if (current && current !== card) reset(current);
      current = card;
      if (!card) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        card.style.setProperty("--mx", `${x}px`);
        card.style.setProperty("--my", `${y}px`);
        if (card.classList.contains("tilt") && !reduced()) {
          card.style.setProperty("--ry", `${((x / r.width - 0.5) * 6).toFixed(2)}deg`);
          card.style.setProperty("--rx", `${(-(y / r.height - 0.5) * 6).toFixed(2)}deg`);
        }
      });
    },
    { passive: true }
  );
  document.addEventListener("pointerleave", () => current && reset(current));
}

/** Gợn sóng lan ra từ điểm chạm. */
export function ripple(e: React.PointerEvent<HTMLElement>) {
  if (reduced()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.4;
  const s = document.createElement("span");
  s.className = "ripple";
  s.style.width = s.style.height = `${size}px`;
  s.style.left = `${e.clientX - r.left}px`;
  s.style.top = `${e.clientY - r.top}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 700);
}

/** Đổi giao diện với hiệu ứng vòng tròn lan ra từ (x, y). */
export function withCircleTransition(apply: () => void, x?: number, y?: number) {
  const doc = document as any;
  if (!doc.startViewTransition || reduced()) {
    apply();
    return;
  }
  const cx = x ?? window.innerWidth / 2;
  const cy = y ?? 0;
  const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
  const t = doc.startViewTransition(() => apply());
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${cx}px ${cy}px)`, `circle(${radius}px at ${cx}px ${cy}px)`] },
        { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    })
    .catch(() => {});
}

/** Pháo giấy chỉ một lần cho mỗi khoá (vd. đạt protein trong ngày). */
export function celebrateOnce(key: string, opts?: Parameters<typeof confetti>[0]) {
  try {
    const k = "nl_celebrated";
    const done: string[] = JSON.parse(localStorage.getItem(k) || "[]");
    if (done.includes(key)) return false;
    localStorage.setItem(k, JSON.stringify([...done.slice(-30), key]));
  } catch {
    return false;
  }
  confetti(opts);
  return true;
}

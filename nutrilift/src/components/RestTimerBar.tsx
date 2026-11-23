import { useEffect, useRef, useState } from "react";
import { formatDuration } from "../lib/date";
import { useNow, useSettings } from "../lib/hooks";
import { adjustRest, beep, getRest, stopRest, subscribeRest, type RestState } from "../training/restTimer";
import { cx } from "./ui";

export function RestTimerBar() {
  const [rest, setRest] = useState<RestState | null>(getRest());
  const settings = useSettings();
  const now = useNow(250);
  const fired = useRef<number | null>(null);
  useEffect(() => subscribeRest(setRest), []);

  const remaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : 0;

  useEffect(() => {
    if (!rest) return;
    if (remaining <= 0 && fired.current !== rest.endsAt) {
      fired.current = rest.endsAt;
      if (settings.sound) beep();
      if (settings.vibrate && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
      if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Hết giờ nghỉ!", { body: rest.label ? `Tiếp tục: ${rest.label}` : "Vào set tiếp theo thôi 💪" });
        } catch {
          /* ignore */
        }
      }
    }
    if (remaining < -30) stopRest();
  }, [remaining, rest, settings.sound, settings.vibrate]);

  if (!rest) return null;
  const pct = Math.max(0, Math.min(1, remaining / rest.total));
  const over = remaining <= 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:left-60">
      <div className={cx("mx-auto max-w-xl overflow-hidden rounded-2xl shadow-2xl", over ? "bg-accent text-white dark:text-slate-950" : "bg-slate-900 text-white dark:bg-surface-3")}>
        <div className="h-1 bg-white/15">
          <div className="h-full bg-train transition-all" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs opacity-80">{over ? "Hết giờ nghỉ — vào set tiếp!" : "Nghỉ giữa set"}</div>
            <div className="tabular text-2xl leading-tight font-extrabold">{over ? `+${formatDuration(-remaining)}` : formatDuration(remaining)}</div>
          </div>
          <button className="h-10 rounded-xl bg-white/15 px-3 text-sm font-bold" onClick={() => adjustRest(-15)}>
            −15s
          </button>
          <button className="h-10 rounded-xl bg-white/15 px-3 text-sm font-bold" onClick={() => adjustRest(15)}>
            +15s
          </button>
          <button className="h-10 rounded-xl bg-white/25 px-3 text-sm font-bold" onClick={stopRest}>
            Bỏ qua
          </button>
        </div>
      </div>
    </div>
  );
}

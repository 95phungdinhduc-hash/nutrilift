import { AnimatePresence, motion } from "motion/react";
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

  const pct = rest ? Math.max(0, Math.min(1, remaining / rest.total)) : 0;
  const over = remaining <= 0;
  const R = 20;
  const C = 2 * Math.PI * R;
  return (
    <AnimatePresence>
      {rest && (
        <motion.div
          key="rest"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:left-64"
        >
          <div
            className={cx(
              "mx-auto max-w-xl overflow-hidden rounded-[1.4rem] border shadow-[var(--shadow-pop)] backdrop-blur-2xl transition-colors duration-500",
              over ? "border-white/20 bg-gradient-accent text-white dark:text-slate-950" : "border-white/10 bg-slate-900/92 text-white dark:bg-surface-3/92"
            )}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className={cx("relative h-12 w-12 shrink-0", over && "animate-pulse-ring rounded-full")}>
                <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
                  <circle cx="24" cy="24" r={R} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={4} />
                  <circle
                    cx="24"
                    cy="24"
                    r={R}
                    fill="none"
                    stroke={over ? "currentColor" : "var(--train)"}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - pct)}
                    style={{ transition: "stroke-dashoffset 0.25s linear" }}
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs opacity-80">{over ? "Hết giờ nghỉ — vào set tiếp!" : rest.label ? `Nghỉ · ${rest.label}` : "Nghỉ giữa set"}</div>
                <motion.div
                  key={over ? "over" : "run"}
                  initial={{ scale: over ? 1.15 : 1 }}
                  animate={{ scale: 1 }}
                  className="tabular text-[26px] leading-tight font-extrabold tracking-tight"
                >
                  {over ? `+${formatDuration(-remaining)}` : formatDuration(remaining)}
                </motion.div>
              </div>
              <button className="h-10 rounded-xl bg-white/15 px-3 text-sm font-bold transition active:scale-95" onClick={() => adjustRest(-15)}>
                −15s
              </button>
              <button className="h-10 rounded-xl bg-white/15 px-3 text-sm font-bold transition active:scale-95" onClick={() => adjustRest(15)}>
                +15s
              </button>
              <button className="h-10 rounded-xl bg-white/25 px-3 text-sm font-bold transition active:scale-95" onClick={stopRest}>
                Bỏ qua
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

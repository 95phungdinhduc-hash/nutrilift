import { Cloud, CloudOff, Dumbbell, Home, LineChart, RefreshCw, Settings as SettingsIcon, Timer, UtensilsCrossed } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cx, Toaster } from "./components/ui";
import { RestTimerBar } from "./components/RestTimerBar";
import { formatDuration } from "./lib/date";
import { useActiveWorkout, useNow, useProfile, useSettings } from "./lib/hooks";
import { Link, match, navigate, useLocation } from "./lib/router";
import { startSync, subscribeSyncStatus, syncNow, type SyncStatus } from "./sync/cloud";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Diary from "./pages/nutrition/Diary";
import AddFood from "./pages/nutrition/AddFood";
import MyFoods from "./pages/nutrition/MyFoods";
import FoodEditor from "./pages/nutrition/FoodEditor";
import RecipeEditor from "./pages/nutrition/RecipeEditor";
import Training from "./pages/training/Training";
import WorkoutPage from "./pages/training/WorkoutPage";
import Programs from "./pages/training/Programs";
import ProgramEditor from "./pages/training/ProgramEditor";
import History, { WorkoutDetail } from "./pages/training/History";
import Exercises, { ExerciseDetail } from "./pages/training/Exercises";
import Progress from "./pages/Progress";
import SettingsPage from "./pages/Settings";

const NAV = [
  { to: "/", label: "Tổng quan", icon: Home, match: (p: string) => p === "/" },
  { to: "/nutrition", label: "Dinh dưỡng", icon: UtensilsCrossed, match: (p: string) => p.startsWith("/nutrition") },
  { to: "/training", label: "Tập luyện", icon: Dumbbell, match: (p: string) => p.startsWith("/training") },
  { to: "/progress", label: "Tiến độ", icon: LineChart, match: (p: string) => p.startsWith("/progress") },
  { to: "/settings", label: "Cài đặt", icon: SettingsIcon, match: (p: string) => p.startsWith("/settings") },
];

function useTheme() {
  const settings = useSettings();
  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0f1a" : "#f3f5f8");
      try {
        localStorage.setItem("nl_theme", JSON.stringify(settings.theme));
      } catch {
        /* ignore */
      }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);
}

function SyncBadge() {
  const [s, setS] = useState<SyncStatus>({ state: "off" });
  useEffect(() => subscribeSyncStatus(setS), []);
  if (s.state === "off") return null;
  const map: Record<string, { icon: ReactNode; text: string; cls: string }> = {
    signed_out: { icon: <CloudOff size={16} />, text: "Chưa đăng nhập", cls: "text-muted" },
    idle: { icon: <Cloud size={16} />, text: "Đã đồng bộ", cls: "text-accent-ink" },
    syncing: { icon: <RefreshCw size={16} className="animate-spin" />, text: "Đang đồng bộ", cls: "text-muted" },
    error: { icon: <CloudOff size={16} />, text: "Lỗi đồng bộ", cls: "text-danger" },
    offline: { icon: <CloudOff size={16} />, text: "Ngoại tuyến", cls: "text-muted" },
  };
  const m = map[s.state];
  return (
    <button
      onClick={() => (s.state === "signed_out" || s.state === "error" ? navigate("/settings?tab=sync") : syncNow())}
      className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-surface-2", m.cls)}
      title={s.error || m.text}
    >
      {m.icon}
      <span className="hidden sm:inline">{m.text}</span>
    </button>
  );
}

function ActiveWorkoutBar({ path }: { path: string }) {
  const w = useActiveWorkout();
  const now = useNow(1000);
  if (!w || path === "/training/workout") return null;
  const done = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done && !s.warmup).length, 0);
  const total = w.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.warmup).length, 0);
  return (
    <motion.button
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate("/training/workout")}
      className="btn-shine fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl bg-gradient-train px-4 py-3 text-left text-white shadow-[0_18px_40px_-14px_var(--train)] lg:right-6 lg:bottom-6 lg:left-auto lg:w-96 dark:text-slate-950"
    >
      <span className="animate-pulse-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Timer size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">Đang tập: {w.dayName}</div>
        <div className="text-xs opacity-90">
          {formatDuration((now - w.startedAt) / 1000)} · {done}/{total} set
        </div>
      </div>
      <span className="text-sm font-bold">Tiếp tục →</span>
    </motion.button>
  );
}

function Routes({ path }: { path: string }) {
  let m: Record<string, string> | null;
  if (path === "/") return <Dashboard />;
  if (path === "/nutrition") return <Diary />;
  if (path === "/nutrition/add") return <AddFood />;
  if (path === "/nutrition/foods") return <MyFoods />;
  if ((m = match("/nutrition/food/:id", path))) return <FoodEditor id={m.id} />;
  if ((m = match("/nutrition/recipe/:id", path))) return <RecipeEditor id={m.id} />;
  if (path === "/training") return <Training />;
  if (path === "/training/workout") return <WorkoutPage />;
  if (path === "/training/programs") return <Programs />;
  if ((m = match("/training/program/:id", path))) return <ProgramEditor id={m.id} />;
  if (path === "/training/history") return <History />;
  if ((m = match("/training/history/:id", path))) return <WorkoutDetail id={m.id} />;
  if (path === "/training/exercises") return <Exercises />;
  if ((m = match("/training/exercise/:id", path))) return <ExerciseDetail id={m.id} />;
  if (path === "/progress") return <Progress />;
  if (path === "/settings") return <SettingsPage />;
  return <Dashboard />;
}

export default function App() {
  useTheme();
  const loc = useLocation();
  const { profile, loaded } = useProfile();

  useEffect(() => {
    startSync();
  }, []);

  if (!loaded)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Aurora />
        <motion.img
          src="./favicon.svg"
          alt=""
          className="h-16 w-16 drop-shadow-xl"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        />
      </div>
    );
  const onboarding = !profile && loc.path !== "/settings";
  if (onboarding) {
    return (
      <MotionConfig reducedMotion="user">
        <Aurora />
        <Onboarding />
        <Toaster />
      </MotionConfig>
    );
  }
  const fullScreen = loc.path === "/training/workout";

  return (
    <MotionConfig reducedMotion="user">
    <Aurora />
    <div className="min-h-dvh lg:flex">
      {/* Thanh bên cho máy tính */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--card-border)] bg-[var(--card)] px-3 py-6 backdrop-blur-2xl lg:flex">
        <Link to="/" className="group mb-8 flex items-center gap-2.5 px-3">
          <img src="./favicon.svg" alt="" className="h-9 w-9 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110" />
          <span className="text-xl font-extrabold tracking-tight">
            Nutri<span className="text-gradient">Lift</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.match(loc.path);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cx(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
                  active ? "text-accent-ink" : "text-muted hover:bg-surface-2/70 hover:text-ink"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="side-active"
                    className="absolute inset-0 rounded-xl bg-accent-soft ring-1 ring-accent/20"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <n.icon size={20} className="relative" />
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3">
          <SyncBadge />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {!fullScreen && (
          <header className="pt-safe sticky top-0 z-20 border-b border-[var(--card-border)] bg-bg/70 backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
            <div className="mx-auto flex h-13 max-w-3xl items-center justify-between px-4">
              <Link to="/" className="flex items-center gap-2">
                <img src="./favicon.svg" alt="" className="h-7 w-7" />
                <span className="text-[17px] font-extrabold tracking-tight">
                  Nutri<span className="text-gradient">Lift</span>
                </span>
              </Link>
              <SyncBadge />
            </div>
          </header>
        )}
        <main className={cx("mx-auto w-full max-w-5xl px-4 pt-4 lg:px-8 lg:pt-8", fullScreen ? "pb-40" : "pb-36 lg:pb-12")}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={loc.path}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none", transform: "none" } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <Routes path={loc.path} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Thanh điều hướng dưới cho điện thoại */}
      {!fullScreen && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[var(--card-border)] bg-[var(--card)] backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5 px-1">
            {NAV.map((n) => {
              const active = n.match(loc.path);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors", active ? "text-accent-ink" : "text-muted")}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-active"
                      className="absolute inset-x-2 top-1 bottom-1 rounded-2xl bg-accent-soft/80"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <motion.span className="relative" animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
                    <n.icon size={22} strokeWidth={active ? 2.4 : 2} />
                  </motion.span>
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <ActiveWorkoutBar path={loc.path} />
      <RestTimerBar />
      <Toaster />
    </div>
    </MotionConfig>
  );
}

function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

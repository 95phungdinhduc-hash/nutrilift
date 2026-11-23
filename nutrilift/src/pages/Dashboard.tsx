import { ChevronRight, Dumbbell, Flame, Play, Scale, Sprout, Target, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { LineChart } from "../components/charts";
import { Badge, Button, Card, NumberField, SectionTitle, Stat } from "../components/ui";
import { CaloriesSummary, quickLogWeight, usePhaseProgress, useTodayWorkoutDone, WaterTracker, WeeklyCheckIn } from "../components/widgets";
import { startProgramWorkout } from "../lib/actions";
import { addDays, formatDate, formatDuration, startOfWeek, today } from "../lib/date";
import { fmt } from "../lib/format";
import { useActiveProgram, useActiveWorkout, useFoodLogs, useFoodLogsRange, useGoals, useProfile, useTargets, useToday, useWeights, useWorkouts } from "../lib/hooks";
import { navigate } from "../lib/router";
import { PHASE_INFO, weightTrend } from "../nutrition/calc";
import { parseProgram, setsSummary } from "../training/liftoscript";
import { workoutSetCount, workoutVolume } from "../training/workout";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function WorkoutCard() {
  const program = useActiveProgram();
  const active = useActiveWorkout();
  const date = useToday();
  const doneToday = useTodayWorkoutDone(date);
  const parsed = useMemo(() => (program ? parseProgram(program.text) : undefined), [program]);
  const [starting, setStarting] = useState(false);

  if (active) {
    return (
      <Card className="border-train/40">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Dumbbell size={18} className="text-train" /> Đang tập: {active.dayName}
        </div>
        <Button variant="train" className="w-full" onClick={() => navigate("/training/workout")} icon={<Play size={18} />}>
          Tiếp tục buổi tập
        </Button>
      </Card>
    );
  }
  if (doneToday.length) {
    const w = doneToday[0];
    const sets = workoutSetCount(w);
    return (
      <Card>
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Trophy size={18} className="text-train" /> Đã tập hôm nay
        </div>
        <div className="text-sm text-muted">
          {w.dayName} · {formatDuration(((w.endedAt ?? w.startedAt) - w.startedAt) / 1000)} · {sets.done} set · {fmt(workoutVolume(w))} kg khối lượng
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate(`/training/history/${w.id}`)}>
          Xem chi tiết
        </Button>
      </Card>
    );
  }
  if (!program || !parsed?.days.length) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <Dumbbell size={18} className="text-train" /> Luyện tập
        </div>
        <p className="mb-3 text-sm text-muted">Chọn một chương trình để app tự gợi ý buổi tập và tăng tạ cho bạn.</p>
        <Button variant="train" onClick={() => navigate("/training/programs")}>
          Chọn chương trình
        </Button>
      </Card>
    );
  }
  const idx = program.nextDay % parsed.days.length;
  const day = parsed.days[idx];
  return (
    <Card className="tilt border-glow border-glow-train">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <Dumbbell size={18} className="shrink-0 text-train" />
          <span className="truncate">Buổi tiếp theo: {day.name}</span>
        </div>
        <Badge color="train" className="hidden sm:inline-flex">{program.name}</Badge>
      </div>
      <ul className="mb-3 space-y-0.5 text-sm text-muted">
        {day.exercises.slice(0, 6).map((e, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{e.name}</span>
            <span className="tabular shrink-0">{setsSummary(e.sets)}</span>
          </li>
        ))}
        {day.exercises.length > 6 && <li>+{day.exercises.length - 6} bài khác</li>}
      </ul>
      <Button
        variant="train"
        className="w-full"
        disabled={starting}
        icon={<Play size={18} />}
        onClick={async () => {
          setStarting(true);
          await startProgramWorkout(program, idx);
          navigate("/training/workout");
        }}
      >
        Bắt đầu tập
      </Button>
    </Card>
  );
}

function WeightCard() {
  const weights = useWeights();
  const date = useToday();
  const todayEntry = weights.find((w) => w.date === date);
  const [val, setVal] = useState<number | undefined>(undefined);
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const last30 = trend.filter((p) => p.date >= addDays(date, -30));
  const cur = trend[trend.length - 1]?.trend;
  const weekAgo = trend.find((p) => p.date === addDays(trend[trend.length - 1]?.date ?? date, -7))?.trend;
  const change = cur != null && weekAgo != null ? cur - weekAgo : undefined;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Scale size={18} className="text-protein" /> Cân nặng
        </div>
        <button className="text-xs font-semibold text-accent-ink" onClick={() => navigate("/progress")}>
          Chi tiết →
        </button>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Hôm nay" value={todayEntry ? `${fmt(todayEntry.kg, 1)}` : "–"} sub="kg" />
        <Stat label="Xu hướng" value={cur != null ? fmt(cur, 1) : "–"} sub="kg" />
        <Stat label="7 ngày" value={change != null ? `${change > 0 ? "+" : ""}${fmt(change, 2)}` : "–"} sub="kg" />
      </div>
      {last30.length > 1 && (
        <LineChart
          height={110}
          unit=" kg"
          series={[
            { name: "Cân", color: "var(--muted)", style: "dots", points: last30.filter((p) => p.raw != null).map((p) => ({ x: p.date, y: p.raw! })) },
            { name: "Xu hướng", color: "var(--protein)", points: last30.map((p) => ({ x: p.date, y: p.trend })) },
          ]}
        />
      )}
      {!todayEntry && (
        <div className="mt-2 flex gap-2">
          <NumberField className="flex-1" value={val} onChange={setVal} suffix="kg" placeholder="Cân sáng nay" step={0.1} />
          <Button
            disabled={!val}
            onClick={async () => {
              if (val) await quickLogWeight(date, val);
              setVal(undefined);
            }}
          >
            Lưu
          </Button>
        </div>
      )}
    </Card>
  );
}

function PhaseCard() {
  const p = usePhaseProgress();
  if (!p) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted">Chưa có giai đoạn (cutting/bulking) nào.</div>
          <Button size="sm" variant="secondary" onClick={() => navigate("/progress?tab=phase")}>
            Tạo giai đoạn
          </Button>
        </div>
      </Card>
    );
  }
  const info = PHASE_INFO[p.phase.type];
  const Icon = p.phase.type === "cut" ? Flame : p.phase.type === "bulk" ? Sprout : Target;
  const ratePerWeekKg = (p.phase.startWeightKg * p.phase.ratePctPerWeek) / 100;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: info.color + "22", color: info.color }}>
          <Icon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">
            {info.label} · tuần {p.week}
          </div>
          <div className="text-xs text-muted">
            Bắt đầu {formatDate(p.phase.startDate)} ở {fmt(p.phase.startWeightKg, 1)} kg · mục tiêu {ratePerWeekKg > 0 ? "+" : ""}
            {fmt(ratePerWeekKg, 2)} kg/tuần
          </div>
        </div>
        <div className="text-right">
          <div className="tabular text-lg font-extrabold" style={{ color: info.color }}>
            {p.change > 0 ? "+" : ""}
            {fmt(p.change, 1)} kg
          </div>
          {p.target && <div className="text-xs text-muted">→ {fmt(p.target, 1)} kg</div>}
        </div>
      </div>
      {p.pct != null && p.phase.type !== "maintain" && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full" style={{ width: `${Math.max(3, (p.phase.type === "bulk" ? 1 - p.pct : p.pct) * 100)}%`, background: info.color }} />
        </div>
      )}
    </Card>
  );
}

function WeekSummary() {
  const t = useToday();
  const from = startOfWeek(t);
  const logs = useFoodLogsRange(from, t);
  const workouts = useWorkouts().filter((w) => w.date >= from && w.endedAt);
  const goals = useGoals();
  const targets = useTargets(t);
  const days = new Set(logs.map((l) => l.date));
  const avgKcal = days.size ? logs.reduce((a, l) => a + l.n.kcal, 0) / days.size : 0;
  const avgP = days.size ? logs.reduce((a, l) => a + l.n.protein, 0) / days.size : 0;
  return (
    <Card>
      <SectionTitle action={<button onClick={() => navigate("/progress?tab=nutrition")} className="text-muted"><ChevronRight size={18} /></button>}>Tuần này</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Buổi tập" value={`${workouts.length}/${goals.trainingWeekdays.length}`} />
        <Stat label="Kcal TB/ngày" value={fmt(avgKcal)} sub={targets ? `mục tiêu ${fmt(targets.baseKcal)}` : undefined} />
        <Stat label="Protein TB" value={`${fmt(avgP)}g`} sub={targets ? `mục tiêu ${targets.protein}g` : undefined} />
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const date = useToday();
  const logs = useFoodLogs(date) ?? [];
  const targets = useTargets(date);
  const goals = useGoals();
  const { profile } = useProfile();
  return (
    <div className="stagger space-y-4">
      <div>
        <div className="text-sm font-medium text-muted">{formatDate(today(), { weekday: true, year: true })}</div>
        <h1 className="word-reveal text-[28px] leading-tight font-extrabold tracking-tight lg:text-[34px]">
          {greeting()
            .split(" ")
            .map((w, i) => (
              <span key={i} style={{ animationDelay: `${i * 90}ms` }}>
                {w}&nbsp;
              </span>
            ))}
          {profile?.name ? (
            <>
              <span style={{ animationDelay: "200ms" }}>,&nbsp;</span>
              <span className="text-gradient" style={{ animationDelay: "260ms" }}>
                {profile.name}&nbsp;
              </span>
            </>
          ) : null}
          <span className="origin-[70%_70%]" style={{ animation: "word-in 0.7s 0.3s cubic-bezier(0.16,1,0.3,1) both, wave 2.2s 0.9s ease-in-out 1" }}>
            👋
          </span>
        </h1>
      </div>
      <WeeklyCheckIn />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="stagger space-y-4">
          <PhaseCard />
          {targets && <CaloriesSummary logs={logs} targets={targets} onAdd={() => navigate(`/nutrition/add?d=${date}`)} />}
          <WaterTracker date={date} goalMl={goals.waterMl} />
        </div>
        <div className="stagger space-y-4">
          <WorkoutCard />
          <WeightCard />
          <WeekSummary />
        </div>
      </div>
    </div>
  );
}

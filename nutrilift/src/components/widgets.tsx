import { useLiveQuery } from "dexie-react-hooks";
import { Droplets, Dumbbell, Plus, Sparkles, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { alive, db, getMeta, put, remove, setKV, setMeta } from "../db/db";
import type { FoodLog, Goals } from "../db/types";
import { addWater } from "../lib/actions";
import { addDays, diffDays, formatDate, today } from "../lib/date";
import { fmt } from "../lib/format";
import { useGoals, usePhases, useProfile, useWater, useWeights } from "../lib/hooks";
import { activePhase, adaptiveTdee, phaseDailyDelta, referenceWeight, sumNutrients, tdeeFormula, type DayTargets } from "../nutrition/calc";
import { AnimatedNumber, Badge, Button, Card, MacroBar, ProgressRing, toast } from "./ui";

export function CaloriesSummary({ logs, targets, compact, onAdd }: { logs: FoodLog[]; targets: DayTargets; compact?: boolean; onAdd?: () => void }) {
  const total = sumNutrients(logs.map((l) => l.n));
  const remaining = targets.kcal - total.kcal;
  return (
    <Card className="ring-gradient overflow-hidden">
      <div className="flex items-center gap-4">
        <ProgressRing value={total.kcal} max={targets.kcal} size={compact ? 112 : 132} stroke={compact ? 11 : 12}>
          <AnimatedNumber value={Math.abs(remaining)} className="tabular text-[26px] leading-none font-extrabold tracking-tight" />
          <div className="mt-1 text-[11px] font-medium text-muted">{remaining >= 0 ? "kcal còn lại" : "kcal vượt"}</div>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>
              Đã ăn <AnimatedNumber value={total.kcal} className="tabular font-bold" />
            </span>
            <span className="text-muted">
              Mục tiêu <b className="tabular text-ink">{fmt(targets.kcal)}</b>
            </span>
            {targets.isTrainingDay && targets.cyclingDelta !== 0 && (
              <Badge color="train">
                <Dumbbell size={12} /> Ngày tập
              </Badge>
            )}
          </div>
          <MacroBar label="Protein" value={total.protein} target={targets.protein} color="var(--protein)" />
          <MacroBar label="Carb" value={total.carbs} target={targets.carbs} color="var(--carbs)" />
          <MacroBar label="Chất béo" value={total.fat} target={targets.fat} color="var(--fat)" />
        </div>
      </div>
      {(targets.activityBonus > 0 || targets.belowFloor) && (
        <div className="mt-3 space-y-1 text-xs text-muted">
          {targets.activityBonus > 0 && <div>+{fmt(targets.activityBonus)} kcal từ vận động đã ghi</div>}
          {targets.belowFloor && <div className="text-danger">⚠️ Mục tiêu dưới mức tối thiểu khuyến nghị — cân nhắc giảm tốc độ cutting.</div>}
        </div>
      )}
      {onAdd && (
        <Button className="mt-3 w-full" onClick={onAdd} icon={<Plus size={18} />}>
          Thêm món ăn
        </Button>
      )}
    </Card>
  );
}

export function WaterTracker({ date, goalMl }: { date: string; goalMl: number }) {
  const logs = useWater(date);
  const total = logs.reduce((a, l) => a + l.ml, 0);
  const last = [...logs].sort((a, b) => b.createdAt - a.createdAt)[0];
  const cups = Math.max(8, Math.ceil(goalMl / 250));
  const filled = Math.floor(total / 250);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Droplets size={18} className="text-protein" /> Nước
        </div>
        <div className="tabular text-sm text-muted">
          <b className="text-ink">{fmt(total / 1000, 2)}</b> / {fmt(goalMl / 1000, 1)} L
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Array.from({ length: cups }).map((_, i) => (
          <div key={i} className="relative h-7 w-5 overflow-hidden rounded-b-lg border-2 border-protein/40">
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-protein to-protein/50 transition-all duration-700 ease-out"
              style={{ height: i < filled ? "100%" : "0%", transitionDelay: `${i * 40}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => addWater(date, 250)}>
          +250 ml
        </Button>
        <Button size="sm" variant="secondary" onClick={() => addWater(date, 500)}>
          +500 ml
        </Button>
        {last && (
          <Button size="sm" variant="ghost" onClick={() => remove("waterLogs", last.id)} icon={<Undo2 size={14} />}>
            Hoàn tác
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Tổng kcal theo ngày trong khoảng (để tính TDEE thích ứng). */
export function useDailyIntake(days = 35): Record<string, number> | undefined {
  const to = today();
  const from = addDays(to, -days);
  return useLiveQuery(async () => {
    const logs = alive(await db.foodLogs.where("date").between(from, to, true, true).toArray());
    const out: Record<string, number> = {};
    for (const l of logs) out[l.date] = (out[l.date] ?? 0) + l.n.kcal;
    return out;
  }, [from, to]);
}

export function useAdaptive() {
  const { profile } = useProfile();
  const weights = useWeights();
  const intake = useDailyIntake();
  return useMemo(() => {
    if (!profile || !intake) return undefined;
    const end = addDays(today(), -1); // hôm nay chưa ghi xong
    const w = referenceWeight(weights) ?? 70;
    const formula = tdeeFormula(profile, w);
    return { ...adaptiveTdee({ dailyIntake: intake, weights, formulaTdee: formula, endDate: end }), formula, weightKg: w };
  }, [profile, weights, intake]);
}

/** Kiểm tra hằng tuần: đề xuất cập nhật TDEE theo dữ liệu thực tế (giống MacroFactor). */
export function WeeklyCheckIn({ force }: { force?: boolean }) {
  const goals = useGoals();
  const phases = usePhases();
  const a = useAdaptive();
  const snooze = useLiveQuery(() => getMeta<string>("checkin_snooze", ""), []);
  const [hidden, setHidden] = useState(false);
  if (!a || hidden) return null;
  const t = today();
  const lastDate = goals.tdeeSnapshot?.date;
  const due = !lastDate || diffDays(lastDate, t) >= 7;
  if (!force && (!a.enough || !due || snooze === t)) return null;

  const phase = activePhase(phases, t);
  const delta = phase ? phaseDailyDelta(phase.ratePctPerWeek, a.weightKg) : 0;
  const newTarget = Math.round(a.tdee + delta + goals.kcalAdjust);
  const ratePct = (a.slopeKgPerWeek / a.weightKg) * 100;

  const apply = async () => {
    const g: Goals = { ...goals, tdeeMode: "adaptive", tdeeSnapshot: { value: Math.round(a.tdee), date: t } };
    await setKV("goals", g);
    toast("Đã cập nhật TDEE theo dữ liệu thực tế");
    setHidden(true);
  };

  return (
    <Card className="border-accent/40 bg-accent-soft/40">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <Sparkles size={18} className="text-accent-ink" /> Kiểm tra hằng tuần
      </div>
      {!a.enough ? (
        <p className="text-sm text-muted">
          Cần ít nhất 10 ngày ghi chép ăn uống và 4 lần cân trong 3 tuần gần nhất để ước tính TDEE thực tế. Hiện có {a.loggedDays} ngày ghi chép, {a.weighIns} lần cân.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">Calo nạp TB</div>
              <div className="tabular font-bold">{fmt(a.avgIntake)} kcal</div>
            </div>
            <div>
              <div className="text-xs text-muted">Thay đổi cân</div>
              <div className="tabular font-bold">
                {a.slopeKgPerWeek > 0 ? "+" : ""}
                {fmt(a.slopeKgPerWeek, 2)} kg/tuần
              </div>
              <div className="text-xs text-muted">
                {ratePct > 0 ? "+" : ""}
                {fmt(ratePct, 2)}%{phase ? ` (mục tiêu ${phase.ratePctPerWeek > 0 ? "+" : ""}${fmt(phase.ratePctPerWeek, 2)}%)` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">TDEE thực tế</div>
              <div className="tabular font-bold">{fmt(a.tdee)} kcal</div>
              <div className="text-xs text-muted">công thức {fmt(a.formula)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Mục tiêu mới</div>
              <div className="tabular font-bold text-accent-ink">{fmt(newTarget)} kcal</div>
            </div>
          </div>
          <div className="mt-1 text-xs text-muted">
            Dựa trên {a.loggedDays} ngày ghi chép, {a.weighIns} lần cân trong {a.windowDays} ngày (độ tin cậy {fmt(a.confidence * 100)}%).
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={apply}>
              Áp dụng
            </Button>
            {!force && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await setMeta("checkin_snooze", t);
                  setHidden(true);
                }}
              >
                Để sau
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function usePhaseProgress() {
  const phases = usePhases();
  const weights = useWeights();
  const t = today();
  const phase = activePhase(phases, t);
  if (!phase) return null;
  const cur = referenceWeight(weights) ?? phase.startWeightKg;
  const week = Math.floor(diffDays(phase.startDate, t) / 7) + 1;
  const change = cur - phase.startWeightKg;
  const target = phase.targetWeightKg;
  const pct = target ? Math.max(0, Math.min(1, (phase.startWeightKg - cur) / (phase.startWeightKg - target))) : undefined;
  return { phase, cur, week, change, target, pct };
}

export function useTodayWorkoutDone(date: string) {
  return useLiveQuery(async () => alive(await db.workouts.where("date").equals(date).toArray()).filter((w) => w.endedAt), [date]) ?? [];
}

export async function quickLogWeight(date: string, kg: number) {
  await put("weights", { id: `w:${date}`, date, kg });
  toast(`Đã ghi ${fmt(kg, 1)} kg cho ${formatDate(date)}`);
}

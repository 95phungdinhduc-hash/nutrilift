// Các thẻ bổ sung cho Tổng quan: dải số liệu nổi bật, calo 7 ngày, nhóm cơ tuần này, mẹo hôm nay.
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, Dumbbell, Flame, Lightbulb, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { alive, db } from "../db/db";
import { addDays, rangeDays, startOfWeek, weekdayShort } from "../lib/date";
import { fmt } from "../lib/format";
import { useGoals, usePhases, useTargets, useToday, useWeights, useWorkouts } from "../lib/hooks";
import { navigate } from "../lib/router";
import { activePhase, referenceWeight } from "../nutrition/calc";
import { MUSCLE_LABELS, MUSCLE_ORDER } from "../training/exercises";
import { muscleSets } from "../training/stats";
import { BarChart, HBar } from "./charts";
import { AnimatedNumber, Card, cx, SectionTitle } from "./ui";

/** Tổng kcal theo ngày trong 60 ngày gần nhất. */
function useIntakeByDay(days = 60) {
  const t = useToday();
  const from = addDays(t, -days);
  return (
    useLiveQuery(async () => {
      const logs = alive(await db.foodLogs.where("date").between(from, t, true, true).toArray());
      const m: Record<string, { kcal: number; protein: number }> = {};
      for (const l of logs) {
        const cur = (m[l.date] ??= { kcal: 0, protein: 0 });
        cur.kcal += l.n.kcal;
        cur.protein += l.n.protein;
      }
      return m;
    }, [from, t]) ?? {}
  );
}

function HeroTile({
  icon,
  label,
  value,
  digits = 0,
  suffix,
  sub,
  gradient,
  onClick,
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
  digits?: number;
  suffix?: string;
  sub?: ReactNode;
  gradient: string;
  onClick?: () => void;
  delay?: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="card group relative overflow-hidden rounded-[1.35rem] p-4 text-left"
    >
      {/* vệt màu nền */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-60" style={{ background: gradient }} />
      <div className="relative flex items-center gap-2 text-xs font-semibold text-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl text-white shadow-lg" style={{ background: gradient }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="relative mt-2.5 flex items-baseline gap-1">
        {value == null ? (
          <span className="text-2xl font-extrabold text-muted">–</span>
        ) : (
          <AnimatedNumber value={value} digits={digits} className="tabular text-[26px] leading-none font-extrabold tracking-tight" />
        )}
        {suffix && value != null && <span className="text-sm font-semibold text-muted">{suffix}</span>}
      </div>
      {sub && <div className="relative mt-1 truncate text-xs text-muted">{sub}</div>}
    </motion.button>
  );
}

/** Dải 4 số liệu nổi bật ở đầu Tổng quan. */
export function HeroStats() {
  const t = useToday();
  const intake = useIntakeByDay(60);
  const workouts = useWorkouts();
  const goals = useGoals();
  const weights = useWeights();
  const phases = usePhases();
  const phase = activePhase(phases, t);

  // Chuỗi ngày liên tiếp có ghi chép (cho phép hôm nay chưa ghi)
  let streak = 0;
  let d = intake[t] ? t : addDays(t, -1);
  while (intake[d] && intake[d].kcal > 0 && streak < 400) {
    streak++;
    d = addDays(d, -1);
  }
  const last7 = rangeDays(addDays(t, -7), addDays(t, -1)).filter((x) => intake[x]?.kcal);
  const avg7 = last7.length ? last7.reduce((a, x) => a + intake[x].kcal, 0) / last7.length : null;
  const weekFrom = startOfWeek(t);
  const weekWorkouts = workouts.filter((w) => w.endedAt && w.date >= weekFrom).length;
  const cur = referenceWeight(weights);
  const change = phase && cur != null ? cur - phase.startWeightKg : null;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <HeroTile
        delay={0.05}
        icon={<CalendarCheck size={15} />}
        label="Chuỗi ghi chép"
        value={streak}
        suffix="ngày"
        sub={streak >= 7 ? "Tuyệt vời, giữ vững nhé! 🔥" : "Ghi đủ mỗi ngày để TDEE chính xác"}
        gradient="linear-gradient(135deg, var(--carbs), var(--train-2))"
        onClick={() => navigate("/nutrition")}
      />
      <HeroTile
        delay={0.1}
        icon={<Flame size={15} />}
        label="Calo TB 7 ngày"
        value={avg7 != null ? Math.round(avg7) : null}
        suffix="kcal"
        sub={`${last7.length}/7 ngày có ghi`}
        gradient="linear-gradient(135deg, var(--accent), var(--accent-2))"
        onClick={() => navigate("/progress?tab=nutrition")}
      />
      <HeroTile
        delay={0.15}
        icon={<Dumbbell size={15} />}
        label="Buổi tập tuần này"
        value={weekWorkouts}
        suffix={`/ ${goals.trainingWeekdays.length}`}
        sub={weekWorkouts >= goals.trainingWeekdays.length ? "Đã hoàn thành kế hoạch ✓" : "Theo kế hoạch ngày tập"}
        gradient="linear-gradient(135deg, var(--train), var(--train-2))"
        onClick={() => navigate("/training")}
      />
      <HeroTile
        delay={0.2}
        icon={change != null && change > 0 ? <TrendingUp size={15} /> : change != null && change < 0 ? <TrendingDown size={15} /> : <Scale size={15} />}
        label="Thay đổi từ đầu giai đoạn"
        value={change != null ? Math.round(change * 10) / 10 : null}
        digits={1}
        suffix="kg"
        sub={cur != null ? `Xu hướng hiện tại ${fmt(cur, 1)} kg` : "Cân mỗi sáng để theo dõi"}
        gradient="linear-gradient(135deg, var(--protein), var(--accent-2))"
        onClick={() => navigate("/progress")}
      />
    </div>
  );
}

/** Biểu đồ calo 7 ngày gần nhất so với mục tiêu. */
export function WeekCaloriesCard() {
  const t = useToday();
  const intake = useIntakeByDay(10);
  const targets = useTargets(t);
  const days = rangeDays(addDays(t, -6), t);
  const data = days.map((d) => ({ x: d, y: Math.round(intake[d]?.kcal ?? 0), label: d === t ? "Nay" : weekdayShort(d) }));
  const proteinDays = days.filter((d) => targets && (intake[d]?.protein ?? 0) >= targets.protein * 0.9).length;
  return (
    <Card>
      <SectionTitle
        action={
          <button className="text-xs font-semibold text-accent-ink" onClick={() => navigate("/progress?tab=nutrition")}>
            Chi tiết →
          </button>
        }
      >
        Calo 7 ngày
      </SectionTitle>
      <BarChart data={data} target={targets?.baseKcal} unit=" kcal" height={130} />
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>— — mục tiêu {targets ? fmt(targets.baseKcal) : "–"} kcal</span>
        <span>
          Đạt protein <b className="text-ink">{proteinDays}/7</b> ngày
        </span>
      </div>
    </Card>
  );
}

/** Số set mỗi nhóm cơ trong tuần (top 6). */
export function MuscleWeekCard() {
  const t = useToday();
  const workouts = useWorkouts();
  const weekFrom = startOfWeek(t);
  const ms = useMemo(() => muscleSets(workouts.filter((w) => w.endedAt && w.date >= weekFrom)), [workouts, weekFrom]);
  const top = MUSCLE_ORDER.filter((m) => ms[m]).sort((a, b) => ms[b] - ms[a]).slice(0, 6);
  const max = Math.max(10, ...top.map((m) => ms[m]));
  return (
    <Card>
      <SectionTitle>Nhóm cơ tuần này</SectionTitle>
      {top.length ? (
        <div className="space-y-2">
          {top.map((m) => (
            <HBar key={m} label={MUSCLE_LABELS[m]} value={ms[m]} max={max} hint="set" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-muted">
          <div className="animate-float text-3xl">🏋️</div>
          Hoàn thành buổi tập đầu tiên trong tuần để xem cơ nào đã được kích thích.
        </div>
      )}
    </Card>
  );
}

const TIPS: Record<"cut" | "maintain" | "bulk" | "any", string[]> = {
  cut: [
    "Giữ mức tạ nặng khi cutting — giảm số set chứ đừng giảm tạ. Đó là tín hiệu để cơ thể giữ cơ.",
    "Protein 2,0–2,4 g/kg mỗi ngày giúp giữ cơ tối đa khi thâm hụt calo.",
    "Ăn nhiều rau và đạm nạc để no lâu: ức gà, cá, trứng, đậu phụ, sữa chua Hy Lạp.",
    "Cân nặng dao động 1–2 kg do nước là bình thường. Hãy nhìn đường xu hướng, không nhìn số lẻ.",
    "Đi bộ 7.000–10.000 bước/ngày tăng tiêu hao mà không ảnh hưởng hồi phục buổi tập.",
    "Ngủ đủ 7–9 tiếng: thiếu ngủ làm tăng cảm giác đói và giảm sức mạnh.",
    "Cutting kéo dài trên 12 tuần? Cân nhắc 1–2 tuần ăn duy trì để hồi phục tinh thần và hormone.",
  ],
  bulk: [
    "Lean bulk +0,25%/tuần là đủ — tăng nhanh hơn chủ yếu là mỡ.",
    "Khi bulking, tăng dần khối lượng tập: thêm 1 set cho nhóm cơ ưu tiên mỗi 2–3 tuần.",
    "Khó ăn đủ calo? Uống thêm sữa, sinh tố chuối + bơ đậu phộng, thêm dầu oliu vào món ăn.",
    "Ưu tiên tiến bộ sức mạnh ở các bài compound — đó là dấu hiệu tăng cơ đáng tin cậy.",
    "Ăn đủ carb quanh buổi tập (trước và sau) để có năng lượng tập nặng.",
    "Theo dõi vòng eo: tăng nhanh hơn ~1 cm/tháng nghĩa là bạn đang tăng mỡ quá nhiều.",
  ],
  maintain: [
    "Giai đoạn duy trì là lúc tuyệt vời để tập tăng sức mạnh với mức tạ nặng.",
    "Sau cutting, duy trì 2–4 tuần giúp cân nặng và hormone ổn định trước khi bulk.",
    "Giữ protein ~1,8 g/kg và ăn quanh TDEE — app sẽ tự hiệu chỉnh theo dữ liệu của bạn.",
  ],
  any: [
    "Ghi món ăn ngay sau khi ăn sẽ chính xác hơn nhiều so với ghi bù cuối ngày.",
    "Dùng Công thức cho món nấu sẵn (meal-prep) để ghi chỉ với 1 chạm.",
    "Khởi động kỹ: các set khởi động 30–50–80% giúp tập nặng an toàn hơn.",
    "Uống đủ nước — mất nước 2% đã làm giảm hiệu suất tập rõ rệt.",
  ],
};

/** Mẹo thay đổi mỗi ngày, theo giai đoạn hiện tại. */
export function TipCard() {
  const t = useToday();
  const phases = usePhases();
  const phase = activePhase(phases, t);
  const pool = [...TIPS[phase?.type ?? "maintain"], ...TIPS.any];
  const dayNum = Math.floor(new Date(t).getTime() / 86400000);
  const tip = pool[dayNum % pool.length];
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-6 -bottom-8 text-[110px] leading-none opacity-[0.07] select-none">💡</div>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className={cx("flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-accent text-white shadow-lg dark:text-slate-950")}>
          <Lightbulb size={15} />
        </span>
        Mẹo hôm nay
      </div>
      <p className="relative text-[15px] leading-relaxed text-ink/90">{tip}</p>
    </Card>
  );
}

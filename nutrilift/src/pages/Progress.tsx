import { useLiveQuery } from "dexie-react-hooks";
import { Flag, Flame, Scale, Sprout, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarChart, LineChart } from "../components/charts";
import { Badge, Button, Card, cx, Empty, IconButton, NumberField, Segmented, SectionTitle, Stat, TextField, Toggle, toast } from "../components/ui";
import { useAdaptive, WeeklyCheckIn } from "../components/widgets";
import { alive, db, put, remove, setKV } from "../db/db";
import type { Measurement, Phase, PhaseType } from "../db/types";
import { logWeight, startPhase } from "../lib/actions";
import { addDays, diffDays, formatDate, rangeDays, today } from "../lib/date";
import { fmt } from "../lib/format";
import { useGoals, usePhases, useProfile, useWeights, useWorkouts } from "../lib/hooks";
import { navigate, useLocation } from "../lib/router";
import {
  activePhase,
  computeTargets,
  DEFAULT_FAT_PCT,
  DEFAULT_PROTEIN_PER_KG,
  PHASE_INFO,
  RATE_PRESETS,
  referenceWeight,
  weeksToTarget,
  weightSlope,
  weightTrend,
} from "../nutrition/calc";
import { exerciseHistory, topExercises } from "../training/stats";

type Tab = "weight" | "measure" | "strength" | "nutrition" | "phase";

function WeightTab() {
  const weights = useWeights();
  const phases = usePhases();
  const t = today();
  const [date, setDate] = useState(t);
  const [kg, setKg] = useState<number | undefined>();
  const [range, setRange] = useState<number>(90);
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const from = range ? addDays(t, -range) : "0000";
  const shown = trend.filter((p) => p.date >= from);
  const phase = activePhase(phases, t);
  const cur = trend[trend.length - 1]?.trend;
  const at = (days: number) => trend.find((p) => p.date === addDays(trend[trend.length - 1]?.date ?? t, -days))?.trend;
  const s = weightSlope(weights, addDays(t, -20), t);
  const ratePct = cur && s.n >= 3 ? ((s.slope * 7) / cur) * 100 : undefined;

  return (
    <div className="stagger space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <TextField className="w-40" type="date" label="Ngày" value={date} max={t} onChange={(e) => setDate(e.target.value || t)} />
          <NumberField className="w-32" label="Cân nặng" suffix="kg" value={kg} onChange={setKg} step={0.1} />
          <Button
            disabled={!kg}
            onClick={async () => {
              await logWeight(date, kg!);
              toast(`Đã lưu ${fmt(kg, 1)} kg`);
              setKg(undefined);
            }}
          >
            Lưu
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">Mẹo: cân mỗi sáng sau khi đi vệ sinh, trước khi ăn. App dùng đường xu hướng nên dao động nước hằng ngày không ảnh hưởng.</p>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Xu hướng hiện tại" value={cur ? `${fmt(cur, 1)} kg` : "–"} />
        <Stat label="7 ngày" value={cur && at(7) ? `${cur - at(7)! > 0 ? "+" : ""}${fmt(cur - at(7)!, 2)} kg` : "–"} />
        <Stat label="30 ngày" value={cur && at(30) ? `${cur - at(30)! > 0 ? "+" : ""}${fmt(cur - at(30)!, 2)} kg` : "–"} />
        <Stat
          label="Tốc độ (3 tuần)"
          value={ratePct != null ? `${ratePct > 0 ? "+" : ""}${fmt(ratePct, 2)}%/tuần` : "–"}
          sub={phase ? `mục tiêu ${phase.ratePctPerWeek > 0 ? "+" : ""}${fmt(phase.ratePctPerWeek, 2)}%` : undefined}
        />
      </div>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionTitle className="mb-0">Biểu đồ</SectionTitle>
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { value: 30, label: "30N" },
              { value: 90, label: "90N" },
              { value: 180, label: "6T" },
              { value: 365, label: "1N" },
              { value: 0, label: "Tất cả" },
            ]}
          />
        </div>
        <LineChart
          height={220}
          unit=" kg"
          refLine={phase?.targetWeightKg ? { y: phase.targetWeightKg, label: `Mục tiêu ${fmt(phase.targetWeightKg, 1)} kg` } : undefined}
          series={[
            { name: "Cân", color: "var(--muted)", style: "dots", points: shown.filter((p) => p.raw != null).map((p) => ({ x: p.date, y: p.raw! })) },
            { name: "Xu hướng", color: "var(--protein)", points: shown.map((p) => ({ x: p.date, y: p.trend })) },
          ]}
        />
      </Card>
      <Card>
        <SectionTitle>Lịch sử cân</SectionTitle>
        {[...weights]
          .reverse()
          .slice(0, 40)
          .map((w) => (
            <div key={w.id} className="flex items-center justify-between py-1 text-sm">
              <span>{formatDate(w.date, { weekday: true, year: true })}</span>
              <span className="flex items-center gap-2">
                <b className="tabular">{fmt(w.kg, 1)} kg</b>
                <IconButton label="Xoá" onClick={() => remove("weights", w.id)}>
                  <Trash2 size={15} />
                </IconButton>
              </span>
            </div>
          ))}
        {!weights.length && <Empty title="Chưa có dữ liệu cân nặng" />}
      </Card>
    </div>
  );
}

/** Ước tính % mỡ theo công thức Hải quân Mỹ (US Navy). */
function navyBodyFat(sex: "male" | "female", heightCm: number, m: Measurement): number | undefined {
  if (!m.waistCm || !m.neckCm) return undefined;
  if (sex === "male") {
    if (m.waistCm <= m.neckCm) return undefined;
    return 495 / (1.0324 - 0.19077 * Math.log10(m.waistCm - m.neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  if (!m.hipCm) return undefined;
  return 495 / (1.29579 - 0.35004 * Math.log10(m.waistCm + m.hipCm - m.neckCm) + 0.221 * Math.log10(heightCm)) - 450;
}

const MEASURE_FIELDS: { key: keyof Measurement; label: string }[] = [
  { key: "waistCm", label: "Vòng eo (ngang rốn)" },
  { key: "hipCm", label: "Vòng mông" },
  { key: "chestCm", label: "Vòng ngực" },
  { key: "armCm", label: "Bắp tay" },
  { key: "thighCm", label: "Đùi" },
  { key: "neckCm", label: "Cổ" },
];

function MeasureTab() {
  const t = today();
  const { profile } = useProfile();
  const list = useLiveQuery(async () => alive(await db.measurements.orderBy("date").toArray()), []) ?? [];
  const existing = list.find((m) => m.date === t);
  const [m, setM] = useState<Partial<Measurement>>({});
  const loadedId = existing?.id;
  useEffect(() => {
    if (existing) setM(existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);
  const [metric, setMetric] = useState<keyof Measurement>("waistCm");
  const navy = profile ? navyBodyFat(profile.sex, profile.heightCm, m as Measurement) : undefined;
  return (
    <div className="stagger space-y-4">
      <Card className="space-y-3">
        <div className="font-semibold">Số đo hôm nay (cm)</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MEASURE_FIELDS.map((f) => (
            <NumberField key={f.key} label={f.label} suffix="cm" value={m[f.key] as number | undefined} onChange={(v) => setM({ ...m, [f.key]: v })} step={0.5} />
          ))}
          <NumberField label="% mỡ cơ thể" hint={navy ? `Navy ≈ ${fmt(navy, 1)}%` : "tuỳ chọn"} suffix="%" value={m.bodyFatPct} onChange={(v) => setM({ ...m, bodyFatPct: v })} step={0.5} />
        </div>
        <Button
          onClick={async () => {
            await put("measurements", { ...m, id: `m:${t}`, date: t, bodyFatPct: m.bodyFatPct ?? (navy ? Math.round(navy * 10) / 10 : undefined) } as Measurement);
            toast("Đã lưu số đo");
          }}
        >
          Lưu số đo
        </Button>
        <p className="text-xs text-muted">Khi cutting, vòng eo giảm trong khi số đo tay/ngực giữ nguyên là dấu hiệu tốt: bạn đang mất mỡ chứ không mất cơ.</p>
      </Card>
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle className="mb-0">Xu hướng</SectionTitle>
          <select className="field w-auto py-1 text-sm" value={metric} onChange={(e) => setMetric(e.target.value as keyof Measurement)}>
            {MEASURE_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
            <option value="bodyFatPct">% mỡ cơ thể</option>
          </select>
        </div>
        <LineChart
          unit={metric === "bodyFatPct" ? "%" : " cm"}
          series={[{ name: "Số đo", color: "var(--accent)", style: "both", points: list.filter((x) => x[metric] != null).map((x) => ({ x: x.date, y: x[metric] as number })) }]}
        />
      </Card>
      <Card>
        <SectionTitle>Lịch sử</SectionTitle>
        {[...list].reverse().map((x) => (
          <div key={x.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span className="shrink-0">{formatDate(x.date, { year: true })}</span>
            <span className="truncate text-muted">
              {MEASURE_FIELDS.filter((f) => x[f.key] != null)
                .map((f) => `${f.label.split(" ")[0]} ${x[f.key]}`)
                .join(" · ")}
              {x.bodyFatPct ? ` · mỡ ${x.bodyFatPct}%` : ""}
            </span>
            <IconButton label="Xoá" onClick={() => remove("measurements", x.id)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        {!list.length && <Empty title="Chưa có số đo" />}
      </Card>
    </div>
  );
}

function StrengthTab() {
  const workouts = useWorkouts();
  const phases = usePhases();
  const phase = activePhase(phases, today());
  const top = useMemo(() => topExercises(workouts, 8), [workouts]);
  if (!top.length) return <Empty title="Chưa có dữ liệu tập luyện" desc="Hoàn thành vài buổi tập để xem tiến bộ sức mạnh." />;
  return (
    <div className="stagger space-y-4">
      {phase && (
        <Card>
          <SectionTitle>Sức mạnh từ đầu giai đoạn ({PHASE_INFO[phase.type].label})</SectionTitle>
          {top.map((t) => {
            const h = exerciseHistory(workouts, t.exerciseId);
            const inPhase = h.filter((x) => x.date >= phase.startDate);
            const before = h.filter((x) => x.date < phase.startDate).slice(-1)[0] ?? inPhase[0];
            const last = inPhase[inPhase.length - 1];
            if (!before || !last) return null;
            const pct = ((last.e1rm - before.e1rm) / before.e1rm) * 100;
            return (
              <div key={t.exerciseId} className="flex items-center justify-between py-1 text-sm">
                <span className="truncate">{t.name}</span>
                <span className="tabular shrink-0">
                  {fmt(before.e1rm, 1)} → <b>{fmt(last.e1rm, 1)}</b> kg{" "}
                  <span className={cx("font-semibold", pct >= -2 ? "text-accent-ink" : "text-danger")}>
                    ({pct > 0 ? "+" : ""}
                    {fmt(pct, 1)}%)
                  </span>
                </span>
              </div>
            );
          })}
          {phase.type === "cut" && <p className="mt-2 text-xs text-muted">Khi cutting, giữ 1RM ước tính trong khoảng ±2–5% là thành công — nghĩa là bạn đang giữ được cơ.</p>}
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {top.map((t) => {
          const h = exerciseHistory(workouts, t.exerciseId);
          return (
            <Card key={t.exerciseId}>
              <button className="mb-1 text-left font-semibold hover:underline" onClick={() => navigate(`/training/exercise/${t.exerciseId}`)}>
                {t.name}
              </button>
              <div className="mb-1 text-xs text-muted">1RM ước tính (kg) · {h.length} buổi</div>
              <LineChart height={130} unit=" kg" series={[{ name: "1RM", color: "var(--train)", style: "both", points: h.map((x) => ({ x: x.date, y: x.e1rm })) }]} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function NutritionTab() {
  const t = today();
  const [days, setDays] = useState(14);
  const from = addDays(t, -(days - 1));
  const logs = useLiveQuery(async () => alive(await db.foodLogs.where("date").between(from, t, true, true).toArray()), [from, t]) ?? [];
  const { profile } = useProfile();
  const goals = useGoals();
  const phases = usePhases();
  const weights = useWeights();
  const a = useAdaptive();
  const dates = rangeDays(from, t);
  const byDate = new Map<string, { kcal: number; p: number; c: number; f: number }>();
  for (const l of logs) {
    const cur = byDate.get(l.date) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    cur.kcal += l.n.kcal;
    cur.p += l.n.protein;
    cur.c += l.n.carbs;
    cur.f += l.n.fat;
    byDate.set(l.date, cur);
  }
  const logged = [...byDate.values()];
  const avg = (k: "kcal" | "p" | "c" | "f") => (logged.length ? logged.reduce((x, y) => x + y[k], 0) / logged.length : 0);
  const targets = profile ? computeTargets({ profile, goals, phases, weights, date: t }) : undefined;
  const hit = targets ? logged.filter((d) => Math.abs(d.kcal - targets.baseKcal) <= targets.baseKcal * 0.1).length : 0;
  const pHit = targets ? logged.filter((d) => d.p >= targets.protein * 0.9).length : 0;
  return (
    <div className="stagger space-y-4">
      <WeeklyCheckIn force />
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle className="mb-0">Calo mỗi ngày</SectionTitle>
          <Segmented
            size="sm"
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7N" },
              { value: 14, label: "14N" },
              { value: 30, label: "30N" },
            ]}
          />
        </div>
        <BarChart
          target={targets?.baseKcal}
          unit=" kcal"
          data={dates.map((d) => ({ x: d, y: Math.round(byDate.get(d)?.kcal ?? 0), label: days > 14 ? (Number(d.slice(8)) % 5 === 0 ? d.slice(8) : "") : formatDate(d).split("/")[0] }))}
        />
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Kcal TB (ngày có ghi)" value={fmt(avg("kcal"))} sub={targets ? `mục tiêu ${fmt(targets.baseKcal)}` : undefined} />
        <Stat label="Protein TB" value={`${fmt(avg("p"))} g`} sub={targets ? `mục tiêu ${targets.protein} g` : undefined} />
        <Stat label="Đạt calo ±10%" value={`${hit}/${logged.length}`} sub="ngày" />
        <Stat label="Đạt protein" value={`${pHit}/${logged.length}`} sub="ngày" />
      </div>
      {a && (
        <Card className="text-sm">
          <SectionTitle>Năng lượng tiêu hao (TDEE)</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Theo công thức" value={`${fmt(a.formula)} kcal`} />
            <Stat label="Theo dữ liệu thực tế" value={a.enough ? `${fmt(a.observed)} kcal` : "Chưa đủ dữ liệu"} sub={a.enough ? `độ tin cậy ${fmt(a.confidence * 100)}%` : `${a.loggedDays}/10 ngày, ${a.weighIns}/4 lần cân`} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Đang dùng: {goals.tdeeMode === "adaptive" && goals.tdeeSnapshot ? `TDEE thích ứng ${fmt(goals.tdeeSnapshot.value)} kcal (cập nhật ${formatDate(goals.tdeeSnapshot.date)})` : "TDEE theo công thức"}.{" "}
            {goals.tdeeMode === "adaptive" && (
              <button className="font-semibold text-accent-ink" onClick={() => setKV("goals", { ...goals, tdeeMode: "formula" })}>
                Quay lại công thức
              </button>
            )}
          </p>
        </Card>
      )}
    </div>
  );
}

function PhaseTab() {
  const phases = usePhases();
  const weights = useWeights();
  const goals = useGoals();
  const t = today();
  const cur = activePhase(phases, t);
  const w = referenceWeight(weights) ?? 70;
  const [type, setType] = useState<PhaseType>(cur?.type === "cut" ? "maintain" : cur?.type === "maintain" ? "bulk" : "cut");
  const [rate, setRate] = useState(type === "cut" ? -0.75 : type === "bulk" ? 0.25 : 0);
  const [target, setTarget] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [updMacros, setUpdMacros] = useState(true);
  const [editRate, setEditRate] = useState<number | undefined>(cur?.ratePctPerWeek);
  const [editTarget, setEditTarget] = useState<number | undefined>(cur?.targetWeightKg);
  useEffect(() => {
    setEditRate(cur?.ratePctPerWeek);
    setEditTarget(cur?.targetWeightKg);
  }, [cur?.id, cur?.ratePctPerWeek, cur?.targetWeightKg]);

  const pick = (p: PhaseType) => {
    setType(p);
    setRate(p === "cut" ? -0.75 : p === "bulk" ? 0.25 : 0);
  };
  const phaseWeightAt = (p: Phase, end?: string) => {
    const list = weights.filter((x) => x.date >= p.startDate && (!end || x.date <= end));
    return list.length ? referenceWeight(list) : undefined;
  };

  return (
    <div className="stagger space-y-4">
      {cur && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-muted uppercase">Giai đoạn hiện tại</div>
              <div className="text-lg font-bold" style={{ color: PHASE_INFO[cur.type].color }}>
                {PHASE_INFO[cur.type].label}
              </div>
              <div className="text-xs text-muted">
                Từ {formatDate(cur.startDate, { year: true })} ({Math.floor(diffDays(cur.startDate, t) / 7)} tuần) · {fmt(cur.startWeightKg, 1)} → {fmt(w, 1)} kg
              </div>
            </div>
          </div>
          {cur.type !== "maintain" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Tốc độ" suffix="%/tuần" value={editRate} onChange={setEditRate} step={0.05} />
              <NumberField label="Cân mục tiêu" suffix="kg" value={editTarget} onChange={setEditTarget} step={0.5} />
            </div>
          )}
          {cur.targetWeightKg && cur.ratePctPerWeek !== 0 && (
            <div className="mt-2 text-sm text-muted">Dự kiến còn ~{weeksToTarget(w, cur.targetWeightKg, cur.ratePctPerWeek)} tuần để đạt mục tiêu.</div>
          )}
          {cur.type !== "maintain" && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={async () => {
                await put("phases", { ...cur, ratePctPerWeek: editRate ?? cur.ratePctPerWeek, targetWeightKg: editTarget });
                toast("Đã cập nhật giai đoạn");
              }}
            >
              Lưu thay đổi
            </Button>
          )}
        </Card>
      )}
      <Card className="space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Flag size={18} /> {cur ? "Chuyển sang giai đoạn mới" : "Bắt đầu giai đoạn"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["cut", "maintain", "bulk"] as PhaseType[]).map((p) => {
            const Icon = p === "cut" ? Flame : p === "bulk" ? Sprout : Scale;
            return (
              <button
                key={p}
                onClick={() => pick(p)}
                className={cx("flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold", type === p ? "border-accent bg-accent-soft" : "border-line")}
              >
                <Icon size={20} style={{ color: PHASE_INFO[p].color }} />
                {PHASE_INFO[p].label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted">{PHASE_INFO[type].desc}</p>
        {type !== "maintain" && (
          <select className="field" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATE_PRESETS[type].map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} ≈ {fmt((w * r.value) / 100, 2)} kg/tuần
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Cân mục tiêu" hint="tuỳ chọn" suffix="kg" value={target} onChange={setTarget} step={0.5} />
          <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Bulk mùa đông" />
        </div>
        <Toggle
          checked={updMacros}
          onChange={setUpdMacros}
          label="Cập nhật protein & chất béo theo giai đoạn"
          desc={`Protein ${DEFAULT_PROTEIN_PER_KG[type]} g/kg, chất béo ${DEFAULT_FAT_PCT[type]}% calo`}
        />
        {type === "bulk" && cur?.type === "cut" && (
          <p className="rounded-xl bg-surface-2 p-2.5 text-xs text-muted">
            💡 Sau cutting nên duy trì 2–4 tuần (hoặc reverse diet tăng dần ~100–150 kcal/tuần) trước khi bulk để ổn định cân nặng và hormone.
          </p>
        )}
        <Button
          onClick={async () => {
            await startPhase({ type, startDate: t, startWeightKg: Math.round(w * 10) / 10, targetWeightKg: target, ratePctPerWeek: type === "maintain" ? 0 : rate, note: note || undefined });
            if (updMacros) await setKV("goals", { ...goals, proteinPerKg: DEFAULT_PROTEIN_PER_KG[type], fatPct: DEFAULT_FAT_PCT[type] });
            toast(`Đã bắt đầu: ${PHASE_INFO[type].label}`);
          }}
          icon={<Target size={18} />}
        >
          Bắt đầu từ hôm nay
        </Button>
      </Card>
      <Card>
        <SectionTitle>Lịch sử giai đoạn</SectionTitle>
        {[...phases].reverse().map((p) => {
          const endW = phaseWeightAt(p, p.endDate);
          return (
            <div key={p.id} className="flex items-center gap-3 py-2">
              <div className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_INFO[p.type].color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  {PHASE_INFO[p.type].label}
                  {p === cur && <Badge color="accent">Hiện tại</Badge>}
                </div>
                <div className="truncate text-xs text-muted">
                  {formatDate(p.startDate, { year: true })} → {p.endDate ? formatDate(p.endDate, { year: true }) : "nay"} · {fmt(p.startWeightKg, 1)} → {endW ? fmt(endW, 1) : "–"} kg
                  {p.note ? ` · ${p.note}` : ""}
                </div>
              </div>
              <IconButton label="Xoá" onClick={() => confirm("Xoá giai đoạn này?") && remove("phases", p.id)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
          );
        })}
        {!phases.length && <Empty title="Chưa có giai đoạn nào" />}
      </Card>
    </div>
  );
}

export default function Progress() {
  const { query } = useLocation();
  const tab = (query.get("tab") as Tab) || "weight";
  return (
    <div className="stagger mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">Tiến độ</h1>
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
        <Segmented
          className="min-w-max"
          value={tab}
          onChange={(v) => navigate(`/progress?tab=${v}`, { replace: true })}
          options={[
            { value: "weight", label: "Cân nặng" },
            { value: "measure", label: "Số đo" },
            { value: "strength", label: "Sức mạnh" },
            { value: "nutrition", label: "Dinh dưỡng" },
            { value: "phase", label: "Giai đoạn" },
          ]}
        />
      </div>
      {tab === "weight" && <WeightTab />}
      {tab === "measure" && <MeasureTab />}
      {tab === "strength" && <StrengthTab />}
      {tab === "nutrition" && <NutritionTab />}
      {tab === "phase" && <PhaseTab />}
    </div>
  );
}

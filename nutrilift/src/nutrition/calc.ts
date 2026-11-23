import type { ActivityLevel, Goals, Nutrients, Phase, PhaseType, Profile, WeightEntry } from "../db/types";
import { addDays, diffDays, isoWeekday, parseISODate } from "../lib/date";
import { clamp } from "../lib/format";

export const KCAL_PER_KG = 7700; // năng lượng ước tính của 1 kg mô mỡ

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; desc: string; mult: number; pal: number }[] = [
  { id: "sedentary", label: "Ít vận động", desc: "Làm văn phòng, hầu như không tập", mult: 1.2, pal: 1.25 },
  { id: "light", label: "Nhẹ", desc: "Đi lại nhiều hoặc tập 1–3 buổi/tuần", mult: 1.375, pal: 1.5 },
  { id: "moderate", label: "Vừa", desc: "Tập tạ/thể thao 3–5 buổi/tuần", mult: 1.55, pal: 1.6 },
  { id: "active", label: "Năng động", desc: "Tập 6–7 buổi/tuần hoặc công việc chân tay", mult: 1.725, pal: 1.75 },
  { id: "very_active", label: "Rất năng động", desc: "Tập 2 buổi/ngày hoặc lao động nặng", mult: 1.9, pal: 2.2 },
];

export const PHASE_INFO: Record<PhaseType, { label: string; color: string; desc: string }> = {
  cut: { label: "Giảm mỡ (Cutting)", color: "#f43f5e", desc: "Thâm hụt calo, protein cao, giữ cường độ tập để giữ cơ." },
  maintain: { label: "Duy trì", color: "#0ea5e9", desc: "Ăn quanh TDEE, ổn định cân nặng, tập tăng sức mạnh." },
  bulk: { label: "Tăng cơ (Bulking)", color: "#22c55e", desc: "Dư calo nhẹ, tăng khối lượng tập để xây cơ." },
};

/** Mức thay đổi cân nặng gợi ý (% / tuần). */
export const RATE_PRESETS: Record<PhaseType, { value: number; label: string }[]> = {
  cut: [
    { value: -0.25, label: "Rất nhẹ (−0,25%/tuần)" },
    { value: -0.5, label: "Nhẹ nhàng (−0,5%/tuần)" },
    { value: -0.75, label: "Vừa phải (−0,75%/tuần) — khuyên dùng" },
    { value: -1, label: "Nhanh (−1%/tuần)" },
  ],
  maintain: [{ value: 0, label: "Giữ cân" }],
  bulk: [
    { value: 0.1, label: "Lean bulk rất chậm (+0,1%/tuần)" },
    { value: 0.25, label: "Lean bulk (+0,25%/tuần) — khuyên dùng" },
    { value: 0.5, label: "Bulk nhanh (+0,5%/tuần)" },
  ],
};

export const DEFAULT_PROTEIN_PER_KG: Record<PhaseType, number> = { cut: 2.2, maintain: 1.8, bulk: 1.8 };
export const DEFAULT_FAT_PCT: Record<PhaseType, number> = { cut: 25, maintain: 28, bulk: 27 };

export function ageFromBirthYear(birthYear: number, atDate = new Date()): number {
  return atDate.getFullYear() - birthYear;
}

// ---------- BMR / TDEE ----------
export function bmrMifflin(p: Profile, weightKg: number): number {
  const age = ageFromBirthYear(p.birthYear);
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * age;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function bmrKatch(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * lbm;
}

/** Hệ số PA trong công thức IOM 2005 (port từ OpenNutriTracker). */
function iomPA(pal: number, male: boolean): number {
  if (pal < 1.4) return 1.0;
  if (pal < 1.6) return male ? 1.12 : 1.14;
  if (pal < 1.9) return male ? 1.27 : 1.27;
  return male ? 1.54 : 1.45;
}

/** TDEE theo phương trình IOM 2005 (như OpenNutriTracker). */
export function tdeeIOM2005(p: Profile, weightKg: number): number {
  const age = ageFromBirthYear(p.birthYear);
  const pal = ACTIVITY_LEVELS.find((a) => a.id === p.activity)?.pal ?? 1.5;
  const h = p.heightCm / 100;
  if (p.sex === "male") return 864 - 9.72 * age + iomPA(pal, true) * (14.2 * weightKg + 503 * h);
  return 387 - 7.31 * age + iomPA(pal, false) * (10.9 * weightKg + 660.7 * h);
}

export function bmr(p: Profile, weightKg: number): number {
  if (p.formula === "katch" && p.bodyFatPct) return bmrKatch(weightKg, p.bodyFatPct);
  return bmrMifflin(p, weightKg);
}

export function tdeeFormula(p: Profile, weightKg: number): number {
  if (p.formula === "iom2005") return tdeeIOM2005(p, weightKg);
  const mult = ACTIVITY_LEVELS.find((a) => a.id === p.activity)?.mult ?? 1.55;
  return bmr(p, weightKg) * mult;
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiLabel(v: number): string {
  if (v < 18.5) return "Thiếu cân";
  if (v < 23) return "Bình thường";
  if (v < 25) return "Thừa cân (chuẩn châu Á)";
  if (v < 30) return "Tiền béo phì";
  return "Béo phì";
}

/** Ngưỡng calo tối thiểu khuyến nghị (như OpenNutriTracker). */
export function kcalFloor(sex: Profile["sex"]): number {
  return sex === "male" ? 1500 : 1200;
}

/** Chênh lệch kcal/ngày tương ứng tốc độ thay đổi cân nặng mong muốn. */
export function phaseDailyDelta(ratePctPerWeek: number, weightKg: number): number {
  return ((ratePctPerWeek / 100) * weightKg * KCAL_PER_KG) / 7;
}

export function activePhase(phases: Phase[], date: string): Phase | undefined {
  return phases
    .filter((p) => !p.deleted && p.startDate <= date && (!p.endDate || p.endDate >= date))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

// ---------- Xu hướng cân nặng ----------
export interface TrendPoint {
  date: string;
  raw?: number;
  trend: number;
}

/**
 * Đường xu hướng cân nặng (trung bình trượt hàm mũ theo ngày, alpha 0.1 như "Hacker's Diet"),
 * nội suy tuyến tính cho các ngày không cân.
 */
export function weightTrend(entries: WeightEntry[], alpha = 0.1): TrendPoint[] {
  const sorted = entries.filter((e) => !e.deleted && e.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const byDate = new Map(sorted.map((e) => [e.date, e.kg]));
  const out: TrendPoint[] = [];
  let trend = sorted[0].kg;
  let prevIdx = 0;
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const n = diffDays(first, last);
  for (let i = 0; i <= n; i++) {
    const d = addDays(first, i);
    let value = byDate.get(d);
    let raw = value;
    if (value === undefined) {
      // nội suy giữa hai lần cân gần nhất
      while (prevIdx + 1 < sorted.length && sorted[prevIdx + 1].date < d) prevIdx++;
      const a = sorted[prevIdx];
      const b = sorted[prevIdx + 1];
      const span = diffDays(a.date, b.date);
      value = a.kg + ((b.kg - a.kg) * diffDays(a.date, d)) / span;
    } else {
      while (prevIdx + 1 < sorted.length && sorted[prevIdx + 1].date <= d) prevIdx++;
    }
    trend = i === 0 ? value : trend + alpha * (value - trend);
    out.push({ date: d, raw, trend });
  }
  return out;
}

/** Hệ số góc hồi quy tuyến tính (kg/ngày) cho các lần cân trong khoảng [from, to]. */
export function weightSlope(entries: WeightEntry[], from: string, to: string): { slope: number; n: number; spanDays: number } {
  const pts = entries
    .filter((e) => !e.deleted && e.date >= from && e.date <= to && e.kg > 0)
    .map((e) => ({ x: diffDays(from, e.date), y: e.kg }));
  const n = pts.length;
  if (n < 2) return { slope: 0, n, spanDays: 0 };
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  const xs = pts.map((p) => p.x);
  return { slope: den ? num / den : 0, n, spanDays: Math.max(...xs) - Math.min(...xs) };
}

export function latestWeight(entries: WeightEntry[], onOrBefore?: string): number | undefined {
  const sorted = entries
    .filter((e) => !e.deleted && (!onOrBefore || e.date <= onOrBefore))
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.kg;
}

/** Cân nặng dùng để tính mục tiêu: giá trị xu hướng gần nhất (ổn định hơn số cân lẻ). */
export function referenceWeight(entries: WeightEntry[], onOrBefore?: string): number | undefined {
  const filtered = entries.filter((e) => !e.deleted && (!onOrBefore || e.date <= onOrBefore));
  const t = weightTrend(filtered);
  return t.length ? t[t.length - 1].trend : undefined;
}

// ---------- TDEE thích ứng ----------
export interface AdaptiveResult {
  tdee: number;
  observed?: number;
  confidence: number; // 0..1
  avgIntake: number;
  loggedDays: number;
  weighIns: number;
  slopeKgPerWeek: number;
  windowDays: number;
  enough: boolean;
}

/**
 * Ước tính TDEE từ dữ liệu thực: TDEE ≈ calo nạp trung bình − (thay đổi cân nặng × 7700) / số ngày.
 * Kết hợp với TDEE công thức theo độ tin cậy (số ngày ghi chép, số lần cân).
 */
export function adaptiveTdee(params: {
  dailyIntake: Record<string, number>; // date -> kcal (chỉ ngày có ghi chép)
  weights: WeightEntry[];
  formulaTdee: number;
  endDate: string;
  windowDays?: number;
}): AdaptiveResult {
  const windowDays = params.windowDays ?? 21;
  const from = addDays(params.endDate, -(windowDays - 1));
  const days = Object.entries(params.dailyIntake).filter(([d, k]) => d >= from && d <= params.endDate && k >= 600);
  const loggedDays = days.length;
  const avgIntake = loggedDays ? days.reduce((a, [, k]) => a + k, 0) / loggedDays : 0;
  const { slope, n, spanDays } = weightSlope(params.weights, from, params.endDate);
  const enough = loggedDays >= 10 && n >= 4 && spanDays >= 10;
  if (!enough) {
    return {
      tdee: params.formulaTdee,
      confidence: 0,
      avgIntake,
      loggedDays,
      weighIns: n,
      slopeKgPerWeek: slope * 7,
      windowDays,
      enough: false,
    };
  }
  const observed = avgIntake - slope * KCAL_PER_KG;
  const confidence = clamp((loggedDays / windowDays) * 0.7 + Math.min(1, n / 10) * 0.3, 0, 1);
  const bounded = clamp(observed, params.formulaTdee * 0.7, params.formulaTdee * 1.35);
  const tdee = confidence * bounded + (1 - confidence) * params.formulaTdee;
  return { tdee, observed, confidence, avgIntake, loggedDays, weighIns: n, slopeKgPerWeek: slope * 7, windowDays, enough: true };
}

// ---------- Mục tiêu theo ngày ----------
export interface DayTargets extends Nutrients {
  tdee: number;
  baseKcal: number;
  phaseDelta: number;
  activityBonus: number;
  cyclingDelta: number;
  isTrainingDay: boolean;
  belowFloor: boolean;
  waterMl: number;
  weightKg: number;
  phase?: Phase;
}

export function computeTargets(params: {
  profile: Profile;
  goals: Goals;
  phases: Phase[];
  weights: WeightEntry[];
  date: string;
  activityKcal?: number;
  isTrainingDay?: boolean;
}): DayTargets {
  const { profile, goals, phases, date } = params;
  const weightKg = referenceWeight(params.weights, date) ?? latestWeight(params.weights) ?? 70;
  const phase = activePhase(phases, date);
  const formula = tdeeFormula(profile, weightKg);
  const tdee = goals.tdeeMode === "adaptive" && goals.tdeeSnapshot ? goals.tdeeSnapshot.value : formula;
  const phaseDelta = phase ? phaseDailyDelta(phase.ratePctPerWeek, weightKg) : 0;
  const weekday = isoWeekday(date);
  const isTrainingDay = params.isTrainingDay ?? goals.trainingWeekdays.includes(weekday);
  // Calorie cycling: giữ trung bình tuần không đổi.
  let cyclingDelta = 0;
  const nTrain = goals.trainingWeekdays.length;
  if (goals.trainingDayBonus && nTrain > 0 && nTrain < 7) {
    cyclingDelta = isTrainingDay ? goals.trainingDayBonus : -(goals.trainingDayBonus * nTrain) / (7 - nTrain);
  }
  const activityBonus = (params.activityKcal ?? 0) * goals.activityKcalFactor;

  let kcal: number;
  let baseKcal: number;
  if (goals.mode === "manual" && goals.manualKcal) {
    baseKcal = goals.manualKcal;
    kcal = baseKcal + cyclingDelta + activityBonus;
  } else {
    baseKcal = tdee + phaseDelta + goals.kcalAdjust;
    kcal = baseKcal + cyclingDelta + activityBonus;
  }
  const floor = kcalFloor(profile.sex);
  const belowFloor = kcal < floor;
  kcal = Math.round(kcal);

  let protein: number;
  let fat: number;
  let carbs: number;
  if (goals.mode === "manual" && goals.manualProtein != null && goals.manualFat != null && goals.manualCarbs != null) {
    // Macro thủ công: phần calo chênh lệch (cycling/vận động) dồn vào carb.
    protein = goals.manualProtein;
    fat = goals.manualFat;
    carbs = Math.max(0, goals.manualCarbs + (kcal - Math.round(baseKcal)) / 4);
  } else {
    const m = macrosFor(kcal, weightKg, goals.proteinPerKg, goals.fatPct, profile.heightCm);
    protein = m.protein;
    fat = m.fat;
    carbs = m.carbs;
  }
  return {
    kcal,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: Math.round((kcal / 1000) * 14),
    tdee: Math.round(tdee),
    baseKcal: Math.round(baseKcal),
    phaseDelta: Math.round(phaseDelta),
    activityBonus: Math.round(activityBonus),
    cyclingDelta: Math.round(cyclingDelta),
    isTrainingDay,
    belowFloor,
    waterMl: goals.waterMl,
    weightKg,
    phase,
  };
}

/**
 * Chia macro cho người tập: protein theo g/kg (giới hạn ở cân nặng tương ứng BMI 27 nếu thừa cân),
 * chất béo theo % (tối thiểu 0,6 g/kg), phần còn lại là carb.
 */
export function macrosFor(kcal: number, weightKg: number, proteinPerKg: number, fatPct: number, heightCm?: number) {
  let refWeight = weightKg;
  if (heightCm) {
    const h = heightCm / 100;
    refWeight = Math.min(weightKg, 27 * h * h);
  }
  const protein = proteinPerKg * refWeight;
  let fat = Math.max((kcal * fatPct) / 100 / 9, 0.6 * refWeight);
  let carbs = (kcal - protein * 4 - fat * 9) / 4;
  if (carbs < 0) {
    fat = Math.max(0.5 * refWeight, (kcal - protein * 4) / 9);
    carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  }
  return { protein, fat, carbs };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodiumMg: 0 };
  for (const n of list) {
    out.kcal += n.kcal || 0;
    out.protein += n.protein || 0;
    out.carbs += n.carbs || 0;
    out.fat += n.fat || 0;
    out.fiber! += n.fiber || 0;
    out.sugar! += n.sugar || 0;
    out.satFat! += n.satFat || 0;
    out.sodiumMg! += n.sodiumMg || 0;
  }
  return out;
}

export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  const r = (v?: number) => (v == null ? undefined : v * f);
  return {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
    fiber: r(per100.fiber),
    sugar: r(per100.sugar),
    satFat: r(per100.satFat),
    sodiumMg: r(per100.sodiumMg),
  };
}

/** Kcal tính từ macro (kiểm tra dữ liệu sai). */
export function kcalFromMacros(n: Pick<Nutrients, "protein" | "carbs" | "fat">): number {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

/** Ước tính số tuần còn lại để đạt cân mục tiêu. */
export function weeksToTarget(currentKg: number, targetKg: number, ratePctPerWeek: number): number | undefined {
  if (!ratePctPerWeek) return undefined;
  const diff = targetKg - currentKg;
  if (Math.sign(diff) !== Math.sign(ratePctPerWeek) || diff === 0) return 0;
  const perWeek = (currentKg * ratePctPerWeek) / 100;
  return Math.ceil(diff / perWeek);
}

export function dayOfYear(s: string): number {
  const d = parseISODate(s);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

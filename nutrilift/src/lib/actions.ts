import { alive, clearKV, db, getKV, put, remove, setKV, DEFAULT_SETTINGS } from "../db/db";
import type { ActivityLog, Food, FoodLog, MealType, Nutrients, Phase, Program, Settings, Workout } from "../db/types";
import { scaleNutrients } from "../nutrition/calc";
import { parseProgram } from "../training/liftoscript";
import { applyProgression } from "../training/progression";
import { detectPRs, recentE1rm, type PR } from "../training/stats";
import { buildWorkoutFromProgram, emptyWorkout, workoutKcal } from "../training/workout";
import { addDays, today } from "./date";
import { uid } from "./id";

// ---------- Dinh dưỡng ----------
export const MEALS: { id: MealType; label: string; short: string; emoji: string }[] = [
  { id: "breakfast", label: "Bữa sáng", short: "Sáng", emoji: "🌅" },
  { id: "lunch", label: "Bữa trưa", short: "Trưa", emoji: "☀️" },
  { id: "dinner", label: "Bữa tối", short: "Tối", emoji: "🌙" },
  { id: "snack", label: "Ăn vặt", short: "Ăn vặt", emoji: "🍎" },
];

export function suggestMeal(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  if (h < 22) return "dinner";
  return "snack";
}

export async function logFood(params: {
  food: Food;
  grams: number;
  meal: MealType;
  date: string;
  servingLabel?: string;
  servingQty?: number;
}): Promise<FoodLog> {
  const { food, grams, meal, date } = params;
  // Lưu bản sao món trực tuyến để dùng lại (món gần đây, quét mã vạch ngoại tuyến).
  if (food.source === "off" || food.source === "fdc") {
    const existing = await db.foods.get(food.id);
    if (!existing || existing.deleted) await put("foods", { ...food, updatedAt: 0 });
  }
  const log: FoodLog = {
    id: uid("fl"),
    updatedAt: 0,
    date,
    meal,
    foodId: food.id,
    source: food.source,
    name: food.name,
    brand: food.brand,
    grams,
    servingLabel: params.servingLabel,
    servingQty: params.servingQty,
    n: scaleNutrients(food.per100, grams),
    per100: food.per100,
    createdAt: Date.now(),
  };
  return put("foodLogs", log);
}

export async function quickAdd(params: { name: string; n: Nutrients; meal: MealType; date: string }) {
  const log: FoodLog = {
    id: uid("fl"),
    updatedAt: 0,
    date: params.date,
    meal: params.meal,
    source: "quick",
    name: params.name || "Nhập nhanh",
    grams: 0,
    n: params.n,
    createdAt: Date.now(),
  };
  return put("foodLogs", log);
}

export async function updateFoodLogAmount(log: FoodLog, grams: number, servingLabel?: string, servingQty?: number, meal?: MealType) {
  const n = log.per100 ? scaleNutrients(log.per100, grams) : log.n;
  return put("foodLogs", { ...log, grams, servingLabel, servingQty, n, meal: meal ?? log.meal });
}

export async function copyMeal(fromDate: string, toDate: string, meal: MealType): Promise<number> {
  const logs = alive(await db.foodLogs.where("date").equals(fromDate).toArray()).filter((l) => l.meal === meal);
  let t = Date.now();
  for (const l of logs) await put("foodLogs", { ...l, id: uid("fl"), date: toDate, createdAt: t++ });
  return logs.length;
}

export async function addWater(date: string, ml: number) {
  return put("waterLogs", { id: uid("wa"), date, ml, createdAt: Date.now() });
}

export async function logActivity(a: Omit<ActivityLog, "id" | "updatedAt" | "createdAt">) {
  return put("activityLogs", { ...a, id: uid("ac"), createdAt: Date.now() });
}

export async function toggleFavorite(food: Food) {
  const existing = (await db.foods.get(food.id)) ?? { ...food };
  return put("foods", { ...existing, deleted: 0, favorite: existing.favorite ? 0 : 1 });
}

// ---------- Cân nặng ----------
export async function logWeight(date: string, kg: number, note?: string) {
  return put("weights", { id: `w:${date}`, date, kg, note });
}

// ---------- Giai đoạn ----------
export async function startPhase(p: Omit<Phase, "id" | "updatedAt">): Promise<Phase> {
  // Kết thúc giai đoạn đang chạy
  const phases = alive(await db.phases.toArray());
  for (const ph of phases) {
    if (!ph.endDate || ph.endDate >= p.startDate) {
      if (ph.startDate >= p.startDate) await remove("phases", ph.id);
      else await put("phases", { ...ph, endDate: addDays(p.startDate, -1) });
    }
  }
  return put("phases", { ...p, id: uid("ph") });
}

// ---------- Luyện tập ----------
export async function getSettings(): Promise<Settings> {
  const s = await getKV<Partial<Settings>>("settings", {});
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function historyRm1Lookup() {
  const workouts = alive(await db.workouts.toArray());
  return (exerciseId: string) => recentE1rm(workouts, exerciseId);
}

export async function startProgramWorkout(program: Program, dayIndex: number): Promise<Workout> {
  const settings = await getSettings();
  const customExercises = alive(await db.exercises.toArray());
  const w = buildWorkoutFromProgram(program, dayIndex, { settings, customExercises, historyRm1: await historyRm1Lookup() }, today());
  const weights = alive(await db.weights.orderBy("date").toArray());
  w.bodyweightKg = weights[weights.length - 1]?.kg;
  await setKV("activeWorkout", w);
  return w;
}

export async function startEmptyWorkout(): Promise<Workout> {
  const w = emptyWorkout(today());
  await setKV("activeWorkout", w);
  return w;
}

export async function saveActiveWorkout(w: Workout) {
  await setKV("activeWorkout", w);
}

export async function discardActiveWorkout() {
  await clearKV("activeWorkout");
}

export interface FinishResult {
  workout: Workout;
  prs: PR[];
  progressSummary: string[];
}

export async function finishWorkout(w: Workout, opts: { applyProgress: boolean; logKcal: boolean }): Promise<FinishResult> {
  const endedAt = Date.now();
  const durationMin = Math.max(1, Math.round((endedAt - w.startedAt) / 60000));
  const kcal = w.bodyweightKg ? workoutKcal(durationMin, w.bodyweightKg) : undefined;
  let finished: Workout = { ...w, endedAt, kcal };
  const history = alive(await db.workouts.toArray());
  const prs = detectPRs(finished, history);
  let progressSummary: string[] = [];
  if (w.programId && opts.applyProgress) {
    const program = await db.programs.get(w.programId);
    if (program && !program.deleted) {
      const customExercises = alive(await db.exercises.toArray());
      const parsed = parseProgram(program.text, customExercises);
      const r = applyProgression(program, parsed, finished);
      progressSummary = r.summary;
      const nextDay = parsed.days.length ? ((w.dayIndex ?? program.nextDay) + 1) % parsed.days.length : 0;
      await put("programs", { ...program, progress: r.progress, nextDay });
    }
  }
  finished = { ...finished, progressSummary };
  await put("workouts", finished);
  if (opts.logKcal && kcal) {
    await logActivity({ date: w.date, code: "workout", name: `Tập tạ: ${w.dayName ?? "Buổi tập"}`, met: 5, minutes: durationMin, kcal });
  }
  await clearKV("activeWorkout");
  return { workout: finished, prs, progressSummary };
}

export async function createProgramFromText(name: string, text: string, templateId?: string): Promise<Program> {
  return put("programs", { id: uid("pr"), name, text, templateId, progress: {}, nextDay: 0, createdAt: Date.now() });
}

export async function setActiveProgram(id: string | null) {
  await setKV("activeProgramId", id);
}

export async function deleteAllData() {
  for (const t of db.tables) await t.clear();
  localStorage.removeItem("nl_theme");
}

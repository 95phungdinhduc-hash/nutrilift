// Nhập dữ liệu từ hai ứng dụng gốc:
//  - Liftosaur: file CSV lịch sử tập (Settings → Export → CSV)
//  - OpenNutriTracker: file ZIP xuất dữ liệu (Cài đặt → Xuất/Nhập → JSON) gồm user_intake.json, weight_log.json, user_activity.json
import type { ActivityLog, CustomExercise, FoodLog, MealType, MuscleGroup, Nutrients, WeightEntry, Workout, WorkoutExercise, WorkoutSet } from "../db/types";
import { dateFromMs } from "../lib/date";
import { findExerciseByName, parseEquipment } from "../training/exercises";
import { slugId } from "../training/liftoscript";
import { scaleNutrients } from "../nutrition/calc";

// ---------- CSV ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const LIFTOSAUR_MUSCLES: Record<string, MuscleGroup> = {
  "pectoralis major clavicular head": "chest",
  "pectoralis major sternal head": "chest",
  "latissimus dorsi": "back",
  "teres major": "back",
  "teres minor": "back",
  infraspinatus: "back",
  "trapezius middle fibers": "back",
  "trapezius lower fibers": "back",
  "trapezius upper fibers": "traps",
  "deltoid anterior": "front_delts",
  "deltoid lateral": "side_delts",
  "deltoid posterior": "rear_delts",
  "biceps brachii": "biceps",
  brachialis: "biceps",
  brachioradialis: "forearms",
  "wrist extensors": "forearms",
  "wrist flexors": "forearms",
  "triceps brachii": "triceps",
  quadriceps: "quads",
  hamstrings: "hamstrings",
  "gluteus maximus": "glutes",
  "gluteus medius": "glutes",
  "adductor magnus": "adductors",
  "adductor longus": "adductors",
  "adductor brevis": "adductors",
  gastrocnemius: "calves",
  soleus: "calves",
  "rectus abdominis": "abs",
  obliques: "abs",
  iliopsoas: "abs",
  "erector spinae": "lower_back",
};

function muscles(list: string | undefined): MuscleGroup[] {
  if (!list) return [];
  return [...new Set(list.split(",").map((m) => LIFTOSAUR_MUSCLES[m.trim().toLowerCase()]).filter(Boolean))];
}

const LB = 0.45359237;
function toKg(value: string, unit: string): number {
  const v = parseFloat(value);
  if (!isFinite(v)) return 0;
  return Math.round((unit?.toLowerCase() === "lb" ? v * LB : v) * 100) / 100;
}

export interface LiftosaurImport {
  workouts: Workout[];
  customExercises: CustomExercise[];
}

/** Đọc CSV lịch sử của Liftosaur, gom thành các buổi tập theo "Workout DateTime". */
export function importLiftosaurCsv(text: string, existingCustom: CustomExercise[] = []): LiftosaurImport {
  const rows = parseCsv(text);
  if (!rows.length) return { workouts: [], customExercises: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const c = {
    dt: col("Workout DateTime"),
    program: col("Program"),
    day: col("Day Name"),
    exercise: col("Exercise"),
    warmup: col("Is Warmup Set?"),
    reps: col("Required Reps"),
    doneReps: col("Completed Reps"),
    amrap: col("Is AMRAP?"),
    rpe: col("Required RPE"),
    doneRpe: col("Completed RPE"),
    w: col("Required Weight Value"),
    wu: col("Required Weight Unit"),
    dw: col("Completed Weight Value"),
    dwu: col("Completed Weight Unit"),
    time: col("Completed Reps Time"),
    target: col("Target Muscles"),
    syn: col("Synergist Muscles"),
    notes: col("Notes"),
  };
  if (c.dt < 0 || c.exercise < 0) throw new Error("Không phải file CSV lịch sử của Liftosaur (thiếu cột Workout DateTime / Exercise)");
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const custom = new Map<string, CustomExercise>();
  const byWorkout = new Map<string, string[][]>();
  for (const r of rows.slice(1)) {
    const dt = get(r, c.dt);
    if (!dt) continue;
    byWorkout.set(dt, [...(byWorkout.get(dt) ?? []), r]);
  }
  const workouts: Workout[] = [];
  for (const [dt, list] of byWorkout) {
    const startedAt = Date.parse(dt);
    if (!isFinite(startedAt)) continue;
    const exercises: WorkoutExercise[] = [];
    let lastTime = startedAt;
    for (const r of list) {
      const exName = get(r, c.exercise);
      let ex = exercises[exercises.length - 1];
      if (!ex || (ex as any)._raw !== exName) {
        let def = findExerciseByName(exName, existingCustom);
        let equipment = def?.equipment;
        const comma = exName.lastIndexOf(",");
        if (!def && comma > 0) {
          def = findExerciseByName(exName.slice(0, comma), existingCustom);
          equipment = parseEquipment(exName.slice(comma + 1)) ?? def?.equipment;
        }
        let exerciseId = def?.id;
        let name = def?.name ?? exName;
        if (!def) {
          exerciseId = slugId(exName);
          if (!custom.has(exerciseId) && !existingCustom.some((x) => x.id === exerciseId)) {
            custom.set(exerciseId, {
              id: exerciseId,
              updatedAt: 0,
              name: exName,
              equipment: "barbell",
              target: muscles(get(r, c.target)),
              synergist: muscles(get(r, c.syn)),
            });
          }
          equipment = "barbell";
          name = exName;
        }
        ex = {
          uid: `lifto_${startedAt}_${exercises.length}`,
          key: `${exerciseId}_${equipment}~import`,
          exerciseId: exerciseId!,
          name,
          equipment: equipment ?? "barbell",
          sets: [],
          notes: get(r, c.notes) || undefined,
        };
        (ex as any)._raw = exName;
        exercises.push(ex);
      }
      const doneRepsRaw = get(r, c.doneReps);
      const reps = parseInt(get(r, c.reps)) || parseInt(doneRepsRaw) || 0;
      const set: WorkoutSet = {
        reps,
        weight: toKg(get(r, c.w), get(r, c.wu)),
        warmup: get(r, c.warmup) === "1" || undefined,
        amrap: get(r, c.amrap) === "1" || undefined,
        rpe: parseFloat(get(r, c.rpe)) || undefined,
        done: doneRepsRaw !== "",
        doneReps: doneRepsRaw !== "" ? parseInt(doneRepsRaw) : undefined,
        doneWeight: get(r, c.dw) ? toKg(get(r, c.dw), get(r, c.dwu)) : undefined,
        doneRpe: parseFloat(get(r, c.doneRpe)) || undefined,
      };
      ex.sets.push(set);
      const t = Date.parse(get(r, c.time));
      if (isFinite(t) && t > lastTime) lastTime = t;
    }
    for (const ex of exercises) delete (ex as any)._raw;
    const first = list[0];
    workouts.push({
      id: `lifto:${startedAt}`,
      updatedAt: 0,
      date: dateFromMs(startedAt),
      startedAt,
      endedAt: lastTime > startedAt ? lastTime : startedAt + 60 * 60000,
      programName: get(first, c.program) || undefined,
      dayName: get(first, c.day) || "Buổi tập (Liftosaur)",
      exercises,
      notes: "Nhập từ Liftosaur",
    });
  }
  return { workouts: workouts.sort((a, b) => a.startedAt - b.startedAt), customExercises: [...custom.values()] };
}

// ---------- OpenNutriTracker ----------
const ONT_MEALS: Record<string, MealType> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack" };

function ontPer100(n: any): Nutrients {
  const v = (x: any) => (typeof x === "number" && isFinite(x) ? x : undefined);
  const protein = v(n?.proteins100) ?? 0;
  const carbs = v(n?.carbohydrates100) ?? 0;
  const fat = v(n?.fat100) ?? 0;
  return {
    kcal: v(n?.energyKcal100) ?? protein * 4 + carbs * 4 + fat * 9,
    protein,
    carbs,
    fat,
    fiber: v(n?.fiber100),
    sugar: v(n?.sugars100),
    satFat: v(n?.saturatedFat100),
    sodiumMg: v(n?.sodium100) != null ? v(n?.sodium100)! * 1000 : undefined,
  };
}

function ontGrams(amount: number, unit: string, meal: any): number {
  const u = (unit || "").toLowerCase();
  if (u.includes("serving")) return amount * (meal?.servingQuantity || 100);
  if (u === "oz") return amount * 28.3495;
  if (u === "fl oz" || u === "fl.oz") return amount * 29.5735;
  return amount;
}

export interface OntImport {
  foodLogs: FoodLog[];
  weights: WeightEntry[];
  activities: ActivityLog[];
}

export function importOntJson(files: Record<string, unknown>): OntImport {
  const foodLogs: FoodLog[] = [];
  const weights: WeightEntry[] = [];
  const activities: ActivityLog[] = [];
  const intake = (files["user_intake.json"] as any[]) ?? [];
  for (const it of intake) {
    if (!it?.meal || !it?.dateTime) continue;
    const ts = Date.parse(it.dateTime);
    if (!isFinite(ts)) continue;
    const per100 = ontPer100(it.meal.nutriments);
    const grams = ontGrams(Number(it.amount) || 0, it.unit, it.meal);
    foodLogs.push({
      id: `ont:${it.id}`,
      updatedAt: 0,
      date: dateFromMs(ts),
      meal: ONT_MEALS[String(it.type).toLowerCase()] ?? "snack",
      source: it.meal.source === "off" ? "off" : it.meal.source === "fdc" ? "fdc" : "custom",
      name: it.meal.name || "Món ăn",
      brand: it.meal.brands || undefined,
      grams: Math.round(grams * 10) / 10,
      n: scaleNutrients(per100, grams),
      per100,
      createdAt: ts,
    });
  }
  const wl = (files["weight_log.json"] as any[]) ?? [];
  for (const w of wl) {
    const ts = Date.parse(w?.date);
    if (!isFinite(ts) || !(w.weightKg > 0)) continue;
    const date = dateFromMs(ts);
    weights.push({ id: `w:${date}`, updatedAt: 0, date, kg: Math.round(w.weightKg * 10) / 10, note: w.note || undefined });
  }
  const ua = (files["user_activity.json"] as any[]) ?? [];
  for (const a of ua) {
    const ts = Date.parse(a?.date);
    if (!isFinite(ts)) continue;
    const pa = a.physicalActivityDBO ?? {};
    activities.push({
      id: `ont:${a.id}`,
      updatedAt: 0,
      date: dateFromMs(ts),
      code: pa.code ?? "ont",
      name: pa.specificActivity && pa.specificActivity !== "custom" ? pa.specificActivity : "Hoạt động (OpenNutriTracker)",
      met: pa.mets ?? 0,
      minutes: Math.round(a.duration ?? 0),
      kcal: Math.round(a.userKcal ?? a.burnedKcal ?? 0),
      createdAt: ts,
    });
  }
  return { foodLogs, weights, activities };
}

/** Đọc file ZIP (hoặc JSON đơn lẻ) xuất từ OpenNutriTracker. */
export async function readOntExport(file: File): Promise<OntImport> {
  const files: Record<string, unknown> = {};
  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(await file.text());
    const name = /weight/i.test(file.name) ? "weight_log.json" : /activity/i.test(file.name) ? "user_activity.json" : "user_intake.json";
    files[name] = data;
  } else {
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    for (const [path, bytes] of Object.entries(entries)) {
      const base = path.split("/").pop()!;
      if (base.endsWith(".json")) {
        try {
          files[base] = JSON.parse(strFromU8(bytes));
        } catch {
          /* bỏ qua file lỗi */
        }
      }
    }
  }
  if (!files["user_intake.json"] && !files["weight_log.json"] && !files["user_activity.json"]) {
    throw new Error("Không tìm thấy user_intake.json / weight_log.json trong file — hãy xuất dạng JSON từ OpenNutriTracker");
  }
  return importOntJson(files);
}

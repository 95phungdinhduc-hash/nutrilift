import type { CustomExercise, Equipment, ExerciseProgress, Program, Settings, Workout, WorkoutExercise, WorkoutSet } from "../db/types";
import { uid } from "../lib/id";
import { today } from "../lib/date";
import { findExercise, type ExerciseDef } from "./exercises";
import { parseProgram, type ParsedProgram, type PExercise, type PSet, type Progression } from "./liftoscript";

export const EMPTY_PROGRESS: ExerciseProgress = { weightDelta: 0, repsDelta: 0, succ: 0, fail: 0 };

// ---------- 1RM & RPE ----------
/** % 1RM cho (reps, RPE) — dựa trên Epley với RIR = 10 − RPE. */
export function rpePct(reps: number, rpe = 10): number {
  const eff = reps + (10 - rpe);
  if (eff <= 1) return 1;
  return 1 / (1 + eff / 30);
}

/** 1RM ước tính (Epley, có tính RPE nếu có). */
export function e1rm(weight: number, reps: number, rpe?: number): number {
  if (!weight || !reps) return 0;
  const eff = reps + (rpe ? 10 - rpe : 0);
  if (eff <= 1) return weight;
  return weight * (1 + eff / 30);
}

// ---------- Làm tròn & bánh tạ ----------
export function barWeight(equipment: Equipment, settings: Settings): number {
  switch (equipment) {
    case "barbell":
      return settings.barKg;
    case "ezbar":
      return 10;
    case "trapbar":
      return 25;
    default:
      return 0;
  }
}

export function weightStep(equipment: Equipment, settings: Settings): number {
  switch (equipment) {
    case "barbell":
    case "ezbar":
    case "trapbar":
    case "smith": {
      const minPlate = Math.min(...(settings.plates.length ? settings.plates : [1.25]));
      return minPlate * 2;
    }
    case "dumbbell":
    case "kettlebell":
      return settings.dumbbellStepKg || 2;
    case "leverageMachine":
      return settings.machineStepKg || 5;
    case "cable":
      return settings.cableStepKg || 2.5;
    default:
      return 0.5;
  }
}

export function roundWeight(kg: number, equipment: Equipment, settings: Settings): number {
  if (!isFinite(kg) || kg <= 0) return 0;
  const bar = barWeight(equipment, settings);
  const step = weightStep(equipment, settings);
  if (bar > 0 && kg <= bar) return bar;
  const base = bar;
  const rounded = base + Math.round((kg - base) / step) * step;
  return Math.round(rounded * 100) / 100;
}

export interface PlateResult {
  perSide: number[];
  achieved: number;
  bar: number;
}

/** Tính bánh tạ mỗi bên (tham lam, số lượng không giới hạn). */
export function platesFor(totalKg: number, barKg: number, plates: number[]): PlateResult {
  const sorted = [...plates].sort((a, b) => b - a);
  let remaining = Math.max(0, (totalKg - barKg) / 2);
  const perSide: number[] = [];
  for (const p of sorted) {
    while (remaining + 1e-6 >= p) {
      perSide.push(p);
      remaining -= p;
    }
  }
  const achieved = barKg + perSide.reduce((a, b) => a + b, 0) * 2;
  return { perSide, achieved: Math.round(achieved * 100) / 100, bar: barKg };
}

export function usesPlates(equipment: Equipment): boolean {
  return equipment === "barbell" || equipment === "ezbar" || equipment === "trapbar" || equipment === "smith";
}

// ---------- Khởi động ----------
const WARMUP_SCHEMES: Record<number, { threshold: number; pct: number; reps: number }[]> = {
  10: [
    { threshold: 30, pct: 0.3, reps: 5 },
    { threshold: 15, pct: 0.5, reps: 5 },
    { threshold: 5, pct: 0.8, reps: 3 },
  ],
  45: [
    { threshold: 60, pct: 0.3, reps: 5 },
    { threshold: 45, pct: 0.5, reps: 5 },
    { threshold: 20, pct: 0.8, reps: 3 },
  ],
  95: [
    { threshold: 70, pct: 0.3, reps: 5 },
    { threshold: 60, pct: 0.5, reps: 5 },
    { threshold: 40, pct: 0.8, reps: 3 },
  ],
};

export function defaultWarmups(def: ExerciseDef | undefined, equipment: Equipment, firstWeight: number, settings: Settings): WorkoutSet[] {
  const scheme = WARMUP_SCHEMES[def?.warmup ?? (usesPlates(equipment) ? 45 : 0)];
  if (!scheme || !firstWeight) return [];
  const out: WorkoutSet[] = [];
  for (const w of scheme) {
    if (firstWeight > w.threshold) {
      const weight = roundWeight(firstWeight * w.pct, equipment, settings);
      if (weight >= firstWeight) continue;
      if (out.length && out[out.length - 1].weight === weight) continue;
      out.push({ reps: w.reps, weight, warmup: true, done: false });
    }
  }
  return out;
}

function customWarmups(sets: PSet[], equipment: Equipment, firstWeight: number, settings: Settings): WorkoutSet[] {
  return sets.map((s) => ({
    reps: s.reps,
    weight: roundWeight(s.pct != null ? (firstWeight * s.pct) / 100 : s.weightKg ?? 0, equipment, settings),
    warmup: true,
    done: false,
  }));
}

// ---------- Tạo buổi tập từ chương trình ----------
export interface BuildContext {
  settings: Settings;
  customExercises: CustomExercise[];
  /** 1RM ước tính từ lịch sử (theo exerciseId). */
  historyRm1?: (exerciseId: string) => number | undefined;
}

export function targetReps(s: PSet, prog: ExerciseProgress, p?: Progression): { reps: number; minReps?: number } {
  if (p?.type === "dp") {
    const base = s.minReps ?? s.reps;
    const reps = Math.min(p.maxReps, Math.max(p.minReps, base + prog.repsDelta));
    return { reps };
  }
  return { reps: s.reps, minReps: s.minReps };
}

export function resolveRm1(pe: PExercise, prog: ExerciseProgress, ctx: BuildContext): number | undefined {
  return prog.rm1 ?? ctx.historyRm1?.(pe.exerciseId);
}

export function targetWeight(pe: PExercise, s: PSet, reps: number, prog: ExerciseProgress, ctx: BuildContext): number {
  let w = 0;
  if (s.weightKg != null) w = s.weightKg + prog.weightDelta;
  else if (s.pct != null) w = ((resolveRm1(pe, prog, ctx) ?? 0) * s.pct) / 100;
  else if (s.rpe != null) w = (resolveRm1(pe, prog, ctx) ?? 0) * rpePct(reps, s.rpe);
  return roundWeight(Math.max(0, w), pe.equipment, ctx.settings);
}

export function buildExercise(pe: PExercise, program: Program | undefined, parsed: ParsedProgram | undefined, ctx: BuildContext): WorkoutExercise {
  const prog = program?.progress[pe.key] ?? EMPTY_PROGRESS;
  const p = parsed?.progressions[pe.key];
  const def = pe.def ?? findExercise(pe.exerciseId, ctx.customExercises);
  const sets: WorkoutSet[] = pe.sets.map((s) => {
    const { reps, minReps } = targetReps(s, prog, p);
    return {
      reps,
      minReps,
      weight: targetWeight(pe, s, reps, prog, ctx),
      rpe: s.rpe,
      amrap: s.amrap,
      label: s.label,
      done: false,
    };
  });
  const firstWeight = sets[0]?.weight ?? 0;
  let warmups: WorkoutSet[] = [];
  if (Array.isArray(pe.warmup)) warmups = customWarmups(pe.warmup, pe.equipment, firstWeight, ctx.settings);
  else if (pe.warmup !== "none" && ctx.settings.autoWarmups) warmups = defaultWarmups(def, pe.equipment, firstWeight, ctx.settings);
  return {
    uid: uid("we"),
    key: pe.key,
    exerciseId: pe.exerciseId,
    name: pe.name,
    equipment: pe.equipment,
    sets: [...warmups, ...sets],
    restSec: pe.timerSec ?? pe.sets.find((s) => s.timerSec)?.timerSec,
    description: pe.description,
    superset: pe.superset,
  };
}

export function buildWorkoutFromProgram(program: Program, dayIndex: number, ctx: BuildContext, date = today()): Workout {
  const parsed = parseProgram(program.text, ctx.customExercises);
  const idx = parsed.days.length ? ((dayIndex % parsed.days.length) + parsed.days.length) % parsed.days.length : 0;
  const day = parsed.days[idx];
  const exercises = day ? day.exercises.map((pe) => buildExercise(pe, program, parsed, ctx)) : [];
  const weekPrefix = parsed.weeks.length > 1 && day?.weekName ? `${day.weekName} · ` : "";
  return {
    id: uid("wo"),
    updatedAt: Date.now(),
    date,
    startedAt: Date.now(),
    programId: program.id,
    programName: program.name,
    dayIndex: idx,
    dayName: day ? weekPrefix + day.name : "Buổi tập",
    exercises,
  };
}

export function emptyWorkout(date = today()): Workout {
  return {
    id: uid("wo"),
    updatedAt: Date.now(),
    date,
    startedAt: Date.now(),
    dayName: "Buổi tập tự do",
    exercises: [],
  };
}

/** Thêm bài tập tự do vào buổi tập. */
export function newWorkoutExercise(def: ExerciseDef, equipment: Equipment, settings: Settings, lastSets?: WorkoutSet[]): WorkoutExercise {
  const sets: WorkoutSet[] =
    lastSets && lastSets.length
      ? lastSets
          .filter((s) => !s.warmup)
          .map((s) => ({ reps: s.doneReps ?? s.reps, weight: s.doneWeight ?? s.weight, done: false }))
      : [0, 1, 2].map(() => ({ reps: 10, weight: roundWeight(def.startKg, equipment, settings), done: false }));
  return {
    uid: uid("we"),
    key: `${def.id}_${equipment}`,
    exerciseId: def.id,
    name: def.name,
    equipment,
    sets,
  };
}

// ---------- Tổng kết ----------
export function workSets(ex: WorkoutExercise): WorkoutSet[] {
  return ex.sets.filter((s) => !s.warmup);
}

export function setVolume(s: WorkoutSet): number {
  if (!s.done) return 0;
  return (s.doneWeight ?? s.weight) * (s.doneReps ?? s.reps);
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce((a, ex) => a + workSets(ex).reduce((b, s) => b + setVolume(s), 0), 0);
}

export function workoutSetCount(w: Workout): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const ex of w.exercises)
    for (const s of workSets(ex)) {
      total++;
      if (s.done) done++;
    }
  return { done, total };
}

/** Kcal ước tính cho buổi tập tạ (MET ≈ 5, theo Compendium). */
export function workoutKcal(durationMin: number, bodyweightKg: number, met = 5): number {
  return Math.round((met * bodyweightKg * durationMin) / 60);
}

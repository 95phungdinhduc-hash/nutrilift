import type { CustomExercise, MuscleGroup, Workout } from "../db/types";
import { findExercise } from "./exercises";
import { e1rm, setVolume, workSets } from "./workout";

export interface ExerciseSessionStat {
  date: string;
  workoutId: string;
  e1rm: number;
  maxWeight: number;
  bestSet: { weight: number; reps: number };
  volume: number;
  sets: number;
}

/** Lịch sử theo buổi cho một bài tập (tất cả dụng cụ, theo exerciseId). */
export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSessionStat[] {
  const out: ExerciseSessionStat[] = [];
  for (const w of workouts) {
    if (w.deleted || !w.endedAt) continue;
    let best = 0;
    let maxWeight = 0;
    let bestSet = { weight: 0, reps: 0 };
    let volume = 0;
    let sets = 0;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of workSets(ex)) {
        if (!s.done) continue;
        const wt = s.doneWeight ?? s.weight;
        const reps = s.doneReps ?? s.reps;
        const est = e1rm(wt, reps, s.doneRpe);
        if (est > best) {
          best = est;
          bestSet = { weight: wt, reps };
        }
        maxWeight = Math.max(maxWeight, wt);
        volume += setVolume(s);
        sets++;
      }
    }
    if (sets) out.push({ date: w.date, workoutId: w.id, e1rm: best, maxWeight, bestSet, volume, sets });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 1RM ước tính gần nhất (trung bình 3 buổi gần nhất cao nhất để tránh nhiễu). */
export function recentE1rm(workouts: Workout[], exerciseId: string): number | undefined {
  const h = exerciseHistory(workouts, exerciseId);
  if (!h.length) return undefined;
  const last = h.slice(-3).map((x) => x.e1rm);
  return Math.max(...last);
}

export interface PR {
  exerciseId: string;
  name: string;
  kind: "e1rm" | "weight";
  value: number;
  previous: number;
  detail: string;
}

/** Phát hiện kỷ lục cá nhân trong một buổi tập so với lịch sử trước đó. */
export function detectPRs(workout: Workout, history: Workout[]): PR[] {
  const prs: PR[] = [];
  const prev = history.filter((w) => w.id !== workout.id && !w.deleted && w.endedAt && w.startedAt < workout.startedAt);
  const done = new Set<string>();
  for (const ex of workout.exercises) {
    if (done.has(ex.exerciseId)) continue;
    done.add(ex.exerciseId);
    const sets = workout.exercises
      .filter((e) => e.exerciseId === ex.exerciseId)
      .flatMap((e) => workSets(e))
      .filter((s) => s.done);
    if (!sets.length) continue;
    const h = exerciseHistory(prev, ex.exerciseId);
    if (!h.length) continue; // lần đầu tập: không tính PR
    const prevBest = Math.max(...h.map((x) => x.e1rm));
    const prevMax = Math.max(...h.map((x) => x.maxWeight));
    let best = 0;
    let bestDetail = "";
    let maxW = 0;
    for (const s of sets) {
      const wt = s.doneWeight ?? s.weight;
      const reps = s.doneReps ?? s.reps;
      const est = e1rm(wt, reps, s.doneRpe);
      if (est > best) {
        best = est;
        bestDetail = `${wt} kg × ${reps}`;
      }
      maxW = Math.max(maxW, wt);
    }
    if (maxW > prevMax + 0.01 && maxW > 0) {
      prs.push({ exerciseId: ex.exerciseId, name: ex.name, kind: "weight", value: maxW, previous: prevMax, detail: `Mức tạ nặng nhất: ${maxW} kg` });
    } else if (best > prevBest + 0.01) {
      prs.push({ exerciseId: ex.exerciseId, name: ex.name, kind: "e1rm", value: best, previous: prevBest, detail: `1RM ước tính ${best.toFixed(1)} kg (${bestDetail})` });
    }
  }
  return prs;
}

/** Số set mỗi nhóm cơ: nhóm chính tính 1, nhóm phụ tính 0,5 (giống cách Liftosaur thống kê). */
export function muscleSets(workouts: Workout[], custom: CustomExercise[] = []): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>;
  for (const w of workouts) {
    if (w.deleted) continue;
    for (const ex of w.exercises) {
      const def = findExercise(ex.exerciseId, custom);
      if (!def) continue;
      const n = workSets(ex).filter((s) => s.done).length;
      if (!n) continue;
      for (const m of def.target) out[m] = (out[m] ?? 0) + n;
      for (const m of def.synergist) out[m] = (out[m] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/** Bài tập được tập nhiều nhất (để hiển thị biểu đồ mặc định). */
export function topExercises(workouts: Workout[], limit = 6): { exerciseId: string; name: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const w of workouts) {
    if (w.deleted || !w.endedAt) continue;
    for (const ex of w.exercises) {
      if (!workSets(ex).some((s) => s.done)) continue;
      const cur = m.get(ex.exerciseId) ?? { name: ex.name, count: 0 };
      cur.count++;
      m.set(ex.exerciseId, cur);
    }
  }
  return [...m.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Lần tập gần nhất của bài tập (để gợi ý mức tạ khi thêm bài tự do). */
export function lastSetsFor(workouts: Workout[], exerciseId: string) {
  const sorted = workouts.filter((w) => !w.deleted && w.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  for (const w of sorted) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done));
    if (ex) return { date: w.date, sets: ex.sets.filter((s) => s.done) };
  }
  return undefined;
}

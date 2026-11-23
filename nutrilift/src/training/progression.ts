import type { ExerciseProgress, Program, Workout, WorkoutExercise } from "../db/types";
import { fmt } from "../lib/format";
import type { ParsedProgram, PExercise, Progression, WeightValue } from "./liftoscript";
import { e1rm, EMPTY_PROGRESS, workSets } from "./workout";

export interface ProgressionResult {
  progress: Record<string, ExerciseProgress>;
  summary: string[];
}

function incAmount(v: WeightValue, base: number): number {
  return v.kind === "kg" ? v.value : (base * v.value) / 100;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bài tập có mọi set đều theo % 1RM? */
function isPctBased(pe: PExercise | undefined): boolean {
  return !!pe && pe.sets.every((s) => s.pct != null);
}

function isRpeBased(pe: PExercise | undefined): boolean {
  return !!pe && pe.sets.every((s) => s.weightKg == null && s.pct == null && s.rpe != null);
}

export function exerciseSuccess(ex: WorkoutExercise): boolean {
  const ws = workSets(ex);
  if (!ws.length) return false;
  return ws.every((s) => s.done && (s.doneReps ?? s.reps) >= s.reps && (s.doneWeight ?? s.weight) >= s.weight - 0.01);
}

/**
 * Áp dụng quy tắc tiến độ (lp / dp / sum) sau khi hoàn thành buổi tập — tương tự Liftosaur.
 * Trả về bản đồ tiến độ mới và tóm tắt bằng tiếng Việt.
 */
export function applyProgression(program: Program, parsed: ParsedProgram, workout: Workout): ProgressionResult {
  const progress: Record<string, ExerciseProgress> = { ...program.progress };
  const summary: string[] = [];
  const seen = new Set<string>();
  const peByKey = new Map<string, PExercise>();
  for (const d of parsed.days) for (const pe of d.exercises) if (!peByKey.has(pe.key)) peByKey.set(pe.key, pe);

  for (const ex of workout.exercises) {
    if (seen.has(ex.key)) continue;
    seen.add(ex.key);
    const pe = peByKey.get(ex.key);
    const p: Progression | undefined = parsed.progressions[ex.key];
    const ws = workSets(ex);
    const anyDone = ws.some((s) => s.done);
    if (!pe || !anyDone) continue;
    const cur: ExerciseProgress = { ...EMPTY_PROGRESS, ...(progress[ex.key] ?? {}) };
    const firstWeight = ws[0]?.weight ?? 0;
    const pctBased = isPctBased(pe);

    // Tự điều chỉnh 1RM cho bài theo RPE: lấy e1RM tốt nhất buổi này.
    if (isRpeBased(pe)) {
      const best = Math.max(0, ...ws.filter((s) => s.done).map((s) => e1rm(s.doneWeight ?? s.weight, s.doneReps ?? s.reps, s.doneRpe ?? s.rpe)));
      if (best > 0) {
        cur.rm1 = r2(best);
        summary.push(`${ex.name}: cập nhật 1RM ước tính ${fmt(best, 1)} kg`);
      }
    }

    const applyInc = (v: WeightValue, sign: 1 | -1) => {
      if (pctBased) {
        const rm = cur.rm1 ?? 0;
        cur.rm1 = r2(Math.max(0, rm + sign * incAmount(v, rm)));
        return `1RM ${fmt(rm, 1)} → ${fmt(cur.rm1, 1)} kg`;
      }
      const delta = sign * incAmount(v, firstWeight);
      cur.weightDelta = r2(cur.weightDelta + delta);
      return `${sign > 0 ? "+" : "−"}${fmt(Math.abs(delta), 2)} kg (→ ${fmt(firstWeight + delta, 2)} kg)`;
    };

    if (p?.type === "lp") {
      if (exerciseSuccess(ex)) {
        cur.succ += 1;
        cur.fail = 0;
        if (cur.succ >= p.succAttempts) {
          cur.succ = 0;
          summary.push(`${ex.name}: ${applyInc(p.inc, 1)}`);
        } else {
          summary.push(`${ex.name}: đạt ${cur.succ}/${p.succAttempts} buổi — chưa tăng tạ`);
        }
      } else {
        cur.succ = 0;
        cur.fail += 1;
        if (p.dec && p.failAttempts > 0 && cur.fail >= p.failAttempts) {
          cur.fail = 0;
          summary.push(`${ex.name}: trượt ${p.failAttempts} lần → deload ${applyInc(p.dec, -1)}`);
        } else {
          summary.push(`${ex.name}: chưa đạt — giữ mức tạ${p.failAttempts ? ` (trượt ${cur.fail}/${p.failAttempts})` : ""}`);
        }
      }
    } else if (p?.type === "dp") {
      const allHit = ws.length > 0 && ws.every((s) => s.done && (s.doneReps ?? s.reps) >= s.reps);
      const curReps = ws[0]?.reps ?? p.minReps;
      if (allHit) {
        if (curReps < p.maxReps) {
          cur.repsDelta += 1;
          summary.push(`${ex.name}: lần sau ${ws.length}×${curReps + 1} cùng mức tạ`);
        } else {
          const base = pe.sets[0]?.minReps ?? pe.sets[0]?.reps ?? p.minReps;
          cur.repsDelta = p.minReps - base;
          summary.push(`${ex.name}: đạt ${p.maxReps} rep → ${applyInc(p.inc, 1)}, quay về ${p.minReps} rep`);
        }
      } else {
        summary.push(`${ex.name}: giữ ${ws.length}×${curReps}`);
      }
    } else if (p?.type === "sum") {
      const total = ws.filter((s) => s.done).reduce((a, s) => a + (s.doneReps ?? s.reps), 0);
      if (total >= p.threshold) summary.push(`${ex.name}: tổng ${total} rep ≥ ${p.threshold} → ${applyInc(p.inc, 1)}`);
      else summary.push(`${ex.name}: tổng ${total}/${p.threshold} rep — giữ mức tạ`);
    }
    cur.updatedAt = Date.now();
    progress[ex.key] = cur;
  }
  return { progress, summary };
}

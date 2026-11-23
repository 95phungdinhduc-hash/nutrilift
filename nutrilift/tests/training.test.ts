import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/db/db";
import type { Program, Workout } from "../src/db/types";
import { parseProgram } from "../src/training/liftoscript";
import { applyProgression } from "../src/training/progression";
import { buildWorkoutFromProgram, defaultWarmups, e1rm, platesFor, roundWeight, rpePct } from "../src/training/workout";
import { findExercise } from "../src/training/exercises";
import { detectPRs, muscleSets } from "../src/training/stats";

const ctx = { settings: DEFAULT_SETTINGS, customExercises: [] };

function program(text: string): Program {
  return { id: "p1", updatedAt: 0, name: "Test", text, progress: {}, nextDay: 0, createdAt: 0 };
}

function completeAll(w: Workout, repsFn?: (reps: number) => number): Workout {
  return {
    ...w,
    endedAt: Date.now(),
    exercises: w.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, done: true, doneReps: repsFn ? repsFn(s.reps) : s.reps, doneWeight: s.weight })),
    })),
  };
}

describe("tính toán tạ", () => {
  it("làm tròn theo dụng cụ", () => {
    expect(roundWeight(61.3, "barbell", DEFAULT_SETTINGS)).toBe(62.5);
    expect(roundWeight(12, "barbell", DEFAULT_SETTINGS)).toBe(20);
    expect(roundWeight(13, "dumbbell", DEFAULT_SETTINGS)).toBe(14);
    expect(roundWeight(47, "leverageMachine", DEFAULT_SETTINGS)).toBe(45);
  });
  it("bánh tạ mỗi bên", () => {
    const r = platesFor(102.5, 20, DEFAULT_SETTINGS.plates);
    expect(r.perSide).toEqual([25, 15, 1.25]);
    expect(r.achieved).toBe(102.5);
  });
  it("e1RM & RPE", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(rpePct(5, 8)).toBeCloseTo(0.811, 2);
  });
  it("khởi động mặc định cho squat 100kg", () => {
    const sets = defaultWarmups(findExercise("squat"), "barbell", 100, DEFAULT_SETTINGS);
    expect(sets.map((s) => s.weight)).toEqual([30, 50, 80]);
  });
});

describe("tạo buổi tập & tiến độ", () => {
  const text = `## A
Squat / 3x5 / 60kg / progress: lp(2.5kg, 1, 0, 10%, 2)
Bench Press / 3x8 / 40kg / progress: dp(2.5kg, 8, 10)
Pull Up / 3x5+ / 0kg / warmup: none / progress: sum(20, 2.5kg)`;

  it("buổi tập có warmup + set chính", () => {
    const w = buildWorkoutFromProgram(program(text), 0, ctx);
    expect(w.exercises).toHaveLength(3);
    const squat = w.exercises[0];
    expect(squat.sets.filter((s) => !s.warmup).map((s) => s.weight)).toEqual([60, 60, 60]);
    expect(squat.sets.some((s) => s.warmup)).toBe(true);
    expect(w.exercises[2].sets.every((s) => !s.warmup)).toBe(true);
  });

  it("lp tăng tạ khi đạt, deload sau 2 lần trượt", () => {
    let p = program(text);
    const parsed = parseProgram(text);
    let w = completeAll(buildWorkoutFromProgram(p, 0, ctx));
    let r = applyProgression(p, parsed, w);
    p = { ...p, progress: r.progress };
    const key = w.exercises[0].key;
    expect(p.progress[key].weightDelta).toBe(2.5);
    // trượt 2 lần
    for (let i = 0; i < 2; i++) {
      w = completeAll(buildWorkoutFromProgram(p, 0, ctx), (reps) => reps - 2);
      r = applyProgression(p, parsed, w);
      p = { ...p, progress: r.progress };
    }
    expect(p.progress[key].weightDelta).toBeCloseTo(2.5 - 6.25, 2);
    // 62,5 − 10% = 56,25 → làm tròn theo bước 2,5kg
    expect(buildWorkoutFromProgram(p, 0, ctx).exercises[0].sets.filter((s) => !s.warmup)[0].weight).toBe(57.5);
  });

  it("dp: tăng rep tới max rồi tăng tạ", () => {
    let p = program(text);
    const parsed = parseProgram(text);
    for (let i = 0; i < 3; i++) {
      const w = completeAll(buildWorkoutFromProgram(p, 0, ctx));
      p = { ...p, progress: applyProgression(p, parsed, w).progress };
    }
    const bench = buildWorkoutFromProgram(p, 0, ctx).exercises[1];
    const ws = bench.sets.filter((s) => !s.warmup);
    expect(ws[0].reps).toBe(8);
    expect(ws[0].weight).toBe(42.5);
  });

  it("sum: tổng rep đạt ngưỡng thì tăng", () => {
    const p = program(text);
    const parsed = parseProgram(text);
    const w = completeAll(buildWorkoutFromProgram(p, 0, ctx), () => 8);
    const r = applyProgression(p, parsed, w);
    expect(r.progress[w.exercises[2].key].weightDelta).toBe(2.5);
  });

  it("PR & thống kê nhóm cơ", () => {
    const p = program(text);
    const w1 = completeAll(buildWorkoutFromProgram(p, 0, ctx));
    w1.startedAt = 1;
    const w2 = completeAll(buildWorkoutFromProgram({ ...p, progress: { [w1.exercises[0].key]: { weightDelta: 5, repsDelta: 0, succ: 0, fail: 0 } } }, 0, ctx));
    w2.startedAt = 2;
    const prs = detectPRs(w2, [w1, w2]);
    expect(prs.map((x) => x.exerciseId)).toContain("squat");
    const ms = muscleSets([w1]);
    expect(ms.chest).toBeGreaterThanOrEqual(3);
    expect(ms.quads).toBeGreaterThanOrEqual(3);
  });
});

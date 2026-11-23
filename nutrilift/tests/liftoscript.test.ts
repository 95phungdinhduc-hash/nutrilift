import { describe, expect, it } from "vitest";
import { parseProgram } from "../src/training/liftoscript";
import { PROGRAM_TEMPLATES } from "../src/training/programs";

describe("Liftoscript-lite", () => {
  it("tất cả chương trình mẫu đều hợp lệ, mọi bài đều có trong thư viện", () => {
    for (const t of PROGRAM_TEMPLATES) {
      const p = parseProgram(t.text);
      expect(p.errors, t.id + JSON.stringify(p.errors)).toEqual([]);
      expect(p.unknownExercises, t.id).toEqual([]);
      expect(p.days.length).toBeGreaterThan(0);
      for (const d of p.days) expect(d.exercises.length, `${t.id}/${d.name}`).toBeGreaterThan(0);
    }
  });

  it("phân tích set, rep range, AMRAP, kg/lb/%, RPE, timer", () => {
    const p = parseProgram(`## Ngày 1
Bench Press / 3x8-12 @8 / 90s
Squat / 4x5, 1x5+ / 135lb / progress: lp(5lb, 2, 0, 10%, 3)
Deadlift / 1x5 80% / 180s
Bicep Curl, Cable / 3x10 20kg / warmup: none`);
    expect(p.errors).toEqual([]);
    const [bench, squat, dl, curl] = p.days[0].exercises;
    expect(bench.sets).toHaveLength(3);
    expect(bench.sets[0]).toMatchObject({ reps: 12, minReps: 8, rpe: 8, timerSec: 90 });
    expect(squat.sets).toHaveLength(5);
    expect(squat.sets[4].amrap).toBe(true);
    expect(squat.sets[0].weightKg).toBeCloseTo(61.23, 1);
    const prog = p.progressions[squat.key];
    expect(prog).toMatchObject({ type: "lp", succAttempts: 2, failAttempts: 3 });
    expect(dl.sets[0].pct).toBe(80);
    expect(curl.equipment).toBe("cable");
    expect(curl.warmup).toBe("none");
  });

  it("tuần, nhãn, mô tả, bỏ qua script custom", () => {
    const p = parseProgram(`# Week 1
// Mô tả tuần không dùng
## Day 1
// Giữ lưng thẳng
t1: Squat / 5x3 / 100kg / progress: custom() {~
  if (completedReps >= reps) { weights += 5lb }
~}
# Week 2
## Day 1
t1: Squat / 5x2 / 100kg`);
    expect(p.errors).toEqual([]);
    expect(p.weeks).toHaveLength(2);
    expect(p.days).toHaveLength(2);
    expect(p.days[0].exercises[0].label).toBe("t1");
    expect(p.days[0].exercises[0].description).toBe("Giữ lưng thẳng");
    expect(p.days[1].exercises[0].description).toBe("Giữ lưng thẳng");
    expect(p.days[0].exercises[0].key).toBe(p.days[1].exercises[0].key);
    expect(p.warnings.some((w) => w.message.includes("custom"))).toBe(true);
  });

  it("báo lỗi khi thiếu set", () => {
    const p = parseProgram(`## A\nSquat / 100kg`);
    expect(p.errors.length).toBe(1);
  });

  it("bài ngoài thư viện được chấp nhận", () => {
    const p = parseProgram(`## A\nMáy ép ngực XYZ / 3x10 / 30kg`);
    expect(p.errors).toEqual([]);
    expect(p.unknownExercises).toEqual(["Máy ép ngực XYZ"]);
    expect(p.days[0].exercises[0].exerciseId).toBe("custom_may_ep_nguc_xyz");
  });
});

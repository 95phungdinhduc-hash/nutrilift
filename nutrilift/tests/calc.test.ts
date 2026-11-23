import { describe, expect, it } from "vitest";
import {
  adaptiveTdee,
  bmrMifflin,
  computeTargets,
  macrosFor,
  phaseDailyDelta,
  tdeeIOM2005,
  weightSlope,
  weightTrend,
  weeksToTarget,
} from "../src/nutrition/calc";
import { DEFAULT_GOALS } from "../src/db/db";
import type { Phase, Profile, WeightEntry } from "../src/db/types";
import { addDays } from "../src/lib/date";

const year = new Date().getFullYear();
const profile: Profile = { sex: "male", birthYear: year - 30, heightCm: 175, activity: "moderate", formula: "mifflin" };

describe("BMR/TDEE", () => {
  it("Mifflin-St Jeor nam 30t 80kg 175cm", () => {
    expect(bmrMifflin(profile, 80)).toBeCloseTo(10 * 80 + 6.25 * 175 - 5 * 30 + 5, 5);
  });
  it("IOM 2005 khớp công thức OpenNutriTracker", () => {
    const v = tdeeIOM2005({ ...profile, formula: "iom2005" }, 80);
    expect(v).toBeCloseTo(864 - 9.72 * 30 + 1.27 * (14.2 * 80 + 503 * 1.75), 5);
  });
  it("cut -0.75%/tuần ở 80kg ≈ -660 kcal/ngày", () => {
    expect(phaseDailyDelta(-0.75, 80)).toBeCloseTo(-660, 0);
  });
});

describe("macros", () => {
  it("protein theo g/kg, fat theo %, carb phần còn lại", () => {
    const m = macrosFor(2200, 80, 2.2, 25, 175);
    expect(m.protein).toBeCloseTo(176, 0);
    expect(m.fat).toBeCloseTo((2200 * 0.25) / 9, 1);
    expect(m.protein * 4 + m.carbs * 4 + m.fat * 9).toBeCloseTo(2200, 0);
  });
  it("giới hạn protein theo BMI 27 khi thừa cân", () => {
    const m = macrosFor(2200, 120, 2, 25, 170);
    expect(m.protein).toBeCloseTo(2 * 27 * 1.7 * 1.7, 1);
  });
});

function weights(start: string, days: number, startKg: number, perDay: number, every = 1): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 0; i < days; i += every) {
    out.push({ id: "w" + i, updatedAt: 0, date: addDays(start, i), kg: startKg + perDay * i + (i % 2 ? 0.3 : -0.3) });
  }
  return out;
}

describe("xu hướng & TDEE thích ứng", () => {
  it("hệ số góc hồi quy ~ -0.1 kg/ngày", () => {
    const w = weights("2026-01-01", 28, 80, -0.1);
    const s = weightSlope(w, "2026-01-01", "2026-01-28");
    expect(s.slope).toBeCloseTo(-0.1, 1);
  });
  it("trend nội suy ngày trống", () => {
    const t = weightTrend(weights("2026-01-01", 10, 80, 0, 3));
    expect(t.length).toBe(10);
    expect(t.every((p) => p.trend > 79 && p.trend < 81)).toBe(true);
  });
  it("ăn 2000 kcal và giảm 0,5kg/tuần → TDEE ≈ 2550", () => {
    const end = "2026-02-21";
    const start = addDays(end, -20);
    const intake: Record<string, number> = {};
    for (let i = 0; i < 21; i++) intake[addDays(start, i)] = 2000;
    const w = weights(start, 21, 80, -0.5 / 7);
    const r = adaptiveTdee({ dailyIntake: intake, weights: w, formulaTdee: 2500, endDate: end });
    expect(r.enough).toBe(true);
    expect(r.observed!).toBeGreaterThan(2400);
    expect(r.observed!).toBeLessThan(2700);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
  it("thiếu dữ liệu thì dùng TDEE công thức", () => {
    const r = adaptiveTdee({ dailyIntake: { "2026-02-20": 2000 }, weights: [], formulaTdee: 2500, endDate: "2026-02-21" });
    expect(r.enough).toBe(false);
    expect(r.tdee).toBe(2500);
  });
});

describe("mục tiêu theo ngày", () => {
  const phase: Phase = { id: "p", updatedAt: 0, type: "cut", startDate: "2026-01-01", startWeightKg: 80, ratePctPerWeek: -0.5 };
  const w: WeightEntry[] = [{ id: "a", updatedAt: 0, date: "2026-01-01", kg: 80 }];
  it("cut: TDEE − thâm hụt", () => {
    const t = computeTargets({ profile, goals: DEFAULT_GOALS, phases: [phase], weights: w, date: "2026-01-05" });
    expect(t.phaseDelta).toBeCloseTo(-440, 0);
    expect(t.kcal).toBe(Math.round(t.tdee + t.phaseDelta));
    expect(t.protein).toBe(160);
  });
  it("calorie cycling giữ trung bình tuần", () => {
    const goals = { ...DEFAULT_GOALS, trainingDayBonus: 200, trainingWeekdays: [1, 3, 5] };
    let total = 0;
    const base = computeTargets({ profile, goals: DEFAULT_GOALS, phases: [phase], weights: w, date: "2026-01-05" }).kcal;
    for (let i = 0; i < 7; i++) total += computeTargets({ profile, goals, phases: [phase], weights: w, date: addDays("2026-01-05", i) }).kcal;
    expect(Math.abs(total / 7 - base)).toBeLessThan(2);
  });
  it("số tuần tới mục tiêu", () => {
    expect(weeksToTarget(80, 75, -0.5)).toBe(13);
    expect(weeksToTarget(80, 85, -0.5)).toBe(0);
  });
});

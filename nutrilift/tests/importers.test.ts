import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importLiftosaurCsv, importOntJson, parseCsv } from "../src/sync/importers";

describe("CSV", () => {
  it("trường có dấu ngoặc kép và dấu phẩy", () => {
    expect(parseCsv('a,b\n1,"x, y"\n"q""q",3')).toEqual([["a", "b"], ["1", "x, y"], ['q"q', "3"]]);
  });
});

describe("Nhập từ Liftosaur", () => {
  // tests/fixtures/liftosaur_example.csv là file mẫu chính thức trong repo Liftosaur (AGPL-3.0)
  const csv = readFileSync(new URL("./fixtures/liftosaur_example.csv", import.meta.url), "utf8");
  const r = importLiftosaurCsv(csv);
  it("gom thành buổi tập và bài tập", () => {
    expect(r.workouts.length).toBeGreaterThanOrEqual(2);
    const w = r.workouts.find((x) => x.programName === "GZCLP")!;
    expect(w).toBeTruthy();
    expect(w.exercises[0].exerciseId).toBe("squat");
    expect(w.exercises[0].sets[0].warmup).toBe(true);
    expect(w.exercises[0].sets[0].weight).toBeCloseTo(22.68, 1); // 50 lb
    expect(w.endedAt! > w.startedAt).toBe(true);
    expect(r.customExercises).toEqual([]);
  });
  it("bài lạ thành bài tự tạo kèm nhóm cơ", () => {
    const x = importLiftosaurCsv(
      'Workout DateTime,Program,Day Name,Exercise,Is Warmup Set?,Required Reps,Completed Reps,Is AMRAP?,Required RPE,Completed RPE,Log RPE?,Required Weight Value,Required Weight Unit,Completed Weight Value,Completed Weight Unit,Ask Weight?,Completed Reps Time,Target Muscles,Synergist Muscles,Notes\n' +
        '2025-01-01T05:00:00.000Z,,Day 1,Máy XYZ,0,10,8,0,,,0,30,kg,30,kg,0,,"Quadriceps","Gluteus Maximus",\n'
    );
    expect(x.customExercises[0]).toMatchObject({ name: "Máy XYZ", target: ["quads"], synergist: ["glutes"] });
    expect(x.workouts[0].exercises[0].sets[0]).toMatchObject({ reps: 10, doneReps: 8, weight: 30, done: true });
  });
});

describe("Nhập từ OpenNutriTracker", () => {
  it("món ăn, cân nặng, vận động", () => {
    const r = importOntJson({
      "user_intake.json": [
        {
          id: "a1",
          unit: "g",
          amount: 150,
          type: "lunch",
          dateTime: "2026-01-05T12:30:00.000",
          meal: { name: "Rice", source: "fdc", nutriments: { energyKcal100: 130, proteins100: 2.7, carbohydrates100: 28, fat100: 0.3 } },
        },
        {
          id: "a2",
          unit: "UnitDropdownItem.serving",
          amount: 2,
          type: "breakfast",
          dateTime: "2026-01-05T07:00:00.000",
          meal: { name: "Yogurt", source: "off", servingQuantity: 100, nutriments: { energyKcal100: 60, proteins100: 10, carbohydrates100: 4, fat100: 0.4 } },
        },
      ],
      "weight_log.json": [{ date: "2026-01-05T00:00:00.000", weightKg: 80.25 }],
      "user_activity.json": [{ id: "x", duration: 30, burnedKcal: 250, date: "2026-01-05T18:00:00.000", physicalActivityDBO: { code: "12020", specificActivity: "jogging", mets: 7 } }],
    });
    expect(r.foodLogs).toHaveLength(2);
    expect(r.foodLogs[0]).toMatchObject({ date: "2026-01-05", meal: "lunch", grams: 150 });
    expect(r.foodLogs[0].n.kcal).toBeCloseTo(195, 0);
    expect(r.foodLogs[1].grams).toBe(200);
    expect(r.weights[0]).toMatchObject({ id: "w:2026-01-05", kg: 80.3 });
    expect(r.activities[0]).toMatchObject({ kcal: 250, minutes: 30, name: "jogging" });
  });
});

import { describe, expect, it } from "vitest";
import { fdcFoodToFood, offProductToFood } from "../src/nutrition/onlineFoods";
import { recipePer100, searchLocal } from "../src/nutrition/foodSearch";
import { VN_FOODS } from "../src/nutrition/vnFoods";
import { kcalFromMacros } from "../src/nutrition/calc";
import { normalize } from "../src/lib/text";

describe("CSDL món Việt", () => {
  it("tìm không dấu", () => {
    expect(searchLocal("pho bo", [])[0].name).toBe("Phở bò (tái/chín)");
    expect(searchLocal("com tam", []).length).toBeGreaterThan(1);
    expect(searchLocal("ức gà", [])[0].id).toMatch(/uc-ga/);
    expect(normalize("Đậu phụ")).toBe("dau phu");
  });
  it("kcal khớp macro (sai lệch < 15%, trừ đồ uống có cồn)", () => {
    const bad = VN_FOODS.filter((f) => f.sourceId !== "bia" && f.per100.kcal > 20).filter((f) => {
      // carb tổng bao gồm chất xơ (~2 kcal/g)
      const fib = f.per100.fiber ?? 0;
      const m = kcalFromMacros({ ...f.per100, carbs: Math.max(0, f.per100.carbs - fib) }) + fib * 2;
      return Math.abs(m - f.per100.kcal) / f.per100.kcal > 0.15;
    });
    expect(bad.map((f) => `${f.name}: ${f.per100.kcal} vs ${kcalFromMacros(f.per100).toFixed(0)}`)).toEqual([]);
  });
  it("id không trùng", () => {
    expect(new Set(VN_FOODS.map((f) => f.id)).size).toBe(VN_FOODS.length);
  });
});

describe("Open Food Facts", () => {
  it("chuyển đổi sản phẩm", () => {
    const f = offProductToFood({
      code: "8934673000014",
      product_name: "Sữa tươi tiệt trùng",
      brands: "Vinamilk, Abc",
      quantity: "180 ml",
      serving_quantity: "180",
      serving_size: "180 ml",
      nutriments: { "energy-kcal_100g": 75, proteins_100g: "3", carbohydrates_100g: 8.5, fat_100g: 3.3, salt_100g: 0.1 },
    })!;
    expect(f.id).toBe("off:8934673000014");
    expect(f.brand).toBe("Vinamilk");
    expect(f.unit).toBe("ml");
    expect(f.per100.protein).toBe(3);
    expect(f.per100.sodiumMg).toBeCloseTo(40, 0);
    expect(f.servings[0].grams).toBe(180);
  });
  it("chỉ có kJ", () => {
    const f = offProductToFood({ code: "1", product_name: "X", nutriments: { "energy-kj_100g": 418.4, proteins_100g: 1 } })!;
    expect(f.per100.kcal).toBeCloseTo(100, 1);
  });
  it("bỏ sản phẩm không tên", () => {
    expect(offProductToFood({ code: "1", nutriments: {} })).toBeUndefined();
  });
});

describe("USDA FDC", () => {
  it("chuyển đổi kết quả tìm kiếm", () => {
    const f = fdcFoodToFood({
      fdcId: 171477,
      description: "CHICKEN, BROILERS OR FRYERS, BREAST, MEAT ONLY, COOKED, ROASTED",
      foodNutrients: [
        { nutrientId: 1003, value: 31.0, unitName: "G" },
        { nutrientId: 1004, value: 3.57, unitName: "G" },
        { nutrientId: 1005, value: 0, unitName: "G" },
        { nutrientId: 1008, value: 165, unitName: "KCAL" },
        { nutrientId: 1062, value: 690, unitName: "kJ" },
      ],
    })!;
    expect(f.per100).toMatchObject({ kcal: 165, protein: 31, fat: 3.57 });
    expect(f.name.startsWith("Chicken")).toBe(true);
  });
});

describe("công thức", () => {
  it("dinh dưỡng /100g theo khối lượng thành phẩm", () => {
    const n = recipePer100(
      [
        { grams: 200, per100: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 } },
        { grams: 300, per100: { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 } },
      ],
      400
    );
    expect(n.kcal).toBeCloseTo((240 + 390) / 4, 1);
  });
});

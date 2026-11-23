import type { Food, FoodLog, Nutrients } from "../db/types";
import { matchScore } from "../lib/text";
import { VN_FOODS } from "./vnFoods";
import { scaleNutrients } from "./calc";

export const SOURCE_LABELS: Record<Food["source"], string> = {
  vn: "Món Việt",
  custom: "Của tôi",
  recipe: "Công thức",
  off: "Open Food Facts",
  fdc: "USDA",
  quick: "Nhập nhanh",
  ai: "AI ảnh",
};

/** Tìm kiếm ngoại tuyến: món tự tạo + công thức + CSDL món Việt. */
export function searchLocal(query: string, myFoods: Food[], limit = 40): Food[] {
  const pool = [...myFoods.filter((f) => !f.deleted), ...VN_FOODS];
  const seen = new Set<string>();
  return pool
    .map((f) => ({ f, s: matchScore(query, f.name, f.brand, f.aliases, f.barcode) + (f.source === "custom" || f.source === "recipe" ? 5 : 0) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f)
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .slice(0, limit);
}

export function findVnFood(id: string): Food | undefined {
  return VN_FOODS.find((f) => f.id === id);
}

/** Món gần đây: lấy từ nhật ký, mỗi món một lần, mới nhất trước. */
export function recentFoodsFromLogs(logs: FoodLog[], limit = 30): FoodLog[] {
  const seen = new Set<string>();
  const out: FoodLog[] = [];
  for (const l of [...logs].sort((a, b) => b.createdAt - a.createdAt)) {
    if (l.deleted || l.source === "quick") continue;
    const key = l.foodId ?? l.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

export function foodFromLog(l: FoodLog): Food {
  const per100: Nutrients = l.per100 ?? (l.grams > 0 ? scaleNutrients(l.n, 10000 / l.grams) : l.n);
  return {
    id: l.foodId ?? `log:${l.id}`,
    updatedAt: 0,
    name: l.name,
    brand: l.brand,
    source: l.source,
    per100,
    servings: l.servingLabel && l.servingQty ? [{ label: l.servingLabel, grams: l.grams / l.servingQty }] : [],
  };
}

/** Tổng dinh dưỡng của công thức (cho mỗi 100 g thành phẩm). */
export function recipePer100(items: { grams: number; per100: Nutrients }[], totalGrams?: number): Nutrients {
  const total = items.reduce(
    (acc, it) => {
      const n = scaleNutrients(it.per100, it.grams);
      acc.kcal += n.kcal;
      acc.protein += n.protein;
      acc.carbs += n.carbs;
      acc.fat += n.fat;
      acc.fiber! += n.fiber ?? 0;
      acc.sugar! += n.sugar ?? 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 } as Nutrients
  );
  const grams = totalGrams && totalGrams > 0 ? totalGrams : items.reduce((a, it) => a + it.grams, 0);
  if (!grams) return total;
  return scaleNutrients(total, 10000 / grams);
}

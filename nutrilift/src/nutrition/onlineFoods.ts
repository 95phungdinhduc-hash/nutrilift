// Nguồn thực phẩm trực tuyến (port ý tưởng từ OpenNutriTracker):
//  - Open Food Facts: tìm kiếm (Search-a-licious, dự phòng API cổ điển) + tra mã vạch
//  - USDA FoodData Central: tìm kiếm thực phẩm cơ bản (cần API key miễn phí, mặc định DEMO_KEY)
import type { Food, Nutrients, Serving } from "../db/types";

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_vi",
  "product_name_en",
  "generic_name",
  "brands",
  "nutriments",
  "serving_size",
  "serving_quantity",
  "product_quantity",
  "quantity",
  "image_front_thumb_url",
  "image_front_small_url",
].join(",");

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : undefined;
}

async function fetchJson(url: string, timeoutMs = 12000, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Open Food Facts ----------
export function offProductToFood(p: any): Food | undefined {
  if (!p) return undefined;
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  if (kcal == null && kj != null) kcal = kj / 4.184;
  const protein = num(n.proteins_100g) ?? 0;
  const carbs = num(n.carbohydrates_100g) ?? 0;
  const fat = num(n.fat_100g) ?? 0;
  if (kcal == null) {
    if (!protein && !carbs && !fat) return undefined;
    kcal = protein * 4 + carbs * 4 + fat * 9;
  }
  const name: string = (p.product_name_vi || p.product_name || p.product_name_en || p.generic_name || "").trim();
  if (!name) return undefined;
  const sodiumG = num(n.sodium_100g) ?? (num(n.salt_100g) != null ? num(n.salt_100g)! / 2.5 : undefined);
  const per100: Nutrients = {
    kcal,
    protein,
    carbs,
    fat,
    fiber: num(n.fiber_100g),
    sugar: num(n.sugars_100g),
    satFat: num(n["saturated-fat_100g"]),
    sodiumMg: sodiumG != null ? sodiumG * 1000 : undefined,
  };
  const servings: Serving[] = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0) servings.push({ label: p.serving_size ? `1 khẩu phần (${p.serving_size})` : "1 khẩu phần", grams: sq });
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq !== sq) servings.push({ label: `Cả gói/hộp (${p.quantity || pq + " g"})`, grams: pq });
  const isMl = /ml|cl|l\b/i.test(String(p.quantity ?? "")) || /ml/i.test(String(p.serving_size ?? ""));
  const code = String(p.code ?? "");
  return {
    id: `off:${code || name}`,
    updatedAt: 0,
    name,
    brand: p.brands ? String(p.brands).split(",")[0].trim() : undefined,
    barcode: code || undefined,
    source: "off",
    sourceId: code,
    per100,
    servings,
    unit: isMl ? "ml" : "g",
    imageUrl: p.image_front_thumb_url || p.image_front_small_url,
  };
}

export async function searchOFF(query: string, pageSize = 25): Promise<Food[]> {
  const q = encodeURIComponent(query);
  let products: any[] = [];
  try {
    const data = await fetchJson(
      `https://search.openfoodfacts.org/search?q=${q}&page_size=${pageSize}&langs=vi,en&fields=${OFF_FIELDS}`,
      9000
    );
    products = data.hits ?? [];
  } catch {
    const data = await fetchJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}`,
      15000
    );
    products = data.products ?? [];
  }
  return products.map(offProductToFood).filter((f): f is Food => !!f);
}

export async function lookupBarcode(code: string): Promise<Food | undefined> {
  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=${OFF_FIELDS}`, 12000).catch(
    (e) => {
      if (String(e).includes("404")) return { status: 0 };
      throw e;
    }
  );
  if (!data || data.status === 0 || !data.product) return undefined;
  return offProductToFood({ code, ...data.product });
}

// ---------- USDA FoodData Central ----------
const FDC_NUTRIENTS: Record<number, keyof Nutrients> = {
  1008: "kcal",
  2047: "kcal",
  2048: "kcal",
  1003: "protein",
  1004: "fat",
  1005: "carbs",
  1079: "fiber",
  2000: "sugar",
  1258: "satFat",
  1093: "sodiumMg",
};

export function fdcFoodToFood(f: any): Food | undefined {
  if (!f?.description) return undefined;
  const per100: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let hasKcal = false;
  for (const n of f.foodNutrients ?? []) {
    const id = Number(n.nutrientId ?? n.nutrient?.id);
    const key = FDC_NUTRIENTS[id];
    const value = num(n.value ?? n.amount);
    if (!key || value == null) continue;
    if (key === "kcal") {
      const unit = String(n.unitName ?? n.nutrient?.unitName ?? "KCAL").toUpperCase();
      if (unit !== "KCAL") continue;
      if (hasKcal && id !== 1008) continue;
      hasKcal = true;
    }
    (per100 as any)[key] = value;
  }
  if (!hasKcal) per100.kcal = per100.protein * 4 + per100.carbs * 4 + per100.fat * 9;
  const servings: Serving[] = [];
  const ss = num(f.servingSize);
  if (ss && /^(g|ml|grm)$/i.test(String(f.servingSizeUnit ?? ""))) {
    servings.push({ label: f.householdServingFullText ? `1 khẩu phần (${f.householdServingFullText})` : "1 khẩu phần", grams: ss });
  }
  const name = String(f.description)
    .toLowerCase()
    .replace(/(^|\s|,)\S/g, (m) => m.toUpperCase());
  return {
    id: `fdc:${f.fdcId}`,
    updatedAt: 0,
    name,
    brand: f.brandName || f.brandOwner || undefined,
    barcode: f.gtinUpc || undefined,
    source: "fdc",
    sourceId: String(f.fdcId),
    per100,
    servings,
    unit: "g",
  };
}

export async function searchFDC(query: string, apiKey?: string, pageSize = 25): Promise<Food[]> {
  const key = apiKey?.trim() || "DEMO_KEY";
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(
    query
  )}&pageSize=${pageSize}&dataType=${encodeURIComponent("Foundation,SR Legacy,Branded")}`;
  const data = await fetchJson(url, 12000);
  return (data.foods ?? []).map(fdcFoodToFood).filter((f: Food | undefined): f is Food => !!f);
}

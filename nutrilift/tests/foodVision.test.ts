import { describe, expect, it } from "vitest";
import { buildGeminiRequest, draftNutrients, parseGeminiResponse, toDrafts } from "../src/nutrition/foodVision";

const resp = (obj: unknown, fenced = false) => ({
  candidates: [{ content: { parts: [{ text: fenced ? "```json\n" + JSON.stringify(obj) + "\n```" : JSON.stringify(obj) }] } }],
});

describe("Gemini nhận diện món ăn", () => {
  it("tạo yêu cầu có ảnh, mô tả và JSON schema", () => {
    const r = buildGeminiRequest({ imageBase64: "AAA", mimeType: "image/jpeg", text: "nửa chén cơm" });
    const parts = r.contents[0].parts;
    expect(parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "AAA" });
    expect(parts[2].text).toContain("nửa chén cơm");
    expect(r.generationConfig.responseMimeType).toBe("application/json");
  });

  it("đọc kết quả (kể cả bọc ```json) và bỏ món không hợp lệ", () => {
    const r = parseGeminiResponse(
      resp(
        {
          items: [
            { name: "Cơm trắng", grams: 200, kcal: 260, protein: 5.4, carbs: 56, fat: 0.6, confidence: 0.9 },
            { name: "Thịt kho trứng", grams: 150, kcal: 330, protein: 22, carbs: 8, fat: 23 },
            { name: "", grams: 10, kcal: 1, protein: 0, carbs: 0, fat: 0 },
          ],
          note: "Bữa ăn khá nhiều chất béo",
        },
        true
      )
    );
    expect(r.items).toHaveLength(2);
    expect(r.note).toContain("chất béo");
  });

  it("báo lỗi rõ ràng khi bị chặn / lỗi API", () => {
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/SAFETY/);
    expect(() => parseGeminiResponse({ error: { message: "API key not valid" } })).toThrow(/API key/);
  });

  it("ghép với CSDL món Việt khi tên & mật độ calo hợp lý, nếu không thì dùng số liệu AI", () => {
    const r = parseGeminiResponse(
      resp({
        items: [
          { name: "Cơm trắng", grams: 200, kcal: 270, protein: 5, carbs: 58, fat: 0.5 },
          { name: "Món lạ XYZ", grams: 100, kcal: 150, protein: 10, carbs: 10, fat: 7 },
        ],
      })
    );
    const d = toDrafts(r);
    expect(d[0].matched?.id).toBe("vn:com-trang");
    expect(draftNutrients(d[0]).kcal).toBeCloseTo(260, 0); // 130 kcal/100g × 200g theo CSDL
    expect(d[1].matched).toBeUndefined();
    expect(draftNutrients(d[1]).kcal).toBeCloseTo(150, 0);
    expect(draftNutrients({ ...d[0], useMatch: false }).kcal).toBeCloseTo(270, 0);
  });
});

import { vi } from "vitest";
import { analyzeFood, isRetryable } from "../src/nutrition/foodVision";

describe("tự thử lại & đổi model khi Gemini quá tải", () => {
  it("phân loại lỗi tạm thời", () => {
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(400, "This model is currently experiencing high demand")).toBe(true);
    expect(isRetryable(400, "API key not valid")).toBe(false);
  });

  it("503 ở model đầu → thử lại → chuyển model kế tiếp và thành công", async () => {
    const store: Record<string, string> = { nl_gemini_key: "AIza-x" };
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: () => {}, removeItem: () => {} });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url.split("/models/")[1].split(":")[0]);
        if (calls.length <= 2)
          return { ok: false, status: 503, json: async () => ({ error: { message: "This model is currently experiencing high demand." } }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ name: "Phở bò", grams: 500, kcal: 450, protein: 25, carbs: 55, fat: 12 }] }) }] } }] }),
        };
      })
    );
    vi.useFakeTimers();
    const p = analyzeFood({ text: "1 tô phở" }, { mode: "key" });
    await vi.runAllTimersAsync();
    const r = await p;
    vi.useRealTimers();
    expect(r.items[0].name).toBe("Phở bò");
    expect(calls).toEqual(["gemini-flash-lite-latest", "gemini-flash-lite-latest", "gemini-flash-latest"]);
    vi.unstubAllGlobals();
  });
});

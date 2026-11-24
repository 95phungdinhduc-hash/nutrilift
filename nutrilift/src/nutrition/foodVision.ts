// Nhận diện món ăn từ ảnh bằng Gemini (Google AI Studio API).
// Hai cách gọi: (1) khoá Gemini lưu riêng trên thiết bị, (2) qua Supabase Edge Function "food-vision"
// (khoá nằm trên máy chủ Supabase của bạn, không lộ ra trình duyệt).
import type { Food, Nutrients } from "../db/types";
import { matchScore } from "../lib/text";
import { scaleNutrients } from "./calc";
import { searchLocal } from "./foodSearch";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
/** Thứ tự dự phòng khi model đang quá tải / hết lượt / không tồn tại. */
export const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

/** Lỗi tạm thời đáng thử lại / đổi model: quá tải, hết lượt, lỗi máy chủ, model không có. */
export function isRetryable(status: number, msg = ""): boolean {
  return [404, 429, 500, 502, 503, 504].includes(status) || /overload|high demand|unavailable|exhausted|quota/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY_STORAGE = "nl_gemini_key";

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setGeminiKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(KEY_STORAGE, k.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/** Món AI nhận ra trong ảnh. */
export interface VisionItem {
  name: string;
  nameEn?: string;
  grams: number;
  /** Dinh dưỡng AI ước tính cho cả khẩu phần. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence?: number;
}

export interface VisionResult {
  items: VisionItem[];
  note?: string;
}

/** Món sau khi ghép với CSDL (để người dùng xem/sửa trước khi lưu). */
export interface DraftItem {
  id: string;
  name: string;
  grams: number;
  /** Dinh dưỡng / 100 g đang dùng (từ CSDL nếu ghép được, nếu không thì từ AI). */
  per100: Nutrients;
  matched?: Food;
  aiPer100: Nutrients;
  useMatch: boolean;
  confidence?: number;
}

const PROMPT = `Bạn là chuyên gia dinh dưỡng Việt Nam. Hãy nhận diện TỪNG món/thành phần ăn được trong ảnh
(ví dụ: cơm trắng, thịt kho, rau muống xào, canh chua, nước chấm...). Với mỗi món ước tính:
- name: tên tiếng Việt thông dụng, ngắn gọn (ví dụ "Cơm trắng", "Phở bò", "Ức gà áp chảo")
- nameEn: tên tiếng Anh
- grams: khối lượng ăn được ước tính (gam; đồ uống tính theo ml), dựa vào kích thước bát/đĩa/đũa/thìa trong ảnh
- kcal, protein, carbs, fat: cho CẢ khẩu phần đó (không phải /100g), tính cả dầu mỡ chế biến
- confidence: độ tin cậy 0..1
Không bịa món không nhìn thấy. Nếu ảnh không phải đồ ăn, trả về items rỗng và giải thích ngắn trong note.
note: 1 câu nhận xét ngắn bằng tiếng Việt (ví dụ món nhiều dầu mỡ, nên thêm rau...).`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          nameEn: { type: "STRING" },
          grams: { type: "NUMBER" },
          kcal: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          confidence: { type: "NUMBER" },
        },
        required: ["name", "grams", "kcal", "protein", "carbs", "fat"],
      },
    },
    note: { type: "STRING" },
  },
  required: ["items"],
};

/** Tạo nội dung yêu cầu gửi Gemini (dùng chung cho cả 2 cách gọi). */
export function buildGeminiRequest(input: { imageBase64?: string; mimeType?: string; text?: string }) {
  const parts: any[] = [{ text: PROMPT }];
  if (input.imageBase64) parts.push({ inlineData: { mimeType: input.mimeType ?? "image/jpeg", data: input.imageBase64 } });
  if (input.text?.trim()) parts.push({ text: `Mô tả thêm của người dùng: ${input.text.trim()}` });
  return {
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isFinite(n) && n > 0 ? n : 0;
}

/** Đọc phản hồi Gemini → VisionResult (chịu được JSON bọc trong ```). */
export function parseGeminiResponse(resp: any): VisionResult {
  if (resp?.error) throw new Error(resp.error.message ?? "Gemini báo lỗi");
  const cand = resp?.candidates?.[0];
  if (!cand) {
    const reason = resp?.promptFeedback?.blockReason;
    throw new Error(reason ? `Ảnh bị từ chối (${reason})` : "Gemini không trả về kết quả");
  }
  const text: string = (cand.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let data: any;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error("Không đọc được kết quả từ Gemini");
  }
  const items: VisionItem[] = (Array.isArray(data?.items) ? data.items : [])
    .map((it: any) => ({
      name: String(it?.name ?? "").trim(),
      nameEn: it?.nameEn ? String(it.nameEn) : undefined,
      grams: num(it?.grams),
      kcal: num(it?.kcal),
      protein: num(it?.protein),
      carbs: num(it?.carbs),
      fat: num(it?.fat),
      confidence: it?.confidence != null ? Math.max(0, Math.min(1, num(it.confidence))) : undefined,
    }))
    .filter((it: VisionItem) => it.name && it.grams > 0);
  return { items, note: data?.note ? String(data.note) : undefined };
}

/** Ghép từng món với CSDL món Việt / món của tôi để dùng số liệu ổn định hơn. */
export function toDrafts(result: VisionResult, myFoods: Food[] = []): DraftItem[] {
  return result.items.map((it, i) => {
    const aiPer100: Nutrients = {
      kcal: (it.kcal / it.grams) * 100,
      protein: (it.protein / it.grams) * 100,
      carbs: (it.carbs / it.grams) * 100,
      fat: (it.fat / it.grams) * 100,
    };
    const cand = searchLocal(it.name, myFoods, 3)[0];
    // Chỉ ghép khi tên khớp tốt và mật độ calo không chênh quá xa (tránh ghép nhầm "cơm" với "cơm tấm sườn")
    let matched: Food | undefined;
    if (cand && matchScore(it.name, cand.name, cand.aliases) >= 40) {
      const ratio = cand.per100.kcal / Math.max(1, aiPer100.kcal);
      if (ratio > 0.5 && ratio < 2) matched = cand;
    }
    return {
      id: `d${i}`,
      name: it.name,
      grams: Math.round(it.grams),
      per100: matched ? matched.per100 : aiPer100,
      matched,
      aiPer100,
      useMatch: !!matched,
      confidence: it.confidence,
    };
  });
}

export function draftNutrients(d: DraftItem): Nutrients {
  return scaleNutrients(d.useMatch && d.matched ? d.matched.per100 : d.aiPer100, d.grams);
}

// ---------- Ảnh ----------
/** Thu nhỏ ảnh (cạnh dài ≤ 1024px, JPEG) để gửi nhanh và tiết kiệm hạn mức. */
export async function prepareImage(file: Blob, maxSide = 1024): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let canvas: HTMLCanvasElement | null = null;
  if (bitmap) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  const dataUrl = canvas
    ? canvas.toDataURL("image/jpeg", 0.82)
    : await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
  const [head, base64] = dataUrl.split(",");
  const mimeType = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  return { base64, mimeType, previewUrl: dataUrl };
}

// ---------- Gọi API ----------
async function callDirect(body: unknown, key: string, model: string, onStatus?: (m: string) => void): Promise<any> {
  const models = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  let lastErr: Error | undefined;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      onStatus?.(attempt ? `${m} đang bận, thử lại…` : m === model ? "" : `Chuyển sang ${m}…`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) {
        lastErr = new Error("Không kết nối được Gemini — kiểm tra mạng");
        break;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const msg: string = data?.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 400 && /API key/i.test(msg)) throw new Error("Khoá Gemini không hợp lệ");
      if (res.status === 403) throw new Error("Khoá Gemini bị từ chối (403) — kiểm tra khoá trong AI Studio");
      lastErr = new Error(
        res.status === 429 ? "Hết lượt miễn phí tạm thời của mọi model — thử lại sau ít phút" : res.status === 503 ? "Gemini đang quá tải — thử lại sau ít phút" : msg
      );
      if (!isRetryable(res.status, msg)) throw lastErr;
      // Quá tải (503): đợi một chút rồi thử lại cùng model; hết lượt/không tồn tại: sang model khác ngay
      if (res.status === 503 && attempt === 0) {
        await sleep(1500);
        continue;
      }
      break;
    }
  }
  throw lastErr ?? new Error("Không gọi được Gemini");
}

async function callSupabase(body: unknown, model: string): Promise<any> {
  const { getClient } = await import("../sync/cloud");
  const c = getClient();
  if (!c) throw new Error("Chưa cấu hình đồng bộ Supabase");
  const { data: s } = await c.auth.getSession();
  if (!s.session) throw new Error("Hãy đăng nhập đồng bộ để dùng AI qua Supabase");
  const { data, error } = await c.functions.invoke("food-vision", { body: { model, request: body } });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx?.json) detail = (await ctx.json())?.error ?? detail;
    } catch {
      /* ignore */
    }
    if (/not found|404/i.test(detail)) throw new Error("Chưa cài hàm food-vision trên Supabase (xem HUONG_DAN.md)");
    throw new Error(detail);
  }
  return data;
}

export async function analyzeFood(
  input: { imageBase64?: string; mimeType?: string; text?: string },
  opts: { mode: "key" | "supabase"; model?: string; onStatus?: (m: string) => void }
): Promise<VisionResult> {
  const body = buildGeminiRequest(input);
  const model = opts.model?.trim() || DEFAULT_GEMINI_MODEL;
  let resp: any;
  if (opts.mode === "supabase") resp = await callSupabase(body, model);
  else {
    const key = getGeminiKey();
    if (!key) throw new Error("Chưa nhập khoá Gemini (Cài đặt → Dữ liệu & khác → AI nhận diện món ăn)");
    resp = await callDirect(body, key, model, opts.onStatus);
  }
  return parseGeminiResponse(resp);
}

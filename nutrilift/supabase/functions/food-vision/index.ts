// Supabase Edge Function: chuyển tiếp yêu cầu nhận diện món ăn tới Gemini.
// Khoá GEMINI_API_KEY nằm trong Secrets của Supabase — không bao giờ gửi xuống trình duyệt.
// Chỉ người dùng đã đăng nhập mới gọi được (Supabase kiểm tra JWT mặc định).
const ALLOWED_MODELS = /^gemini-[a-z0-9.\-]+$/i;
const FALLBACK = ["gemini-2.5-flash", "gemini-2.0-flash"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json(500, { error: "Chưa đặt secret GEMINI_API_KEY trên Supabase" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Dữ liệu không hợp lệ" });
  }
  const request = payload?.request;
  const model = String(payload?.model || "gemini-flash-latest");
  if (!request?.contents || !ALLOWED_MODELS.test(model)) return json(400, { error: "Yêu cầu không hợp lệ" });
  // Giới hạn kích thước (~6 MB) để tránh lạm dụng
  if (JSON.stringify(request).length > 6_000_000) return json(413, { error: "Ảnh quá lớn" });

  for (const m of [model, ...FALLBACK.filter((x) => x !== model)]) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(request),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return json(200, data);
    if (res.status !== 404) return json(res.status, { error: data?.error?.message ?? `Gemini HTTP ${res.status}` });
  }
  return json(404, { error: "Không tìm thấy model Gemini phù hợp" });
});

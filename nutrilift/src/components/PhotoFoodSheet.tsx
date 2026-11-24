import { useLiveQuery } from "dexie-react-hooks";
import { Camera, ImagePlus, Link2, Link2Off, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { alive, db } from "../db/db";
import type { Food, MealType } from "../db/types";
import { logFood, MEALS } from "../lib/actions";
import { fmt } from "../lib/format";
import { useSettings } from "../lib/hooks";
import { navigate } from "../lib/router";
import { sumNutrients } from "../nutrition/calc";
import { analyzeFood, draftNutrients, getGeminiKey, prepareImage, toDrafts, type DraftItem } from "../nutrition/foodVision";
import { AnimatedNumber, Badge, Button, cx, IconButton, NumberField, Segmented, Sheet, toast } from "./ui";

type Stage = "pick" | "loading" | "review";

export function PhotoFoodSheet({ open, onClose, date, meal: initialMeal, onLogged }: { open: boolean; onClose: () => void; date: string; meal: MealType; onLogged?: (n: number) => void }) {
  const settings = useSettings();
  const ai = settings.ai ?? { mode: "key" as const };
  const myFoods = useLiveQuery(async () => alive(await db.foods.toArray()), []) ?? [];
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [img, setImg] = useState<{ base64: string; mimeType: string; previewUrl: string } | null>(null);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const configured = ai.mode === "supabase" || !!getGeminiKey();

  const reset = () => {
    setStage("pick");
    setImg(null);
    setText("");
    setDrafts([]);
    setNote(undefined);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setError(null);
    try {
      setImg(await prepareImage(f));
    } catch {
      setError("Không đọc được ảnh");
    }
  };

  const run = async () => {
    if (!img && !text.trim()) return;
    setStage("loading");
    setError(null);
    try {
      const r = await analyzeFood({ imageBase64: img?.base64, mimeType: img?.mimeType, text }, { mode: ai.mode, model: ai.model, onStatus: setStatus });
      const d = toDrafts(r, myFoods);
      setDrafts(d);
      setNote(r.note);
      setStage("review");
      if (!d.length) setError(r.note || "Không nhận ra món ăn nào — thử chụp gần và rõ hơn.");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStage("pick");
    }
  };

  const total = sumNutrients(drafts.map(draftNutrients));

  const save = async () => {
    setSaving(true);
    try {
      for (const d of drafts) {
        if (d.grams <= 0) continue;
        const food: Food =
          d.useMatch && d.matched
            ? d.matched
            : { id: `ai:${d.name}`, updatedAt: 0, name: d.name, source: "ai", per100: d.aiPer100, servings: [] };
        await logFood({ food, grams: d.grams, meal, date });
      }
      toast(`Đã thêm ${drafts.length} món từ ảnh`);
      onLogged?.(drafts.length);
      close();
    } finally {
      setSaving(false);
    }
  };

  const upd = (id: string, patch: Partial<DraftItem>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <Sheet
      open={open}
      onClose={close}
      wide
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-accent text-white dark:text-slate-950">
            <Sparkles size={15} />
          </span>
          Chụp món ăn
        </span>
      }
      footer={
        stage === "review" && drafts.length > 0 ? (
          <div className="space-y-3">
            <Segmented size="sm" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.short }))} />
            <div className="flex gap-2">
              <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => setStage("pick")}>
                Chụp lại
              </Button>
              <Button className="flex-1 whitespace-nowrap" size="lg" disabled={saving} onClick={save}>
                <span>
                  Thêm {drafts.length} món · <AnimatedNumber value={total.kcal} /> kcal
                </span>
              </Button>
            </div>
          </div>
        ) : stage === "pick" ? (
          <Button size="lg" className="w-full" disabled={!configured || (!img && !text.trim())} icon={<Sparkles size={18} />} onClick={run}>
            Phân tích bằng Gemini
          </Button>
        ) : undefined
      }
    >
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />

      {!configured && (
        <div className="mb-3 rounded-2xl bg-carbs/15 p-3 text-sm">
          Cần khoá Gemini API (miễn phí) để dùng tính năng này.{" "}
          <button className="font-semibold text-accent-ink underline" onClick={() => (close(), navigate("/settings?tab=data"))}>
            Thiết lập ngay →
          </button>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {stage !== "review" ? (
          <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-line bg-surface-2">
              {img ? (
                <img src={img.previewUrl} alt="Ảnh món ăn" className="h-full w-full object-cover" />
              ) : (
                <button onClick={() => cameraRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted transition hover:text-ink">
                  <motion.span
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-accent text-white shadow-[0_18px_40px_-12px_var(--accent)] dark:text-slate-950"
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Camera size={34} />
                  </motion.span>
                  <span className="text-sm font-semibold">Chạm để chụp đĩa ăn của bạn</span>
                  <span className="text-xs">Chụp từ trên xuống, đủ sáng, thấy cả bát/đĩa</span>
                </button>
              )}
              {/* Hiệu ứng quét khi AI đang phân tích */}
              {stage === "loading" && (
                <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]">
                  <motion.div
                    className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[color-mix(in_srgb,var(--accent)_55%,transparent)] to-transparent"
                    animate={{ top: ["-20%", "100%"] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        "linear-gradient(color-mix(in srgb, var(--accent) 50%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 50%, transparent) 1px, transparent 1px)",
                      backgroundSize: "32px 32px",
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-4 flex justify-center">
                    <span className="flex items-center gap-2 rounded-full bg-slate-950/70 px-4 py-2 text-sm font-semibold text-white">
                      <Sparkles size={15} className="animate-pulse" /> {status || "Gemini đang nhận diện món ăn…"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" icon={<Camera size={18} />} disabled={stage === "loading"} onClick={() => cameraRef.current?.click()}>
                {img ? "Chụp lại" : "Chụp ảnh"}
              </Button>
              <Button variant="secondary" className="flex-1" icon={<ImagePlus size={18} />} disabled={stage === "loading"} onClick={() => galleryRef.current?.click()}>
                Chọn từ thư viện
              </Button>
            </div>
            <textarea
              className="field text-sm"
              rows={2}
              placeholder="Mô tả thêm (tuỳ chọn): VD “cơm nửa chén, thịt kho 3 miếng, ăn hết”. Có thể chỉ mô tả bằng chữ, không cần ảnh."
              value={text}
              disabled={stage === "loading"}
              onChange={(e) => setText(e.target.value)}
            />
            {error && <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</div>}
            <p className="text-xs text-muted">Ảnh được gửi tới Google Gemini để phân tích và không được lưu trong app. Kết quả là ước tính — hãy kiểm tra khối lượng trước khi lưu.</p>
          </motion.div>
        ) : (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex gap-3">
              {img && <img src={img.previewUrl} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />}
              <div className="min-w-0 flex-1 rounded-2xl bg-surface-2 p-3">
                <div className="tabular text-2xl font-extrabold">
                  <AnimatedNumber value={total.kcal} /> kcal
                </div>
                <div className="tabular text-xs text-muted">
                  P {fmt(total.protein)}g · C {fmt(total.carbs)}g · F {fmt(total.fat)}g
                </div>
                {note && <div className="mt-1 text-xs text-ink/80">💬 {note}</div>}
              </div>
            </div>
            {error && <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</div>}
            <div className="stagger space-y-2">
              {drafts.map((d) => {
                const n = draftNutrients(d);
                return (
                  <div key={d.id} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <input
                          className="w-full bg-transparent text-[15px] font-semibold outline-none"
                          value={d.name}
                          onChange={(e) => upd(d.id, { name: e.target.value })}
                          aria-label="Tên món"
                        />
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {d.matched ? (
                            <button
                              onClick={() => upd(d.id, { useMatch: !d.useMatch })}
                              className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", d.useMatch ? "bg-accent-soft text-accent-ink" : "bg-surface-2")}
                              title="Bật/tắt dùng số liệu từ cơ sở dữ liệu"
                            >
                              {d.useMatch ? <Link2 size={12} /> : <Link2Off size={12} />}
                              {d.useMatch ? `Theo CSDL: ${d.matched.name}` : "Dùng số liệu AI"}
                            </button>
                          ) : (
                            <Badge>Số liệu AI</Badge>
                          )}
                          {d.confidence != null && d.confidence < 0.6 && <Badge color="danger">Không chắc chắn</Badge>}
                        </div>
                      </div>
                      <IconButton label="Bỏ món" onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <NumberField className="w-28 shrink-0" value={d.grams} onChange={(v) => upd(d.id, { grams: v ?? 0 })} suffix="g" step={10} />
                      <div className="tabular ml-auto text-right">
                        <div className="font-bold whitespace-nowrap">{fmt(n.kcal)} kcal</div>
                        <div className="text-[11px] whitespace-nowrap text-muted">
                          P {fmt(n.protein)} · C {fmt(n.carbs)} · F {fmt(n.fat)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {[0.5, 0.75, 1.25, 1.5].map((f) => (
                        <button
                          key={f}
                          className="flex-1 rounded-lg bg-surface-2 py-1 text-xs font-semibold transition hover:bg-surface-3 active:scale-95"
                          onClick={() => upd(d.id, { grams: Math.round(d.grams * f) })}
                        >
                          ×{f}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

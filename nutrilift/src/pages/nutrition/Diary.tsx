import { useLiveQuery } from "dexie-react-hooks";
import { Activity, ChevronLeft, ChevronRight, Copy, Flame, MoreHorizontal, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { FoodAmountSheet } from "../../components/FoodAmountSheet";
import { Button, Card, IconButton, NumberField, SectionTitle, Sheet, TextField, toast } from "../../components/ui";
import { CaloriesSummary, WaterTracker } from "../../components/widgets";
import { alive, db, remove } from "../../db/db";
import type { FoodLog, MealType } from "../../db/types";
import { copyMeal, logActivity, MEALS, updateFoodLogAmount } from "../../lib/actions";
import { addDays, relativeDayLabel, today } from "../../lib/date";
import { fmt } from "../../lib/format";
import { useActivities, useFoodLogs, useGoals, useTargets, useWeights } from "../../lib/hooks";
import { navigate, useLocation } from "../../lib/router";
import { matchScore } from "../../lib/text";
import { ACTIVITIES, activityKcal } from "../../nutrition/activities";
import { latestWeight, sumNutrients } from "../../nutrition/calc";
import { foodFromLog } from "../../nutrition/foodSearch";

function MealSection({ meal, logs, date, onEdit }: { meal: (typeof MEALS)[number]; logs: FoodLog[]; date: string; onEdit: (l: FoodLog) => void }) {
  const total = sumNutrients(logs.map((l) => l.n));
  const [menu, setMenu] = useState(false);
  const yesterday = addDays(date, -1);
  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-lg">{meal.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{meal.label}</div>
          <div className="tabular text-xs text-muted">
            {fmt(total.kcal)} kcal · P {fmt(total.protein)} · C {fmt(total.carbs)} · F {fmt(total.fat)}
          </div>
        </div>
        <IconButton label="Tuỳ chọn" onClick={() => setMenu(true)}>
          <MoreHorizontal size={18} />
        </IconButton>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/nutrition/add?meal=${meal.id}&d=${date}`)} icon={<Plus size={16} />}>
          Thêm
        </Button>
      </div>
      <div className="px-4 pb-2">
        {logs.length === 0 ? (
          <div className="py-2 text-sm text-muted">Chưa có món nào</div>
        ) : (
          logs.map((l) => (
            <button key={l.id} onClick={() => onEdit(l)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{l.name}</div>
                <div className="truncate text-xs text-muted">
                  {l.source === "quick" ? "Nhập nhanh" : l.servingLabel && l.servingQty ? `${fmt(l.servingQty, 2)} × ${l.servingLabel}` : `${fmt(l.grams)} g`}
                  {l.brand ? ` · ${l.brand}` : ""} · P {fmt(l.n.protein, 1)} C {fmt(l.n.carbs, 1)} F {fmt(l.n.fat, 1)}
                </div>
              </div>
              <div className="tabular shrink-0 text-sm font-semibold">{fmt(l.n.kcal)}</div>
            </button>
          ))
        )}
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title={meal.label}>
        <div className="space-y-2 pb-2">
          <Button
            variant="secondary"
            className="w-full justify-start"
            icon={<Copy size={18} />}
            onClick={async () => {
              const n = await copyMeal(yesterday, date, meal.id);
              toast(n ? `Đã chép ${n} món từ ${relativeDayLabel(yesterday).toLowerCase()}` : "Hôm trước không có món nào ở bữa này", n ? "ok" : "info");
              setMenu(false);
            }}
          >
            Chép {meal.label.toLowerCase()} từ {relativeDayLabel(yesterday).toLowerCase()}
          </Button>
          {logs.length > 0 && (
            <Button
              variant="danger"
              className="w-full justify-start"
              icon={<Trash2 size={18} />}
              onClick={async () => {
                if (!confirm(`Xoá ${logs.length} món trong ${meal.label.toLowerCase()}?`)) return;
                for (const l of logs) await remove("foodLogs", l.id);
                setMenu(false);
              }}
            >
              Xoá toàn bộ bữa này
            </Button>
          )}
        </div>
      </Sheet>
    </Card>
  );
}

function ActivitySheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<(typeof ACTIVITIES)[number] | null>(null);
  const [minutes, setMinutes] = useState<number | undefined>(30);
  const [customKcal, setCustomKcal] = useState<number | undefined>();
  const [customName, setCustomName] = useState("");
  const weights = useWeights();
  const kg = latestWeight(weights) ?? 70;
  const list = useMemo(() => (q ? ACTIVITIES.filter((a) => matchScore(q, a.name, a.group) >= 0) : ACTIVITIES), [q]);
  const close = () => {
    setSel(null);
    setQ("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={sel ? sel.name : "Ghi hoạt động"}>
      {sel ? (
        <div className="space-y-4">
          <NumberField label="Thời gian" suffix="phút" value={minutes} onChange={setMinutes} step={5} stepper autoFocus />
          <div className="rounded-2xl bg-surface-2 p-4 text-center">
            <div className="tabular text-3xl font-extrabold">{fmt(activityKcal(sel.met, kg, minutes ?? 0))} kcal</div>
            <div className="text-xs text-muted">
              MET {sel.met} × {fmt(kg, 1)} kg × {minutes ?? 0} phút
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSel(null)}>
              Quay lại
            </Button>
            <Button
              className="flex-1"
              disabled={!minutes}
              onClick={async () => {
                await logActivity({ date, code: sel.code, name: sel.name, met: sel.met, minutes: minutes!, kcal: activityKcal(sel.met, kg, minutes!) });
                toast("Đã ghi hoạt động");
                close();
              }}
            >
              Lưu
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <TextField placeholder="Tìm: chạy, cầu lông, bơi..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[45dvh] space-y-0.5 overflow-y-auto">
            {list.map((a) => (
              <button key={a.code} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2" onClick={() => setSel(a)}>
                <span>
                  <span className="block text-[15px]">{a.name}</span>
                  <span className="text-xs text-muted">{a.group}</span>
                </span>
                <span className="tabular text-xs text-muted">~{activityKcal(a.met, kg, 60)} kcal/giờ</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-line p-3">
            <div className="mb-2 text-sm font-semibold">Nhập kcal trực tiếp (từ đồng hồ thông minh...)</div>
            <div className="flex gap-2">
              <TextField className="flex-1" placeholder="Tên hoạt động" value={customName} onChange={(e) => setCustomName(e.target.value)} />
              <NumberField className="w-28" suffix="kcal" value={customKcal} onChange={setCustomKcal} />
            </div>
            <Button
              className="mt-2 w-full"
              variant="secondary"
              disabled={!customKcal}
              onClick={async () => {
                await logActivity({ date, code: "custom", name: customName || "Hoạt động khác", met: 0, minutes: 0, kcal: customKcal! });
                toast("Đã ghi hoạt động");
                setCustomKcal(undefined);
                setCustomName("");
                close();
              }}
            >
              Lưu
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function Diary() {
  const { query } = useLocation();
  const date = query.get("d") || today();
  const setDate = (d: string) => navigate(`/nutrition?d=${d}`, { replace: true });
  const logs = useFoodLogs(date) ?? [];
  const targets = useTargets(date);
  const goals = useGoals();
  const activities = useActivities(date);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const favIds = useLiveQuery(async () => new Set(alive(await db.foods.toArray()).filter((f) => f.favorite).map((f) => f.id)), []);
  const total = sumNutrients(logs.map((l) => l.n));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Ngày trước" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft />
        </IconButton>
        <label className="relative flex flex-col items-center">
          <span className="text-lg font-extrabold">{relativeDayLabel(date)}</span>
          <span className="text-xs text-muted">{date !== today() ? <button onClick={(e) => (e.preventDefault(), setDate(today()))} className="font-semibold text-accent-ink">Về hôm nay</button> : "Nhật ký ăn uống"}</span>
          <input type="date" className="absolute inset-0 cursor-pointer opacity-0" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Chọn ngày" />
        </label>
        <IconButton label="Ngày sau" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight />
        </IconButton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {MEALS.map((m) => (
            <MealSection key={m.id} meal={m} date={date} logs={logs.filter((l) => l.meal === m.id)} onEdit={setEditing} />
          ))}
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <Activity size={18} className="text-train" /> Vận động
              </div>
              <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => setActOpen(true)}>
                Thêm
              </Button>
            </div>
            {activities.length === 0 ? (
              <div className="py-1 text-sm text-muted">Chưa ghi hoạt động. Buổi tập tạ có thể tự ghi khi kết thúc buổi.</div>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-1.5">
                  <Flame size={16} className="text-train" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{a.name}</div>
                    {a.minutes > 0 && <div className="text-xs text-muted">{a.minutes} phút</div>}
                  </div>
                  <span className="tabular text-sm font-semibold">{fmt(a.kcal)} kcal</span>
                  <IconButton label="Xoá" onClick={() => remove("activityLogs", a.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))
            )}
            {activities.length > 0 && goals.activityKcalFactor === 0 && (
              <div className="mt-1 text-xs text-muted">Calo vận động không được cộng vào mục tiêu (đổi trong Cài đặt → Mục tiêu).</div>
            )}
          </Card>
        </div>
        <div className="space-y-3">
          {targets && <CaloriesSummary logs={logs} targets={targets} compact />}
          <WaterTracker date={date} goalMl={goals.waterMl} />
          {logs.length > 0 && (
            <Card>
              <SectionTitle>Vi chất</SectionTitle>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Chất xơ</span>
                  <b className="tabular">
                    {fmt(total.fiber, 1)}
                    {targets?.fiber ? `/${targets.fiber}` : ""}g
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Đường</span>
                  <b className="tabular">{fmt(total.sugar, 1)}g</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Béo bão hoà</span>
                  <b className="tabular">{fmt(total.satFat, 1)}g</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Natri</span>
                  <b className="tabular">{fmt(total.sodiumMg)}mg</b>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted">Chỉ tính các món có dữ liệu vi chất.</div>
            </Card>
          )}
          <Button variant="outline" className="w-full" icon={<UtensilsCrossed size={18} />} onClick={() => navigate("/nutrition/foods")}>
            Món của tôi & công thức
          </Button>
        </div>
      </div>

      <FoodAmountSheet
        food={editing ? foodFromLog(editing) : null}
        open={!!editing && editing.source !== "quick"}
        onClose={() => setEditing(null)}
        initial={editing ? { grams: editing.grams, servingLabel: editing.servingLabel, servingQty: editing.servingQty, meal: editing.meal } : undefined}
        confirmLabel="Cập nhật"
        favorite={editing?.foodId ? favIds?.has(editing.foodId) ?? false : undefined}
        onDelete={async () => {
          if (!editing) return;
          await remove("foodLogs", editing.id);
          toast("Đã xoá món", "info");
          setEditing(null);
        }}
        onConfirm={async (c) => {
          if (!editing) return;
          await updateFoodLogAmount(editing, c.grams, c.servingLabel, c.servingQty, c.meal as MealType);
          setEditing(null);
        }}
      />
      {editing?.source === "quick" && <QuickLogSheet log={editing} onDone={() => setEditing(null)} />}
      <ActivitySheet open={actOpen} onClose={() => setActOpen(false)} date={date} />
    </div>
  );
}

/** Món nhập nhanh: chỉ xem & xoá. */
function QuickLogSheet({ log, onDone }: { log: FoodLog; onDone: () => void }) {
  return (
    <Sheet open onClose={onDone} title={log.name}>
      <div className="space-y-3 pb-2">
        <div className="rounded-2xl bg-surface-2 p-4 text-center">
          <div className="tabular text-3xl font-extrabold">{fmt(log.n.kcal)} kcal</div>
          <div className="text-sm text-muted">
            P {fmt(log.n.protein)}g · C {fmt(log.n.carbs)}g · F {fmt(log.n.fat)}g
          </div>
        </div>
        <Button
          variant="danger"
          className="w-full"
          icon={<Trash2 size={18} />}
          onClick={async () => {
            await remove("foodLogs", log.id);
            onDone();
          }}
        >
          Xoá
        </Button>
      </div>
    </Sheet>
  );
}

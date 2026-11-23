import { Heart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Food, MealType } from "../db/types";
import { MEALS, toggleFavorite } from "../lib/actions";
import { fmt } from "../lib/format";
import { scaleNutrients } from "../nutrition/calc";
import { SOURCE_LABELS } from "../nutrition/foodSearch";
import { Badge, Button, cx, IconButton, NumberField, Segmented, Sheet } from "./ui";

export interface AmountChoice {
  grams: number;
  servingLabel?: string;
  servingQty?: number;
  meal: MealType;
}

export function FoodAmountSheet({
  food,
  open,
  onClose,
  onConfirm,
  initial,
  confirmLabel = "Thêm vào nhật ký",
  showMeal = true,
  favorite,
  onDelete,
}: {
  food: Food | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (c: AmountChoice) => void;
  initial?: Partial<AmountChoice>;
  confirmLabel?: string;
  showMeal?: boolean;
  favorite?: boolean;
  onDelete?: () => void;
}) {
  const unit = food?.unit ?? "g";
  const options = useMemo(() => {
    const s = (food?.servings ?? []).filter((x) => x.grams > 0);
    return [...s.map((x, i) => ({ key: `s${i}`, label: `${x.label} (${fmt(x.grams)}${unit})`, grams: x.grams, servingLabel: x.label })), { key: "g", label: unit === "ml" ? "Mililít (ml)" : "Gam (g)", grams: 1, servingLabel: undefined as string | undefined }];
  }, [food, unit]);

  const [optKey, setOptKey] = useState("g");
  const [qty, setQty] = useState<number | undefined>(100);
  const [meal, setMeal] = useState<MealType>(initial?.meal ?? "lunch");

  useEffect(() => {
    if (!open || !food) return;
    const fromInitial = initial?.servingLabel ? options.find((o) => o.servingLabel === initial.servingLabel) : undefined;
    if (fromInitial && initial?.servingQty) {
      setOptKey(fromInitial.key);
      setQty(initial.servingQty);
    } else if (initial?.grams) {
      setOptKey("g");
      setQty(initial.grams);
    } else if (options.length > 1) {
      setOptKey(options[0].key);
      setQty(1);
    } else {
      setOptKey("g");
      setQty(100);
    }
    if (initial?.meal) setMeal(initial.meal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, food?.id]);

  if (!food) return null;
  const opt = options.find((o) => o.key === optKey) ?? options[options.length - 1];
  const grams = (qty ?? 0) * opt.grams;
  const n = scaleNutrients(food.per100, grams);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div className="min-w-0">
          <div className="truncate">{food.name}</div>
          <div className="flex items-center gap-2 text-xs font-normal text-muted">
            <Badge>{SOURCE_LABELS[food.source]}</Badge>
            {food.brand && <span className="truncate">{food.brand}</span>}
          </div>
        </div>
      }
      footer={
        <div className="flex gap-2">
          {onDelete && (
            <IconButton label="Xoá" className="h-12 w-12 bg-danger/10 text-danger hover:bg-danger/15" onClick={onDelete}>
              <Trash2 size={20} />
            </IconButton>
          )}
          {favorite !== undefined && (
            <IconButton label={favorite ? "Bỏ yêu thích" : "Yêu thích"} className="h-12 w-12 bg-surface-2" onClick={() => toggleFavorite(food)}>
              <Heart size={20} className={favorite ? "fill-fat text-fat" : ""} />
            </IconButton>
          )}
          <Button size="lg" className="flex-1" disabled={!grams} onClick={() => onConfirm({ grams, servingLabel: opt.servingLabel, servingQty: opt.servingLabel ? qty : undefined, meal })}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Khẩu phần</span>
            <select
              className="field"
              value={optKey}
              onChange={(e) => {
                const o = options.find((x) => x.key === e.target.value)!;
                // giữ nguyên khối lượng khi đổi đơn vị
                setQty(o.key === "g" ? Math.round(grams) || 100 : Math.max(0.25, Math.round((grams / o.grams) * 4) / 4) || 1);
                setOptKey(o.key);
              }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <NumberField className="w-32" value={qty} onChange={setQty} step={opt.key === "g" ? 10 : 0.5} min={0} stepper={false} autoFocus />
        </div>
        {opt.key !== "g" && (
          <div className="flex flex-wrap gap-1.5">
            {[0.5, 1, 1.5, 2, 3].map((q) => (
              <button key={q} className={cx("rounded-full px-3 py-1 text-sm font-semibold", qty === q ? "bg-accent text-white dark:text-slate-950" : "bg-surface-2")} onClick={() => setQty(q)}>
                ×{fmt(q, 1)}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {fmt(grams)} {unit}
            </span>
            <span className="tabular text-3xl font-extrabold">{fmt(n.kcal)} kcal</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="tabular font-bold text-protein">{fmt(n.protein, 1)}g</div>
              <div className="text-xs text-muted">Protein</div>
            </div>
            <div>
              <div className="tabular font-bold text-carbs">{fmt(n.carbs, 1)}g</div>
              <div className="text-xs text-muted">Carb</div>
            </div>
            <div>
              <div className="tabular font-bold text-fat">{fmt(n.fat, 1)}g</div>
              <div className="text-xs text-muted">Chất béo</div>
            </div>
          </div>
          {(n.fiber != null || n.sugar != null || n.sodiumMg != null) && (
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
              {n.fiber != null && <span>Chất xơ {fmt(n.fiber, 1)}g</span>}
              {n.sugar != null && <span>Đường {fmt(n.sugar, 1)}g</span>}
              {n.satFat != null && <span>Béo bão hoà {fmt(n.satFat, 1)}g</span>}
              {n.sodiumMg != null && <span>Natri {fmt(n.sodiumMg)}mg</span>}
            </div>
          )}
          <div className="mt-2 text-center text-[11px] text-muted">
            Trên 100{unit}: {fmt(food.per100.kcal)} kcal · P {fmt(food.per100.protein, 1)} · C {fmt(food.per100.carbs, 1)} · F {fmt(food.per100.fat, 1)}
          </div>
        </div>
        {showMeal && (
          <div>
            <span className="mb-1 block text-sm font-medium">Bữa</span>
            <Segmented size="sm" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.short }))} />
          </div>
        )}
        {food.source === "vn" && <p className="text-xs text-muted">Giá trị món chế biến là ước tính trung bình; thực tế phụ thuộc công thức và khẩu phần của quán.</p>}
      </div>
    </Sheet>
  );
}

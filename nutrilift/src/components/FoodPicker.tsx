import { useLiveQuery } from "dexie-react-hooks";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { alive, db } from "../db/db";
import type { Food } from "../db/types";
import { fmt } from "../lib/format";
import { useDebounced, useOnline, useSettings } from "../lib/hooks";
import { searchLocal, SOURCE_LABELS } from "../nutrition/foodSearch";
import { searchFDC, searchOFF } from "../nutrition/onlineFoods";
import { FoodAmountSheet } from "./FoodAmountSheet";
import { Badge, Sheet } from "./ui";

/** Chọn thực phẩm + khối lượng (dùng cho công thức). */
export function FoodPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (food: Food, grams: number) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 450);
  const [sel, setSel] = useState<Food | null>(null);
  const [onlineFoods, setOnlineFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const online = useOnline();
  const settings = useSettings();
  const myFoods = useLiveQuery(async () => alive(await db.foods.toArray()).filter((f) => f.source !== "recipe"), []) ?? [];
  const local = useMemo(() => (q.trim() ? searchLocal(q, myFoods, 25) : myFoods.slice(0, 25)), [q, myFoods]);

  useEffect(() => {
    if (!open || dq.length < 2 || !online) {
      setOnlineFoods([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    Promise.allSettled([settings.onlineSources.off ? searchOFF(dq, 15) : Promise.resolve([]), settings.onlineSources.fdc ? searchFDC(dq, settings.fdcApiKey, 15) : Promise.resolve([])]).then((rs) => {
      if (cancel) return;
      setOnlineFoods(rs.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [dq, open, online, settings.onlineSources.off, settings.onlineSources.fdc, settings.fdcApiKey]);

  const row = (f: Food) => (
    <button key={f.id} onClick={() => setSel(f)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
      <span className="min-w-0">
        <span className="block truncate text-[15px]">{f.name}</span>
        <span className="text-xs text-muted">
          {fmt(f.per100.kcal)} kcal/100{f.unit ?? "g"} · P {fmt(f.per100.protein, 1)}
        </span>
      </span>
      <Badge>{SOURCE_LABELS[f.source]}</Badge>
    </button>
  );

  return (
    <>
      <Sheet open={open && !sel} onClose={onClose} title="Thêm nguyên liệu">
        <input className="field mb-2" autoFocus placeholder="Tìm nguyên liệu..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[55dvh] overflow-y-auto">
          {local.map(row)}
          {loading && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Đang tìm trực tuyến…
            </div>
          )}
          {onlineFoods.map(row)}
        </div>
      </Sheet>
      <FoodAmountSheet
        food={sel}
        open={!!sel}
        showMeal={false}
        confirmLabel="Thêm nguyên liệu"
        onClose={() => setSel(null)}
        onConfirm={(c) => {
          if (sel) onPick(sel, c.grams);
          setSel(null);
          setQ("");
        }}
      />
    </>
  );
}

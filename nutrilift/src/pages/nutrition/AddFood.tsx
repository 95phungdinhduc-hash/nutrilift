import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Barcode, ChefHat, Heart, History, Loader2, PencilLine, Plus, Search, WifiOff, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { FoodAmountSheet } from "../../components/FoodAmountSheet";
import { Badge, Button, cx, IconButton, NumberField, Segmented, Sheet, TextField, toast } from "../../components/ui";
import { alive, db } from "../../db/db";
import type { Food, MealType } from "../../db/types";
import { logFood, MEALS, quickAdd, suggestMeal } from "../../lib/actions";
import { relativeDayLabel, today } from "../../lib/date";
import { fmt } from "../../lib/format";
import { useDebounced, useOnline, useSettings } from "../../lib/hooks";
import { goBack, navigate, useLocation } from "../../lib/router";
import { foodFromLog, recentFoodsFromLogs, searchLocal, SOURCE_LABELS } from "../../nutrition/foodSearch";
import { lookupBarcode, searchFDC, searchOFF } from "../../nutrition/onlineFoods";
import { VN_CATEGORIES, VN_FOODS } from "../../nutrition/vnFoods";

function FoodRow({ food, onClick, fav }: { food: Food; onClick: () => void; fav?: boolean }) {
  const def = food.servings[0];
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-surface-2">
      {food.imageUrl ? (
        <img src={food.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg bg-surface-2 object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-lg">{food.source === "recipe" ? "🍲" : food.source === "vn" ? "🍜" : "🥗"}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium">{food.name}</span>
          {fav && <Heart size={12} className="shrink-0 fill-fat text-fat" />}
        </div>
        <div className="truncate text-xs text-muted">
          {food.brand ? `${food.brand} · ` : ""}
          {def ? `${def.label}: ${fmt((food.per100.kcal * def.grams) / 100)} kcal` : `100${food.unit ?? "g"}: ${fmt(food.per100.kcal)} kcal`} · P {fmt(food.per100.protein, 1)}/100g
        </div>
      </div>
      <Badge className="hidden shrink-0 sm:inline-flex">{SOURCE_LABELS[food.source]}</Badge>
      <Plus size={18} className="shrink-0 text-accent-ink" />
    </button>
  );
}

function QuickAddSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string, kcal: number, p: number, c: number, f: number) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState<number | undefined>();
  const [p, setP] = useState<number | undefined>();
  const [c, setC] = useState<number | undefined>();
  const [f, setF] = useState<number | undefined>();
  const fromMacros = (p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nhập nhanh"
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={!kcal && !fromMacros}
          onClick={() => {
            onSave(name, kcal ?? fromMacros, p ?? 0, c ?? 0, f ?? 0);
            setName("");
            setKcal(undefined);
            setP(undefined);
            setC(undefined);
            setF(undefined);
          }}
        >
          Lưu
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField label="Tên (tuỳ chọn)" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Cơm nhà hàng" />
        <NumberField label="Calo" suffix="kcal" value={kcal} onChange={setKcal} placeholder={fromMacros ? `${fmt(fromMacros)} (từ macro)` : ""} />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Protein" suffix="g" value={p} onChange={setP} />
          <NumberField label="Carb" suffix="g" value={c} onChange={setC} />
          <NumberField label="Béo" suffix="g" value={f} onChange={setF} />
        </div>
      </div>
    </Sheet>
  );
}

type Tab = "recent" | "fav" | "mine" | "vn";

export default function AddFood() {
  const { query } = useLocation();
  const date = query.get("d") || today();
  const [meal, setMeal] = useState<MealType>((query.get("meal") as MealType) || suggestMeal());
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 450);
  const [tab, setTab] = useState<Tab>("recent");
  const [vnCat, setVnCat] = useState(VN_CATEGORIES[0]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [added, setAdded] = useState(0);
  const settings = useSettings();
  const online = useOnline();

  const myFoods = useLiveQuery(async () => alive(await db.foods.toArray()), []) ?? [];
  const recentLogs = useLiveQuery(async () => alive(await db.foodLogs.orderBy("createdAt").reverse().limit(300).toArray()), []) ?? [];
  const favIds = useMemo(() => new Set(myFoods.filter((f) => f.favorite).map((f) => f.id)), [myFoods]);

  const localResults = useMemo(() => (q.trim() ? searchLocal(q, myFoods) : []), [q, myFoods]);

  const [online1, setOnline1] = useState<{ q: string; foods: Food[]; loading: boolean; error?: string }>({ q: "", foods: [], loading: false });
  useEffect(() => {
    if (dq.length < 2 || !online) return;
    const useOff = settings.onlineSources.off;
    const useFdc = settings.onlineSources.fdc;
    if (!useOff && !useFdc) return;
    let cancelled = false;
    setOnline1({ q: dq, foods: [], loading: true });
    (async () => {
      const results = await Promise.allSettled([useOff ? searchOFF(dq) : Promise.resolve([]), useFdc ? searchFDC(dq, settings.fdcApiKey) : Promise.resolve([])]);
      if (cancelled) return;
      const foods: Food[] = [];
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") foods.push(...r.value);
        else errors.push(i === 0 ? "Open Food Facts" : "USDA");
      });
      setOnline1({ q: dq, foods, loading: false, error: errors.length ? `Không tải được: ${errors.join(", ")}` : undefined });
    })();
    return () => {
      cancelled = true;
    };
  }, [dq, online, settings.onlineSources.off, settings.onlineSources.fdc, settings.fdcApiKey]);

  const onDetected = useCallback(
    async (code: string) => {
      setScanOpen(false);
      const local = myFoods.find((f) => f.barcode === code);
      if (local) return setSelected(local);
      try {
        toast("Đang tra cứu mã " + code, "info");
        const f = await lookupBarcode(code);
        if (f) setSelected(f);
        else if (confirm(`Không tìm thấy sản phẩm ${code} trên Open Food Facts. Tạo món mới với mã này?`)) navigate(`/nutrition/food/new?barcode=${code}`);
      } catch {
        toast("Không có mạng để tra mã vạch", "error");
      }
    },
    [myFoods]
  );

  const recent = useMemo(() => recentFoodsFromLogs(recentLogs).map(foodFromLog), [recentLogs]);
  const favs = myFoods.filter((f) => f.favorite);
  const mine = myFoods.filter((f) => f.source === "custom" || f.source === "recipe");

  const listForTab: Food[] = tab === "recent" ? recent : tab === "fav" ? favs : tab === "mine" ? mine : VN_FOODS.filter((f) => f.category === vnCat);

  return (
    <div className="stagger space-y-3">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/nutrition")}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold">Thêm món — {relativeDayLabel(date)}</h1>
        </div>
        {added > 0 && (
          <Button size="sm" onClick={() => navigate(`/nutrition?d=${date}`)}>
            Xong ({added})
          </Button>
        )}
      </div>
      <Segmented size="sm" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.short }))} />
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          className="field pl-10"
          autoFocus
          placeholder="Tìm món: phở bò, ức gà, sữa tươi..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          enterKeyHint="search"
        />
      </div>
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        <Button size="sm" variant="secondary" className="shrink-0" icon={<Barcode size={16} />} onClick={() => setScanOpen(true)}>
          Quét mã vạch
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" icon={<Zap size={16} />} onClick={() => setQuickOpen(true)}>
          Nhập nhanh
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" icon={<PencilLine size={16} />} onClick={() => navigate("/nutrition/food/new")}>
          Tạo món
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" icon={<ChefHat size={16} />} onClick={() => navigate("/nutrition/recipe/new")}>
          Công thức
        </Button>
      </div>

      {q.trim() ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Món Việt & của tôi</div>
            {localResults.length ? (
              localResults.map((f) => <FoodRow key={f.id} food={f} fav={favIds.has(f.id)} onClick={() => setSelected(f)} />)
            ) : (
              <div className="py-2 text-sm text-muted">Không có kết quả ngoại tuyến.</div>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-muted uppercase">
              Trực tuyến (Open Food Facts, USDA)
              {online1.loading && <Loader2 size={14} className="animate-spin" />}
            </div>
            {!online ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted">
                <WifiOff size={16} /> Đang ngoại tuyến — chỉ tìm trong dữ liệu có sẵn.
              </div>
            ) : online1.q === dq && !online1.loading ? (
              <>
                {online1.error && <div className="py-1 text-xs text-danger">{online1.error}</div>}
                {online1.foods.length ? (
                  online1.foods.map((f) => <FoodRow key={f.id} food={f} fav={favIds.has(f.id)} onClick={() => setSelected(f)} />)
                ) : (
                  <div className="py-2 text-sm text-muted">Không có kết quả.</div>
                )}
              </>
            ) : dq.length < 2 ? (
              <div className="py-2 text-sm text-muted">Gõ ít nhất 2 ký tự…</div>
            ) : (
              <div className="py-2 text-sm text-muted">Đang tìm…</div>
            )}
          </div>
        </div>
      ) : (
        <>
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "recent", label: <span className="inline-flex items-center gap-1"><History size={13} /> Gần đây</span> },
              { value: "fav", label: <span className="inline-flex items-center gap-1"><Heart size={13} /> Yêu thích</span> },
              { value: "mine", label: "Của tôi" },
              { value: "vn", label: "Món Việt" },
            ]}
          />
          {tab === "vn" && (
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
              {VN_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setVnCat(c)} className={cx("shrink-0 rounded-full px-3 py-1 text-sm font-semibold", c === vnCat ? "bg-accent text-white dark:text-slate-950" : "bg-surface-2 text-muted")}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div>
            {listForTab.length ? (
              listForTab.map((f) => <FoodRow key={f.id} food={f} fav={favIds.has(f.id)} onClick={() => setSelected(f)} />)
            ) : (
              <div className="py-6 text-center text-sm text-muted">
                {tab === "recent" ? "Các món bạn đã ghi sẽ hiện ở đây." : tab === "fav" ? "Bấm ♥ khi xem một món để thêm vào yêu thích." : "Tạo món hoặc công thức riêng để dùng lại nhanh."}
              </div>
            )}
          </div>
        </>
      )}

      <FoodAmountSheet
        food={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        initial={{ meal }}
        favorite={selected ? favIds.has(selected.id) : undefined}
        onConfirm={async (c) => {
          if (!selected) return;
          await logFood({ food: selected, grams: c.grams, meal: c.meal, date, servingLabel: c.servingLabel, servingQty: c.servingQty });
          toast(`Đã thêm ${selected.name}`);
          setMeal(c.meal);
          setSelected(null);
          setAdded((n) => n + 1);
        }}
      />
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onDetected} />
      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSave={async (name, kcal, protein, carbs, fat) => {
          await quickAdd({ name, n: { kcal, protein, carbs, fat }, meal, date });
          toast("Đã thêm");
          setQuickOpen(false);
          setAdded((n) => n + 1);
        }}
      />
    </div>
  );
}

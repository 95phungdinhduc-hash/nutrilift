import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, IconButton, NumberField, Segmented, TextField, toast } from "../../components/ui";
import { db, put, remove } from "../../db/db";
import type { Food, Nutrients, Serving } from "../../db/types";
import { uid } from "../../lib/id";
import { fmt } from "../../lib/format";
import { goBack, useLocation } from "../../lib/router";
import { kcalFromMacros, scaleNutrients } from "../../nutrition/calc";

const EMPTY: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export default function FoodEditor({ id }: { id: string }) {
  const { query } = useLocation();
  const isNew = id === "new";
  const existing = useLiveQuery(async () => (isNew ? null : (await db.foods.get(id)) ?? null), [id]);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState(query.get("barcode") ?? "");
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [basis, setBasis] = useState<"100" | "serving">("100");
  const [servingGrams, setServingGrams] = useState<number | undefined>(100);
  const [n, setN] = useState<Nutrients>(EMPTY);
  const [servings, setServings] = useState<Serving[]>([]);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setBrand(existing.brand ?? "");
      setBarcode(existing.barcode ?? "");
      setUnit(existing.unit ?? "g");
      setN(existing.per100);
      setServings(existing.servings);
    }
  }, [existing]);

  const per100: Nutrients = basis === "100" || !servingGrams ? n : scaleNutrients(n, 10000 / servingGrams);
  const macroKcal = kcalFromMacros(n);
  const set = (k: keyof Nutrients) => (v: number | undefined) => setN({ ...n, [k]: v ?? (k === "kcal" || k === "protein" || k === "carbs" || k === "fat" ? 0 : undefined) });

  const save = async () => {
    if (!name.trim()) return toast("Hãy nhập tên món", "error");
    const allServings = [...servings.filter((s) => s.label && s.grams > 0)];
    if (basis === "serving" && servingGrams && !allServings.some((s) => s.grams === servingGrams)) allServings.unshift({ label: "1 khẩu phần", grams: servingGrams });
    const food: Food = {
      ...(existing ?? {}),
      id: existing?.id ?? uid("food"),
      updatedAt: 0,
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      source: "custom",
      unit,
      per100: { ...per100, kcal: per100.kcal || kcalFromMacros(per100) },
      servings: allServings,
    };
    await put("foods", food);
    toast("Đã lưu món");
    goBack("/nutrition/foods");
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/nutrition/foods")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-lg font-extrabold">{isNew ? "Tạo món mới" : "Sửa món"}</h1>
        {!isNew && existing && (
          <IconButton
            label="Xoá"
            onClick={async () => {
              if (!confirm("Xoá món này?")) return;
              await remove("foods", existing.id);
              goBack("/nutrition/foods");
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
      <Card className="space-y-3">
        <TextField label="Tên món" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Cơm gà nhà làm" autoFocus={isNew} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Thương hiệu" hint="tuỳ chọn" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <TextField label="Mã vạch" hint="tuỳ chọn" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-sm font-medium">Đơn vị</div>
            <Segmented size="sm" value={unit} onChange={setUnit} options={[{ value: "g", label: "Gam" }, { value: "ml", label: "ml" }]} />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Nhập giá trị cho</div>
            <Segmented size="sm" value={basis} onChange={setBasis} options={[{ value: "100", label: `100${unit}` }, { value: "serving", label: "1 khẩu phần" }]} />
          </div>
        </div>
        {basis === "serving" && <NumberField label="Khối lượng 1 khẩu phần" suffix={unit} value={servingGrams} onChange={setServingGrams} />}
      </Card>
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Dinh dưỡng trên {basis === "100" ? `100${unit}` : `1 khẩu phần (${fmt(servingGrams)}${unit})`}</div>
        <NumberField label="Calo" suffix="kcal" value={n.kcal || undefined} onChange={set("kcal")} hint={macroKcal ? `từ macro ≈ ${fmt(macroKcal)} kcal` : undefined} />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Protein" suffix="g" value={n.protein || undefined} onChange={set("protein")} />
          <NumberField label="Carb" suffix="g" value={n.carbs || undefined} onChange={set("carbs")} />
          <NumberField label="Béo" suffix="g" value={n.fat || undefined} onChange={set("fat")} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="Chất xơ" suffix="g" value={n.fiber} onChange={set("fiber")} />
          <NumberField label="Đường" suffix="g" value={n.sugar} onChange={set("sugar")} />
          <NumberField label="Béo bão hoà" suffix="g" value={n.satFat} onChange={set("satFat")} />
          <NumberField label="Natri" suffix="mg" value={n.sodiumMg} onChange={set("sodiumMg")} />
        </div>
      </Card>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Khẩu phần thường dùng</div>
          <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => setServings([...servings, { label: "", grams: 0 }])}>
            Thêm
          </Button>
        </div>
        {servings.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <TextField className="flex-1" placeholder="VD: 1 hộp" value={s.label} onChange={(e) => setServings(servings.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <NumberField className="w-28" suffix={unit} value={s.grams || undefined} onChange={(v) => setServings(servings.map((x, j) => (j === i ? { ...x, grams: v ?? 0 } : x)))} />
            <IconButton label="Xoá khẩu phần" onClick={() => setServings(servings.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
        {!servings.length && <div className="text-sm text-muted">Chưa có — có thể nhập theo gam khi ghi món.</div>}
      </Card>
      <Button size="lg" className="w-full" onClick={save}>
        Lưu món
      </Button>
    </div>
  );
}

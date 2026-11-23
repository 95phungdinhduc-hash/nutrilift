import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FoodPicker } from "../../components/FoodPicker";
import { Button, Card, IconButton, NumberField, TextField, toast } from "../../components/ui";
import { db, put, remove } from "../../db/db";
import type { Food, RecipeItem } from "../../db/types";
import { uid } from "../../lib/id";
import { fmt } from "../../lib/format";
import { goBack } from "../../lib/router";
import { scaleNutrients, sumNutrients } from "../../nutrition/calc";
import { recipePer100 } from "../../nutrition/foodSearch";

export default function RecipeEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const existing = useLiveQuery(async () => (isNew ? null : (await db.foods.get(id)) ?? null), [id]);
  const [name, setName] = useState("");
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [portions, setPortions] = useState<number | undefined>(1);
  const [cooked, setCooked] = useState<number | undefined>();
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (existing?.recipe) {
      setName(existing.name);
      setItems(existing.recipe.items);
      setPortions(existing.recipe.portions);
      const raw = existing.recipe.items.reduce((a, i) => a + i.grams, 0);
      setCooked(existing.recipe.totalGrams !== raw ? existing.recipe.totalGrams : undefined);
    }
  }, [existing]);

  const rawGrams = items.reduce((a, i) => a + i.grams, 0);
  const totalGrams = cooked || rawGrams;
  const total = sumNutrients(items.map((i) => scaleNutrients(i.per100, i.grams)));
  const p = Math.max(1, portions ?? 1);

  const save = async () => {
    if (!name.trim() || !items.length) return toast("Cần tên công thức và ít nhất 1 nguyên liệu", "error");
    const food: Food = {
      ...(existing ?? {}),
      id: existing?.id ?? uid("recipe"),
      updatedAt: 0,
      name: name.trim(),
      source: "recipe",
      unit: "g",
      per100: recipePer100(items, totalGrams),
      servings: [{ label: "1 phần", grams: Math.round(totalGrams / p) }],
      recipe: { items, totalGrams, portions: p },
    };
    await put("foods", food);
    toast("Đã lưu công thức");
    goBack("/nutrition/foods");
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/nutrition/foods")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-lg font-extrabold">{isNew ? "Công thức mới" : "Sửa công thức"}</h1>
        {!isNew && existing && (
          <IconButton
            label="Xoá"
            onClick={async () => {
              if (!confirm("Xoá công thức này?")) return;
              await remove("foods", existing.id);
              goBack("/nutrition/foods");
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
      <Card className="space-y-3">
        <TextField label="Tên công thức" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Cơm ức gà meal-prep" />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Số phần" value={portions} onChange={setPortions} min={1} stepper />
          <NumberField label="Khối lượng sau nấu" hint="tuỳ chọn" suffix="g" value={cooked} onChange={setCooked} placeholder={fmt(rawGrams)} />
        </div>
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Nguyên liệu ({items.length})</div>
          <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => setPicker(true)}>
            Thêm
          </Button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px]">{it.name}</div>
              <div className="text-xs text-muted">{fmt(scaleNutrients(it.per100, it.grams).kcal)} kcal</div>
            </div>
            <NumberField className="w-24" suffix="g" value={it.grams} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, grams: v ?? 0 } : x)))} />
            <IconButton label="Xoá" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
        {!items.length && <div className="py-2 text-sm text-muted">Thêm nguyên liệu từ món Việt, món của bạn hoặc tìm trực tuyến.</div>}
      </Card>
      {items.length > 0 && (
        <Card className="bg-surface-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted">Tổng ({fmt(totalGrams)} g)</div>
              <div className="tabular text-xl font-extrabold">{fmt(total.kcal)} kcal</div>
              <div className="tabular text-xs text-muted">
                P {fmt(total.protein)} · C {fmt(total.carbs)} · F {fmt(total.fat)}
              </div>
            </div>
            <div>
              <div className="text-muted">
                Mỗi phần ({fmt(totalGrams / p)} g)
              </div>
              <div className="tabular text-xl font-extrabold text-accent-ink">{fmt(total.kcal / p)} kcal</div>
              <div className="tabular text-xs text-muted">
                P {fmt(total.protein / p)} · C {fmt(total.carbs / p)} · F {fmt(total.fat / p)}
              </div>
            </div>
          </div>
        </Card>
      )}
      <Button size="lg" className="w-full" onClick={save}>
        Lưu công thức
      </Button>
      <FoodPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(food, grams) => {
          setItems([...items, { name: food.name, grams, per100: food.per100, foodId: food.id }]);
          setPicker(false);
        }}
      />
    </div>
  );
}

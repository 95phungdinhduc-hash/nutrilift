import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ChefHat, Heart, PencilLine } from "lucide-react";
import { useState } from "react";
import { Button, Card, Empty, IconButton, ListRow, Segmented } from "../../components/ui";
import { alive, db } from "../../db/db";
import { toggleFavorite } from "../../lib/actions";
import { fmt } from "../../lib/format";
import { goBack, navigate } from "../../lib/router";
import { SOURCE_LABELS } from "../../nutrition/foodSearch";

export default function MyFoods() {
  const foods = useLiveQuery(async () => alive(await db.foods.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) ?? [];
  const [tab, setTab] = useState<"mine" | "recipe" | "fav" | "saved">("mine");
  const list = foods.filter((f) =>
    tab === "mine" ? f.source === "custom" : tab === "recipe" ? f.source === "recipe" : tab === "fav" ? f.favorite : f.source === "off" || f.source === "fdc"
  );
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/nutrition")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-lg font-extrabold">Món của tôi</h1>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" variant="secondary" icon={<PencilLine size={18} />} onClick={() => navigate("/nutrition/food/new")}>
          Tạo món
        </Button>
        <Button className="flex-1" variant="secondary" icon={<ChefHat size={18} />} onClick={() => navigate("/nutrition/recipe/new")}>
          Tạo công thức
        </Button>
      </div>
      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: "mine", label: "Món tự tạo" },
          { value: "recipe", label: "Công thức" },
          { value: "fav", label: "Yêu thích" },
          { value: "saved", label: "Đã lưu" },
        ]}
      />
      <Card>
        {list.length === 0 ? (
          <Empty title="Chưa có gì ở đây" desc={tab === "saved" ? "Món từ Open Food Facts/USDA sẽ tự lưu khi bạn ghi vào nhật ký." : "Tạo món hoặc công thức để dùng lại nhanh."} />
        ) : (
          list.map((f) => (
            <ListRow
              key={f.id}
              title={f.name}
              subtitle={`${SOURCE_LABELS[f.source]}${f.brand ? " · " + f.brand : ""} · ${fmt(f.per100.kcal)} kcal/100${f.unit ?? "g"}${f.recipe ? ` · ${f.recipe.portions} phần` : ""}`}
              onClick={() => (f.source === "custom" ? navigate(`/nutrition/food/${f.id}`) : f.source === "recipe" ? navigate(`/nutrition/recipe/${f.id}`) : undefined)}
              right={
                <IconButton
                  label="Yêu thích"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(f);
                  }}
                >
                  <Heart size={18} className={f.favorite ? "fill-fat text-fat" : ""} />
                </IconButton>
              }
            />
          ))
        )}
      </Card>
    </div>
  );
}

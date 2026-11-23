import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { LineChart } from "../../components/charts";
import { CustomExerciseForm, ExerciseList, MuscleChips } from "../../components/ExercisePicker";
import { Badge, Button, Card, Empty, IconButton, SectionTitle, Segmented, Sheet, Stat } from "../../components/ui";
import { alive, db, remove } from "../../db/db";
import type { MuscleGroup } from "../../db/types";
import { formatDate } from "../../lib/date";
import { fmt } from "../../lib/format";
import { useWorkouts } from "../../lib/hooks";
import { goBack, navigate } from "../../lib/router";
import { EQUIPMENT_LABELS, findExercise, MUSCLE_LABELS } from "../../training/exercises";
import { exerciseHistory } from "../../training/stats";

export default function Exercises() {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | undefined>();
  const [creating, setCreating] = useState(false);
  const custom = useLiveQuery(async () => alive(await db.exercises.toArray()), []) ?? [];
  return (
    <div className="stagger mx-auto max-w-2xl space-y-3">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-xl font-extrabold">Thư viện bài tập</h1>
        <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          Tạo bài
        </Button>
      </div>
      <input className="field" placeholder="Tìm bài tập (tiếng Anh hoặc tiếng Việt)..." value={q} onChange={(e) => setQ(e.target.value)} />
      <MuscleChips value={muscle} onChange={setMuscle} />
      <Card className="py-2">
        <ExerciseList query={q} muscle={muscle} custom={custom} limit={300} onPick={(d) => navigate(`/training/exercise/${d.id}`)} />
      </Card>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Bài tập mới">
        <CustomExerciseForm initialName={q} onCreated={(c) => (setCreating(false), navigate(`/training/exercise/${c.id}`))} />
      </Sheet>
    </div>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const custom = useLiveQuery(async () => alive(await db.exercises.toArray()), []) ?? [];
  const def = findExercise(id, custom);
  const workouts = useWorkouts();
  const hist = useMemo(() => exerciseHistory(workouts, id), [workouts, id]);
  const [metric, setMetric] = useState<"e1rm" | "max" | "volume">("e1rm");
  const name = def?.name ?? workouts.flatMap((w) => w.exercises).find((e) => e.exerciseId === id)?.name ?? id;
  const best = hist.length ? hist.reduce((a, b) => (b.e1rm > a.e1rm ? b : a)) : undefined;
  const maxW = hist.length ? Math.max(...hist.map((h) => h.maxWeight)) : undefined;
  return (
    <div className="stagger mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training/exercises")}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{name}</h1>
          {def?.nameVi && <div className="text-sm text-muted">{def.nameVi}</div>}
        </div>
        {def?.custom && (
          <IconButton
            label="Xoá bài tự tạo"
            onClick={async () => {
              if (!confirm("Xoá bài tập tự tạo này? Lịch sử vẫn giữ.")) return;
              await remove("exercises", id);
              goBack("/training/exercises");
            }}
          >
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
      {def && (
        <Card className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-muted">Cơ chính:</span>
            {def.target.map((m) => (
              <Badge key={m} color="train">
                {MUSCLE_LABELS[m]}
              </Badge>
            ))}
          </div>
          {def.synergist.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-muted">Cơ phụ:</span>
              {def.synergist.map((m) => (
                <Badge key={m}>{MUSCLE_LABELS[m]}</Badge>
              ))}
            </div>
          )}
          <div className="text-muted">Dụng cụ: {def.equipments.map((e) => EQUIPMENT_LABELS[e]).join(", ")}</div>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="1RM ước tính tốt nhất" value={best ? `${fmt(best.e1rm, 1)}` : "–"} sub={best ? `${best.bestSet.weight}kg × ${best.bestSet.reps}` : "kg"} />
        <Stat label="Tạ nặng nhất" value={maxW ? fmt(maxW, 1) : "–"} sub="kg" />
        <Stat label="Số buổi" value={hist.length} />
      </div>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionTitle className="mb-0">Tiến bộ</SectionTitle>
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "e1rm", label: "1RM ước tính" },
              { value: "max", label: "Tạ max" },
              { value: "volume", label: "Khối lượng" },
            ]}
          />
        </div>
        <LineChart
          unit=" kg"
          series={[
            {
              name: metric === "e1rm" ? "1RM ước tính" : metric === "max" ? "Tạ nặng nhất" : "Khối lượng",
              color: "var(--train)",
              style: "both",
              points: hist.map((h) => ({ x: h.date, y: metric === "e1rm" ? h.e1rm : metric === "max" ? h.maxWeight : h.volume })),
            },
          ]}
          emptyText="Chưa có lịch sử cho bài này"
        />
      </Card>
      <Card>
        <SectionTitle>Các buổi gần đây</SectionTitle>
        {hist.length === 0 ? (
          <Empty title="Chưa tập bài này" />
        ) : (
          [...hist]
            .reverse()
            .slice(0, 15)
            .map((h) => (
              <button key={h.workoutId} onClick={() => navigate(`/training/history/${h.workoutId}`)} className="flex w-full justify-between rounded-lg px-1 py-1.5 text-sm hover:bg-surface-2">
                <span>{formatDate(h.date, { weekday: true })}</span>
                <span className="tabular text-muted">
                  {h.sets} set · tốt nhất {h.bestSet.weight}kg×{h.bestSet.reps} · e1RM {fmt(h.e1rm, 1)}
                </span>
              </button>
            ))
        )}
      </Card>
    </div>
  );
}

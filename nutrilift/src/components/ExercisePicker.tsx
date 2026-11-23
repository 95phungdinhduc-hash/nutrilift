import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { alive, db, put } from "../db/db";
import type { CustomExercise, Equipment, MuscleGroup } from "../db/types";
import { uid } from "../lib/id";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, MUSCLE_ORDER, searchExercises, type ExerciseDef } from "../training/exercises";
import { Button, cx, Select, Sheet, TextField } from "./ui";

export function ExerciseList({
  onPick,
  query,
  muscle,
  custom,
  limit = 80,
}: {
  onPick: (def: ExerciseDef) => void;
  query: string;
  muscle?: MuscleGroup;
  custom: CustomExercise[];
  limit?: number;
}) {
  const list = useMemo(() => searchExercises(query, { custom, muscle }).slice(0, limit), [query, custom, muscle, limit]);
  return (
    <div>
      {list.map((e) => (
        <button key={e.id} onClick={() => onPick(e)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-train-soft text-xs font-bold text-train">{e.name.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium">
              {e.name}
              {e.custom && <span className="ml-1 text-xs text-muted">(tự tạo)</span>}
            </div>
            <div className="truncate text-xs text-muted">
              {e.nameVi ? `${e.nameVi} · ` : ""}
              {e.target.map((m) => MUSCLE_LABELS[m]).join(", ") || "—"} · {EQUIPMENT_LABELS[e.equipment]}
            </div>
          </div>
        </button>
      ))}
      {!list.length && <div className="py-4 text-center text-sm text-muted">Không tìm thấy bài tập</div>}
    </div>
  );
}

export function MuscleChips({ value, onChange }: { value?: MuscleGroup; onChange: (m?: MuscleGroup) => void }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <button onClick={() => onChange(undefined)} className={cx("shrink-0 rounded-full px-3 py-1 text-sm font-semibold", !value ? "bg-train text-white dark:text-slate-950" : "bg-surface-2 text-muted")}>
        Tất cả
      </button>
      {MUSCLE_ORDER.map((m) => (
        <button key={m} onClick={() => onChange(m)} className={cx("shrink-0 rounded-full px-3 py-1 text-sm font-semibold", value === m ? "bg-train text-white dark:text-slate-950" : "bg-surface-2 text-muted")}>
          {MUSCLE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

export function CustomExerciseForm({ onCreated, initialName = "" }: { onCreated: (c: CustomExercise) => void; initialName?: string }) {
  const [name, setName] = useState(initialName);
  const [equipment, setEquipment] = useState<Equipment>("dumbbell");
  const [target, setTarget] = useState<MuscleGroup>("chest");
  return (
    <div className="space-y-3">
      <TextField label="Tên bài tập" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Máy ép ngực Hammer" />
      <div className="grid grid-cols-2 gap-2">
        <Select label="Dụng cụ" value={equipment} onChange={setEquipment} options={Object.entries(EQUIPMENT_LABELS).map(([value, label]) => ({ value: value as Equipment, label }))} />
        <Select label="Nhóm cơ chính" value={target} onChange={setTarget} options={MUSCLE_ORDER.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))} />
      </div>
      <Button
        className="w-full"
        disabled={!name.trim()}
        onClick={async () => {
          const c = await put<CustomExercise>("exercises", { id: uid("ex"), updatedAt: 0, name: name.trim(), equipment, target: [target], synergist: [] });
          onCreated(c);
        }}
      >
        Tạo bài tập
      </Button>
    </div>
  );
}

/** Chọn bài tập + dụng cụ. */
export function ExercisePicker({ open, onClose, onPick, title = "Chọn bài tập" }: { open: boolean; onClose: () => void; onPick: (def: ExerciseDef, equipment: Equipment) => void; title?: string }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | undefined>();
  const [def, setDef] = useState<ExerciseDef | null>(null);
  const [creating, setCreating] = useState(false);
  const custom = useLiveQuery(async () => alive(await db.exercises.toArray()), []) ?? [];
  const close = () => {
    setDef(null);
    setCreating(false);
    setQ("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={def ? def.name : creating ? "Bài tập mới" : title} wide>
      {creating ? (
        <CustomExerciseForm
          initialName={q}
          onCreated={(c) => {
            onPick({ id: c.id, name: c.name, nameVi: "", equipment: c.equipment, equipments: [c.equipment], target: c.target, synergist: [], warmup: 10, startKg: 0, custom: true }, c.equipment);
            close();
          }}
        />
      ) : def ? (
        <div className="space-y-2 pb-2">
          <div className="text-sm text-muted">Chọn dụng cụ:</div>
          {def.equipments.map((eq) => (
            <Button
              key={eq}
              variant={eq === def.equipment ? "primary" : "secondary"}
              className="w-full justify-start"
              onClick={() => {
                onPick(def, eq);
                close();
              }}
            >
              {EQUIPMENT_LABELS[eq]} {eq === def.equipment && "(mặc định)"}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setDef(null)}>
            ← Chọn bài khác
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className="field" autoFocus placeholder="Tìm bài: squat, đẩy ngực, kéo xô..." value={q} onChange={(e) => setQ(e.target.value)} />
          <MuscleChips value={muscle} onChange={setMuscle} />
          <div className="max-h-[50dvh] overflow-y-auto">
            <ExerciseList
              query={q}
              muscle={muscle}
              custom={custom}
              onPick={(d) => {
                if (d.equipments.length <= 1) {
                  onPick(d, d.equipment);
                  close();
                } else setDef(d);
              }}
            />
          </div>
          <Button variant="outline" className="w-full" icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Tạo bài tập riêng{q ? ` "${q}"` : ""}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

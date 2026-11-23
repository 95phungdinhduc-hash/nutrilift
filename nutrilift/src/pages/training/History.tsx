import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Pencil, Repeat, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, cx, Empty, IconButton, ListRow, NumberField, SectionTitle, Stat, toast } from "../../components/ui";
import { db, put, remove, setKV } from "../../db/db";
import type { Workout } from "../../db/types";
import { formatDate, formatDuration, formatTime, today } from "../../lib/date";
import { uid } from "../../lib/id";
import { fmt } from "../../lib/format";
import { useActiveWorkout, useWorkouts } from "../../lib/hooks";
import { goBack, navigate } from "../../lib/router";
import { detectPRs } from "../../training/stats";
import { e1rm, workoutSetCount, workoutVolume, workSets } from "../../training/workout";

export default function History() {
  const workouts = useWorkouts().filter((w) => w.endedAt);
  const groups = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of workouts) {
      const k = w.date.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), w]);
    }
    return [...m.entries()];
  }, [workouts]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-xl font-extrabold">Lịch sử tập</h1>
        <span className="text-sm text-muted">{workouts.length} buổi</span>
      </div>
      {!workouts.length && <Empty title="Chưa có buổi tập nào" desc="Hoàn thành buổi tập đầu tiên để xem lịch sử." />}
      {groups.map(([month, list]) => (
        <section key={month}>
          <SectionTitle>
            Tháng {Number(month.slice(5))}/{month.slice(0, 4)} · {list.length} buổi
          </SectionTitle>
          <Card className="py-1">
            {list.map((w) => {
              const c = workoutSetCount(w);
              return (
                <ListRow
                  key={w.id}
                  title={w.dayName ?? "Buổi tập"}
                  subtitle={`${formatDate(w.date, { weekday: true })} · ${formatDuration(((w.endedAt ?? w.startedAt) - w.startedAt) / 1000)} · ${c.done} set · ${w.exercises.length} bài`}
                  right={<span className="tabular text-sm font-semibold">{fmt(workoutVolume(w))} kg</span>}
                  onClick={() => navigate(`/training/history/${w.id}`)}
                />
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}

export function WorkoutDetail({ id }: { id: string }) {
  const w = useLiveQuery(async () => (await db.workouts.get(id)) ?? null, [id]);
  const all = useWorkouts();
  const active = useActiveWorkout();
  const [edit, setEdit] = useState<Workout | null>(null);
  const prs = useMemo(() => (w ? detectPRs(w, all) : []), [w, all]);
  if (w === undefined) return null;
  if (!w || w.deleted) return <div className="py-10 text-center text-muted">Không tìm thấy buổi tập.</div>;
  const view = edit ?? w;
  const c = workoutSetCount(view);

  const repeat = async () => {
    if (active && !confirm("Đang có buổi tập dở. Thay thế bằng buổi này?")) return;
    const nw: Workout = {
      ...w,
      id: uid("wo"),
      date: today(),
      startedAt: Date.now(),
      endedAt: undefined,
      progressSummary: undefined,
      kcal: undefined,
      programId: undefined,
      exercises: w.exercises.map((ex) => ({
        ...ex,
        uid: uid("we"),
        key: ex.key + "~repeat",
        sets: ex.sets.map((s) => ({ ...s, weight: s.doneWeight ?? s.weight, reps: s.doneReps ?? s.reps, done: false, doneReps: undefined, doneWeight: undefined, doneRpe: undefined })),
      })),
    };
    await setKV("activeWorkout", nw);
    navigate("/training/workout");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training/history")}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{w.dayName}</h1>
          <div className="text-xs text-muted">
            {formatDate(w.date, { weekday: true, year: true })} · {formatTime(w.startedAt)}
            {w.programName ? ` · ${w.programName}` : ""}
          </div>
        </div>
        {edit ? (
          <Button
            size="sm"
            icon={<Check size={16} />}
            onClick={async () => {
              await put("workouts", edit);
              setEdit(null);
              toast("Đã lưu thay đổi");
            }}
          >
            Lưu
          </Button>
        ) : (
          <IconButton label="Sửa" onClick={() => setEdit(structuredClone(w))}>
            <Pencil size={18} />
          </IconButton>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Thời gian" value={formatDuration(((w.endedAt ?? w.startedAt) - w.startedAt) / 1000)} />
        <Stat label="Set hoàn thành" value={`${c.done}/${c.total}`} />
        <Stat label="Khối lượng" value={`${fmt(workoutVolume(view))} kg`} />
        <Stat label="Calo ước tính" value={w.kcal ? `${w.kcal} kcal` : "–"} />
      </div>
      {prs.length > 0 && (
        <Card className="border-carbs/50">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <Trophy size={18} className="text-carbs" /> Kỷ lục trong buổi
          </div>
          {prs.map((p) => (
            <div key={p.exerciseId} className="text-sm">
              <b>{p.name}</b>: {p.detail}
            </div>
          ))}
        </Card>
      )}
      {w.progressSummary && w.progressSummary.length > 0 && (
        <Card>
          <SectionTitle>Tiến độ áp dụng</SectionTitle>
          <ul className="space-y-1 text-sm">
            {w.progressSummary.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </Card>
      )}
      {view.exercises.map((ex, ei) => (
        <Card key={ex.uid}>
          <button className="mb-2 text-left font-bold hover:underline" onClick={() => navigate(`/training/exercise/${ex.exerciseId}`)}>
            {ex.name}
          </button>
          <div className="space-y-1">
            {ex.sets.map((s, si) => {
              const wt = s.doneWeight ?? s.weight;
              const r = s.doneReps ?? s.reps;
              if (edit) {
                return (
                  <div key={si} className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2">
                    <span className="text-center text-xs text-muted">{s.warmup ? "K" : si + 1}</span>
                    <NumberField value={wt} suffix="kg" onChange={(v) => setEdit(updSet(edit, ei, si, { doneWeight: v ?? 0 }))} />
                    <NumberField value={r} suffix="rep" onChange={(v) => setEdit(updSet(edit, ei, si, { doneReps: v ?? 0 }))} />
                    <button
                      onClick={() => setEdit(updSet(edit, ei, si, { done: !s.done }))}
                      className={cx("flex h-10 items-center justify-center rounded-xl", s.done ? "bg-accent text-white dark:text-slate-950" : "bg-surface-2 text-muted")}
                    >
                      <Check size={18} />
                    </button>
                  </div>
                );
              }
              return (
                <div key={si} className={cx("flex items-center justify-between rounded-lg px-2 py-1 text-sm", !s.done && "text-muted line-through", s.warmup && "text-muted")}>
                  <span className="w-10">{s.warmup ? "K" : ""}</span>
                  <span className="tabular flex-1">
                    {fmt(wt, 2)} kg × {r}
                    {s.doneRpe ? ` @${s.doneRpe}` : ""}
                  </span>
                  {!s.warmup && s.done && <span className="tabular text-xs text-muted">e1RM {fmt(e1rm(wt, r, s.doneRpe), 1)}</span>}
                </div>
              );
            })}
          </div>
          {ex.notes && <div className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">{ex.notes}</div>}
          <div className="mt-1 text-right text-xs text-muted">{fmt(workSets(ex).reduce((a, s) => a + (s.done ? (s.doneWeight ?? s.weight) * (s.doneReps ?? s.reps) : 0), 0))} kg</div>
        </Card>
      ))}
      {w.notes && <Card className="text-sm">{w.notes}</Card>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" icon={<Repeat size={18} />} onClick={repeat}>
          Tập lại buổi này
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={18} />}
          onClick={async () => {
            if (!confirm("Xoá buổi tập này khỏi lịch sử?")) return;
            await remove("workouts", w.id);
            navigate("/training/history", { replace: true });
          }}
        >
          Xoá
        </Button>
      </div>
    </div>
  );
}

function updSet(w: Workout, ei: number, si: number, patch: Partial<Workout["exercises"][number]["sets"][number]>): Workout {
  return {
    ...w,
    exercises: w.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })),
  };
}

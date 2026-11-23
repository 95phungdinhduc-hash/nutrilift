import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, Info, MoreVertical, Plus, Repeat, StickyNote, Trash2, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { confetti } from "../../lib/confetti";
import { ExercisePicker } from "../../components/ExercisePicker";
import { Badge, Button, Card, cx, IconButton, NumberField, Sheet, Toggle, toast } from "../../components/ui";
import type { Workout, WorkoutExercise, WorkoutSet } from "../../db/types";
import { discardActiveWorkout, finishWorkout, saveActiveWorkout, startEmptyWorkout, type FinishResult } from "../../lib/actions";
import { formatDate, formatDuration } from "../../lib/date";
import { fmt } from "../../lib/format";
import { useActiveWorkout, useGoals, useNow, usePrograms, useSettings, useWakeLock, useWorkouts } from "../../lib/hooks";
import { navigate } from "../../lib/router";
import { EQUIPMENT_LABELS, findExercise } from "../../training/exercises";
import { parseProgram, setsSummary, shortProgression } from "../../training/liftoscript";
import { startRest, stopRest } from "../../training/restTimer";
import { lastSetsFor } from "../../training/stats";
import { barWeight, newWorkoutExercise, platesFor, usesPlates, workoutSetCount, workoutVolume } from "../../training/workout";

function PlateHint({ weight, ex }: { weight: number; ex: WorkoutExercise }) {
  const settings = useSettings();
  if (!usesPlates(ex.equipment) || weight <= 0) return null;
  const bar = barWeight(ex.equipment, settings);
  const r = platesFor(weight, bar, settings.plates);
  return (
    <div className="text-[11px] text-muted">
      Đòn {bar}kg + mỗi bên: {r.perSide.length ? r.perSide.join(" · ") : "không bánh"}
      {Math.abs(r.achieved - weight) > 0.01 && <span className="text-danger"> (≈{r.achieved}kg)</span>}
    </div>
  );
}

function SetRow({
  s,
  index,
  workIndex,
  ex,
  onChange,
  onToggle,
  onRemove,
}: {
  s: WorkoutSet;
  index: number;
  workIndex: number;
  ex: WorkoutExercise;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const bodyweight = ex.equipment === "bodyweight";
  const weight = s.doneWeight ?? s.weight;
  const reps = s.doneReps ?? s.reps;
  const hitTarget = s.done && reps >= s.reps && weight >= s.weight - 0.01;
  return (
    <div className={cx("grid grid-cols-[2.25rem_1fr_1fr_3rem] items-center gap-2 rounded-xl px-1 py-1", s.done && (hitTarget ? "bg-accent-soft/70" : "bg-carbs/15"))}>
      <button
        title="Nhấn giữ (hoặc nhấp đúp) để xoá set"
        onContextMenu={(e) => {
          e.preventDefault();
          if (confirm("Xoá set này?")) onRemove();
        }}
        onDoubleClick={() => confirm("Xoá set này?") && onRemove()}
        className={cx("flex h-9 items-center justify-center rounded-lg text-xs font-bold", s.warmup ? "text-muted" : "text-ink")}
      >
        {s.warmup ? `K${index + 1}` : workIndex + 1}
      </button>
      <div className="relative">
        <NumberField
          value={weight}
          onChange={(v) => onChange({ doneWeight: v ?? 0 })}
          inputClassName={cx("h-10 text-center font-semibold", s.done && "border-transparent bg-transparent")}
          suffix={bodyweight ? "+kg" : "kg"}
        />
      </div>
      <div className="relative">
        <NumberField
          value={reps}
          onChange={(v) => onChange({ doneReps: v ?? 0 })}
          inputClassName={cx("h-10 text-center font-semibold", s.done && "border-transparent bg-transparent")}
          suffix={s.amrap ? "+" : s.minReps ? `/${s.reps}` : "rep"}
        />
      </div>
      <motion.button
        onClick={onToggle}
        aria-label={s.done ? "Bỏ hoàn thành" : "Hoàn thành set"}
        whileTap={{ scale: 0.86 }}
        animate={s.done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className={cx(
          "relative flex h-10 w-12 items-center justify-center rounded-xl transition-colors duration-300",
          s.done
            ? hitTarget
              ? "bg-gradient-accent text-white shadow-[0_6px_16px_-6px_var(--accent)] dark:text-slate-950"
              : "bg-carbs text-white shadow-[0_6px_16px_-6px_var(--carbs)]"
            : "bg-surface-2 text-muted ring-1 ring-line ring-inset hover:bg-surface-3"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={s.done ? "on" : "off"}
            initial={{ scale: 0.3, rotate: -30, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
          >
            <Check size={22} strokeWidth={3} />
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {(s.rpe != null || s.label) && (
        <div className="col-span-4 -mt-1 flex items-center gap-2 pl-11 text-[11px] text-muted">
          {s.label && <span>{s.label}</span>}
          {s.rpe != null && (
            <label className="flex items-center gap-1">
              RPE mục tiêu {s.rpe} · thực tế
              <select className="rounded bg-surface-2 px-1 py-0.5" value={s.doneRpe ?? ""} onChange={(e) => onChange({ doneRpe: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">–</option>
                {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  ex,
  idx,
  total,
  workout,
  onUpdate,
  onRemove,
  onMove,
  onSwap,
  progressLabel,
}: {
  ex: WorkoutExercise;
  idx: number;
  total: number;
  workout: Workout;
  onUpdate: (ex: WorkoutExercise) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onSwap: () => void;
  progressLabel?: string;
}) {
  const settings = useSettings();
  const history = useWorkouts();
  const [menu, setMenu] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!!ex.notes);
  const last = useMemo(() => lastSetsFor(history.filter((h) => h.id !== workout.id), ex.exerciseId), [history, ex.exerciseId, workout.id]);
  const def = findExercise(ex.exerciseId);
  const workSets = ex.sets.filter((s) => !s.warmup);
  const nextSet = ex.sets.find((s) => !s.done);
  const allDone = ex.sets.length > 0 && ex.sets.every((s) => s.done);

  const setSet = (i: number, patch: Partial<WorkoutSet>) => {
    const sets = ex.sets.map((s) => ({ ...s }));
    const before = sets[i].doneWeight ?? sets[i].weight;
    sets[i] = { ...sets[i], ...patch };
    // Đổi mức tạ một set → áp dụng cho các set chính phía sau chưa làm có cùng mức tạ
    if (patch.doneWeight != null && !sets[i].warmup) {
      for (let j = i + 1; j < sets.length; j++) {
        if (!sets[j].warmup && !sets[j].done && (sets[j].doneWeight ?? sets[j].weight) === before) sets[j].doneWeight = patch.doneWeight;
      }
    }
    onUpdate({ ...ex, sets });
  };

  const toggle = (i: number) => {
    const s = ex.sets[i];
    if (s.done) return setSet(i, { done: false });
    setSet(i, { done: true, doneReps: s.doneReps ?? s.reps, doneWeight: s.doneWeight ?? s.weight });
    const remaining = ex.sets.filter((x, j) => j !== i && !x.done).length;
    if (!s.warmup && (remaining > 0 || idx < total - 1)) startRest(ex.restSec ?? settings.restTimerSec, ex.name);
    else if (s.warmup) startRest(Math.min(60, ex.restSec ?? settings.restTimerSec), ex.name);
    else stopRest();
    navigator.vibrate?.(30);
  };

  return (
    <Card className={cx("p-3 sm:p-4", allDone && "border-accent/40")}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button className="text-left" onClick={() => navigate(`/training/exercise/${ex.exerciseId}`)}>
            <div className="text-[17px] leading-tight font-bold">
              {ex.name}
              {def && def.equipment !== ex.equipment && <span className="text-muted">, {EQUIPMENT_LABELS[ex.equipment]}</span>}
            </div>
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {def?.nameVi && <span>{def.nameVi}</span>}
            <span>{setsSummary(workSets)}</span>
            {ex.restSec && <span>nghỉ {formatDuration(ex.restSec)}</span>}
            {progressLabel && <Badge color="train">{progressLabel}</Badge>}
          </div>
          {last && (
            <div className="mt-0.5 text-xs text-muted">
              Lần trước ({formatDate(last.date)}): {last.sets.filter((s) => !s.warmup).map((s) => `${fmt(s.doneWeight ?? s.weight, 2)}×${s.doneReps ?? s.reps}`).join(", ")}
            </div>
          )}
        </div>
        {ex.description && (
          <IconButton label="Mô tả" onClick={() => setShowDesc(!showDesc)}>
            <Info size={18} />
          </IconButton>
        )}
        <IconButton label="Tuỳ chọn bài" onClick={() => setMenu(true)}>
          <MoreVertical size={18} />
        </IconButton>
      </div>
      {showDesc && ex.description && <div className="mb-2 rounded-xl bg-surface-2 p-2.5 text-sm whitespace-pre-line">{ex.description}</div>}
      {nextSet && <div className="mb-1 px-1"><PlateHint weight={nextSet.doneWeight ?? nextSet.weight} ex={ex} /></div>}
      <div className="grid grid-cols-[2.25rem_1fr_1fr_3rem] gap-2 px-1 pb-1 text-[11px] font-semibold text-muted uppercase">
        <span className="text-center">Set</span>
        <span className="text-center">Tạ</span>
        <span className="text-center">Rep</span>
        <span />
      </div>
      <div className="space-y-1">
        {(() => {
          let wi = -1;
          return ex.sets.map((s, i) => {
            if (!s.warmup) wi++;
            return (
              <SetRow
                key={i}
                s={s}
                index={i}
                workIndex={wi}
                ex={ex}
                onChange={(p) => setSet(i, p)}
                onToggle={() => toggle(i)}
                onRemove={() => onUpdate({ ...ex, sets: ex.sets.filter((_, j) => j !== i) })}
              />
            );
          });
        })()}
      </div>
      {noteOpen && (
        <textarea
          className="field mt-2 text-sm"
          rows={2}
          placeholder="Ghi chú cho bài này (cảm giác, kỹ thuật...)"
          value={ex.notes ?? ""}
          onChange={(e) => onUpdate({ ...ex, notes: e.target.value })}
        />
      )}
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={16} />}
          onClick={() => {
            const lastSet = [...ex.sets].reverse().find((s) => !s.warmup) ?? ex.sets[ex.sets.length - 1];
            const ns: WorkoutSet = lastSet
              ? { reps: lastSet.reps, minReps: lastSet.minReps, weight: lastSet.doneWeight ?? lastSet.weight, rpe: lastSet.rpe, done: false }
              : { reps: 10, weight: 0, done: false };
            onUpdate({ ...ex, sets: [...ex.sets, ns] });
          }}
        >
          Thêm set
        </Button>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.name}>
        <div className="grid grid-cols-1 gap-2 pb-2">
          <Button variant="secondary" className="justify-start" icon={<StickyNote size={18} />} onClick={() => (setNoteOpen(true), setMenu(false))}>
            Ghi chú
          </Button>
          <Button variant="secondary" className="justify-start" icon={<Repeat size={18} />} onClick={() => (onSwap(), setMenu(false))}>
            Đổi bài tập khác
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            icon={<Plus size={18} />}
            onClick={() => {
              const first = ex.sets.find((s) => !s.warmup);
              const w = first ? first.doneWeight ?? first.weight : 0;
              onUpdate({ ...ex, sets: [{ reps: 8, weight: Math.round(w * 0.5), warmup: true, done: false }, ...ex.sets] });
              setMenu(false);
            }}
          >
            Thêm set khởi động
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={idx === 0} icon={<ArrowUp size={18} />} onClick={() => (onMove(-1), setMenu(false))}>
              Lên
            </Button>
            <Button variant="secondary" disabled={idx === total - 1} icon={<ArrowDown size={18} />} onClick={() => (onMove(1), setMenu(false))}>
              Xuống
            </Button>
          </div>
          <NumberField
            label="Thời gian nghỉ cho bài này"
            suffix="giây"
            value={ex.restSec ?? settings.restTimerSec}
            onChange={(v) => onUpdate({ ...ex, restSec: v })}
            step={15}
            stepper
          />
          <Button variant="danger" className="justify-start" icon={<Trash2 size={18} />} onClick={() => (confirm("Xoá bài này khỏi buổi tập?") && onRemove(), setMenu(false))}>
            Xoá bài khỏi buổi tập
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

function FinishSheet({ open, onClose, workout, onDone }: { open: boolean; onClose: () => void; workout: Workout; onDone: (r: FinishResult) => void }) {
  const goals = useGoals();
  const [applyProgress, setApplyProgress] = useState(true);
  const [logKcal, setLogKcal] = useState(goals.activityKcalFactor > 0);
  const [bw, setBw] = useState<number | undefined>(workout.bodyweightKg);
  const [busy, setBusy] = useState(false);
  const c = workoutSetCount(workout);
  const unfinished = c.total - c.done;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Kết thúc buổi tập"
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await finishWorkout({ ...workout, bodyweightKg: bw }, { applyProgress, logKcal });
              stopRest();
              onDone(r);
            } finally {
              setBusy(false);
            }
          }}
        >
          Lưu buổi tập
        </Button>
      }
    >
      <div className="stagger space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="tabular text-lg font-bold">{formatDuration((Date.now() - workout.startedAt) / 1000)}</div>
            <div className="text-xs text-muted">Thời gian</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="tabular text-lg font-bold">
              {c.done}/{c.total}
            </div>
            <div className="text-xs text-muted">Set</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="tabular text-lg font-bold">{fmt(workoutVolume(workout))}</div>
            <div className="text-xs text-muted">kg khối lượng</div>
          </div>
        </div>
        {unfinished > 0 && <div className="rounded-xl bg-carbs/15 p-2.5 text-sm">Còn {unfinished} set chưa đánh dấu hoàn thành — các bài đó sẽ được tính là chưa đạt.</div>}
        {workout.programId && <Toggle checked={applyProgress} onChange={setApplyProgress} label="Cập nhật tiến độ chương trình" desc="Tự tăng tạ/rep theo quy tắc lp/dp/sum" />}
        <Toggle checked={logKcal} onChange={setLogKcal} label="Ghi calo buổi tập vào nhật ký vận động" desc="Ước tính MET 5 × cân nặng × thời gian" />
        <NumberField label="Cân nặng hôm nay" hint="dùng để tính calo" suffix="kg" value={bw} onChange={setBw} step={0.1} />
      </div>
    </Sheet>
  );
}

function ResultSheet({ result, onClose }: { result: FinishResult | null; onClose: () => void }) {
  useEffect(() => {
    if (!result) return;
    confetti({ count: result.prs.length ? 220 : 140 });
    if (result.prs.length) setTimeout(() => confetti({ count: 120, origin: { x: 0.2, y: 0.5 } }), 350);
  }, [result]);
  if (!result) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Hoàn thành! 🎉"
      footer={
        <Button size="lg" className="w-full" onClick={onClose}>
          Xem chi tiết buổi tập
        </Button>
      }
    >
      <div className="space-y-4">
        {result.prs.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <Trophy size={18} className="text-carbs" /> Kỷ lục mới
            </div>
            {result.prs.map((p) => (
              <div key={p.exerciseId} className="rounded-xl bg-carbs/15 px-3 py-2 text-sm">
                <b>{p.name}</b>: {p.detail}
              </div>
            ))}
          </div>
        )}
        {result.progressSummary.length > 0 && (
          <div>
            <div className="mb-1 font-semibold">Lần tập sau</div>
            <ul className="space-y-1 text-sm">
              {result.progressSummary.map((s, i) => (
                <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!result.prs.length && !result.progressSummary.length && <p className="text-muted">Buổi tập đã được lưu vào lịch sử.</p>}
      </div>
    </Sheet>
  );
}

export default function WorkoutPage() {
  const w = useActiveWorkout();
  const settings = useSettings();
  const programs = usePrograms();
  const now = useNow(1000);
  useWakeLock(settings.keepAwake && !!w);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; idx: number } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const history = useWorkouts();

  const program = w?.programId ? programs.find((p) => p.id === w.programId) : undefined;
  const parsed = useMemo(() => (program ? parseProgram(program.text) : undefined), [program]);
  const dayDesc = parsed && w?.dayIndex != null ? parsed.days[w.dayIndex]?.description : undefined;

  if (result) {
    return (
      <ResultSheet
        result={result}
        onClose={() => {
          const id = result.workout.id;
          setResult(null);
          navigate(`/training/history/${id}`, { replace: true });
        }}
      />
    );
  }

  if (w === undefined) return null;
  if (!w) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
        <div className="text-5xl">🏋️</div>
        <h1 className="text-xl font-extrabold">Chưa có buổi tập nào đang diễn ra</h1>
        <div className="flex flex-col gap-2">
          <Button variant="train" size="lg" onClick={() => navigate("/training")}>
            Chọn buổi theo chương trình
          </Button>
          <Button variant="secondary" size="lg" onClick={() => startEmptyWorkout()}>
            Bắt đầu buổi tập tự do
          </Button>
        </div>
      </div>
    );
  }

  const update = (fn: (w: Workout) => Workout) => saveActiveWorkout(fn(w));
  const setEx = (i: number, ex: WorkoutExercise) => update((x) => ({ ...x, exercises: x.exercises.map((e, j) => (j === i ? ex : e)) }));
  const c = workoutSetCount(w);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-bg/90 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <IconButton label="Thu nhỏ" onClick={() => navigate("/training")}>
            <ChevronLeft />
          </IconButton>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{w.dayName}</div>
            <div className="tabular text-xs text-muted">
              {formatDuration((now - w.startedAt) / 1000)} · {c.done}/{c.total} set{w.programName ? ` · ${w.programName}` : ""}
            </div>
          </div>
          <Button size="sm" onClick={() => setFinishOpen(true)}>
            Kết thúc
          </Button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-accent transition-all" style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
        </div>
      </div>

      {dayDesc && (
        <button onClick={() => setDescOpen(!descOpen)} className="mb-3 w-full rounded-xl bg-surface-2 px-3 py-2 text-left text-sm">
          <div className="flex items-center justify-between font-semibold">
            Ghi chú buổi tập <ChevronDown size={16} className={cx("transition", descOpen && "rotate-180")} />
          </div>
          {descOpen && <div className="mt-1 whitespace-pre-line text-muted">{dayDesc}</div>}
        </button>
      )}

      <div className="space-y-3">
        {w.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.uid}
            ex={ex}
            idx={i}
            total={w.exercises.length}
            workout={w}
            progressLabel={shortProgression(parsed?.progressions[ex.key])}
            onUpdate={(e) => setEx(i, e)}
            onRemove={() => update((x) => ({ ...x, exercises: x.exercises.filter((_, j) => j !== i) }))}
            onMove={(dir) =>
              update((x) => {
                const arr = [...x.exercises];
                const [it] = arr.splice(i, 1);
                arr.splice(i + dir, 0, it);
                return { ...x, exercises: arr };
              })
            }
            onSwap={() => setPicker({ mode: "swap", idx: i })}
          />
        ))}
        {!w.exercises.length && <div className="py-6 text-center text-muted">Thêm bài tập đầu tiên để bắt đầu.</div>}
        <Button variant="outline" size="lg" className="w-full" icon={<Plus size={18} />} onClick={() => setPicker({ mode: "add" })}>
          Thêm bài tập
        </Button>
        <textarea className="field text-sm" rows={2} placeholder="Ghi chú buổi tập..." value={w.notes ?? ""} onChange={(e) => update((x) => ({ ...x, notes: e.target.value }))} />
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            icon={<X size={18} />}
            onClick={async () => {
              if (!confirm("Huỷ buổi tập này? Dữ liệu buổi tập sẽ không được lưu.")) return;
              stopRest();
              await discardActiveWorkout();
              toast("Đã huỷ buổi tập", "info");
              navigate("/training");
            }}
          >
            Huỷ buổi tập
          </Button>
          <Button className="flex-1" icon={<Check size={18} />} onClick={() => setFinishOpen(true)}>
            Kết thúc & lưu
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={!!picker}
        title={picker?.mode === "swap" ? "Đổi bài tập" : "Thêm bài tập"}
        onClose={() => setPicker(null)}
        onPick={(def, equipment) => {
          const last = lastSetsFor(history, def.id);
          const ne = newWorkoutExercise(def, equipment, settings, last?.sets);
          if (picker?.mode === "swap") {
            const old = w.exercises[picker.idx];
            // giữ nguyên cấu trúc set khi đổi bài
            const sets = old.sets.map((s) => ({ ...s, done: false, doneReps: undefined, doneWeight: undefined, weight: ne.sets[0]?.weight ?? s.weight }));
            setEx(picker.idx, { ...old, uid: ne.uid, exerciseId: def.id, name: def.name, equipment, key: old.key + "~swap", sets });
          } else {
            update((x) => ({ ...x, exercises: [...x.exercises, ne] }));
          }
          setPicker(null);
        }}
      />
      <FinishSheet open={finishOpen} onClose={() => setFinishOpen(false)} workout={w} onDone={(r) => (setFinishOpen(false), setResult(r))} />
    </div>
  );
}

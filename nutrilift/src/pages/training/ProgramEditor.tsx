import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowLeft, Copy, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, cx, IconButton, NumberField, Segmented, SectionTitle, toast } from "../../components/ui";
import { alive, db, put, remove } from "../../db/db";
import type { ExerciseProgress, Program } from "../../db/types";
import { createProgramFromText, setActiveProgram } from "../../lib/actions";
import { fmt } from "../../lib/format";
import { formatDate } from "../../lib/date";
import { useActiveProgram, useSettings, useWorkouts } from "../../lib/hooks";
import { goBack, navigate, useLocation } from "../../lib/router";
import { EQUIPMENT_LABELS } from "../../training/exercises";
import { describeProgression, parseProgram, setsSummary, type PExercise } from "../../training/liftoscript";
import { lastSetsFor, recentE1rm } from "../../training/stats";
import { EMPTY_PROGRESS, roundWeight } from "../../training/workout";

const HELP = `## Tên buổi            → bắt đầu một buổi tập
# Week 1                → (tuỳ chọn) chia theo tuần
// Mô tả                → hiển thị khi tập, cho bài ngay dưới
/// Ghi chú ẩn

Tên bài[, Dụng cụ] / set x rep / mức tạ / nghỉ / tuỳ chọn...

Ví dụ:
Squat / 3x5 / 60kg / 180s / progress: lp(2.5kg)
Bench Press / 3x8-12 / 40kg / 120s
Bench Press, Dumbbell / 4x10 @8 / 90s
Pull Up / 3x5+ / 0kg / progress: sum(25, 2.5kg)
Deadlift / 1x5 85% / warmup: 1x5 40%, 1x3 70%
Lateral Raise / 3x15 / 6kg / warmup: none

Set:   3x5 · 3x8-12 (khoảng rep) · 1x5+ (AMRAP) · 4x5, 1x5+ (nhiều nhóm)
Tạ:    60kg · 135lb · 75% (của 1RM) · @8 (RPE, tự tính từ 1RM)
Nghỉ:  90s
Tiến độ (khai báo 1 lần cho mỗi bài):
  lp(2.5kg)                  tăng 2.5kg mỗi buổi đạt đủ rep
  lp(2.5kg, 2)               tăng sau 2 buổi đạt liên tiếp
  lp(2.5kg, 1, 0, 10%, 3)    trượt 3 lần → giảm 10%
  dp(2.5kg, 8, 12)           tăng rep 8→12, rồi +2.5kg và về 8 rep
  sum(30, 2.5kg)             tổng rep ≥ 30 thì +2.5kg
  none                       không tự tăng`;

export default function ProgramEditor({ id }: { id: string }) {
  const { query } = useLocation();
  const program = useLiveQuery(async () => (await db.programs.get(id)) ?? null, [id]);
  const active = useActiveProgram();
  const settings = useSettings();
  const workouts = useWorkouts();
  const custom = useLiveQuery(async () => alive(await db.exercises.toArray()), []) ?? [];
  const [tab, setTab] = useState<"weights" | "text" | "help">(query.get("setup") ? "weights" : "weights");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (program && !dirty) {
      setText(program.text);
      setName(program.name);
    }
  }, [program, dirty]);

  const parsed = useMemo(() => parseProgram(text, custom), [text, custom]);
  const uniqueExercises = useMemo(() => {
    const seen = new Map<string, PExercise>();
    for (const d of parsed.days) for (const e of d.exercises) if (!seen.has(e.key)) seen.set(e.key, e);
    return [...seen.values()];
  }, [parsed]);

  if (program === undefined) return null;
  if (program === null || program.deleted) return <div className="py-10 text-center text-muted">Không tìm thấy chương trình.</div>;

  const save = async (patch: Partial<Program> = {}) => {
    await put("programs", { ...program, name, text, ...patch });
    setDirty(false);
  };

  const setProgress = async (key: string, p: Partial<ExerciseProgress>) => {
    const cur = { ...EMPTY_PROGRESS, ...(program.progress[key] ?? {}) };
    await put("programs", { ...program, progress: { ...program.progress, [key]: { ...cur, ...p, updatedAt: Date.now() } } });
  };

  const isActive = active?.id === program.id;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training/programs")}>
          <ArrowLeft />
        </IconButton>
        <input
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl font-extrabold outline-none focus:bg-surface-2"
          value={name}
          onChange={(e) => (setName(e.target.value), setDirty(true))}
          onBlur={() => save()}
        />
        <IconButton
          label="Nhân bản"
          onClick={async () => {
            const p = await createProgramFromText(name + " (bản sao)", text, program.templateId);
            navigate(`/training/program/${p.id}`, { replace: true });
          }}
        >
          <Copy size={18} />
        </IconButton>
        <IconButton
          label="Xoá"
          onClick={async () => {
            if (!confirm("Xoá chương trình này? Lịch sử tập vẫn được giữ.")) return;
            await remove("programs", program.id);
            if (isActive) await setActiveProgram(null);
            navigate("/training/programs", { replace: true });
          }}
        >
          <Trash2 size={18} />
        </IconButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isActive ? (
          <Badge color="train">Đang dùng</Badge>
        ) : (
          <Button size="sm" variant="train" onClick={() => setActiveProgram(program.id).then(() => toast("Đã kích hoạt"))}>
            Dùng chương trình này
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          Buổi tiếp theo:
          <select className="field w-auto py-1" value={parsed.days.length ? program.nextDay % parsed.days.length : 0} onChange={(e) => put("programs", { ...program, nextDay: Number(e.target.value) })}>
            {parsed.days.map((d, i) => (
              <option key={i} value={i}>
                {parsed.weeks.length > 1 ? `${d.weekName} · ` : ""}
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.get("setup") && (
        <Card className="border-train/50 bg-train-soft/40 text-sm">
          <b>Bước cuối:</b> chỉnh mức tạ khởi điểm cho từng bài sao cho bạn làm được đủ rep với 1–3 rep dự trữ. App sẽ tự tăng dần từ đây.
        </Card>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "weights", label: "Mức tạ & tiến độ" },
          { value: "text", label: "Soạn thảo" },
          { value: "help", label: "Cú pháp" },
        ]}
      />

      {tab === "weights" && (
        <div className="space-y-4">
          {parsed.errors.length > 0 && (
            <Card className="border-danger/50 text-sm text-danger">
              <AlertTriangle size={16} className="mr-1 inline" /> Chương trình có lỗi — xem tab Soạn thảo.
            </Card>
          )}
          <Card className="p-0">
            <div className="divide-y divide-line">
              {uniqueExercises.map((e) => {
                const prog = { ...EMPTY_PROGRESS, ...(program.progress[e.key] ?? {}) };
                const p = parsed.progressions[e.key];
                const base = e.sets[0];
                const pctBased = e.sets.every((s) => s.pct != null);
                const rpeBased = e.sets.every((s) => s.weightKg == null && s.pct == null && s.rpe != null);
                const textWeight = base?.weightKg ?? 0;
                const current = roundWeight(textWeight + prog.weightDelta, e.equipment, settings);
                const histRm = recentE1rm(workouts, e.exerciseId);
                const last = lastSetsFor(workouts, e.exerciseId);
                const lastTop = last?.sets.filter((x) => !x.warmup).reduce<{ w: number; r: number } | undefined>((best, x) => {
                  const w = x.doneWeight ?? x.weight;
                  return !best || w > best.w ? { w, r: x.doneReps ?? x.reps } : best;
                }, undefined);
                return (
                  <div key={e.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="font-semibold">
                        {e.label && <span className="mr-1 text-xs text-muted uppercase">{e.label}</span>}
                        {e.name}
                        {e.def && e.def.equipment !== e.equipment && <span className="text-muted">, {EQUIPMENT_LABELS[e.equipment]}</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {setsSummary(e.sets)} · {describeProgression(p)}
                        {prog.repsDelta ? ` · +${prog.repsDelta} rep` : ""}
                        {prog.fail ? ` · trượt ${prog.fail} lần` : ""}
                      </div>
                      {lastTop && !pctBased && !rpeBased && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>
                            Gần nhất ({formatDate(last!.date)}): {fmt(lastTop.w, 2)}kg × {lastTop.r}
                          </span>
                          {Math.abs(lastTop.w - current) > 0.01 && (
                            <button
                              className="font-semibold text-accent-ink"
                              onClick={() => setProgress(e.key, { weightDelta: Math.round((lastTop.w - textWeight) * 100) / 100 })}
                            >
                              Dùng mức này
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {pctBased || rpeBased ? (
                      <NumberField
                        className="w-36"
                        label="1RM"
                        suffix="kg"
                        value={prog.rm1 ?? (histRm ? Math.round(histRm) : undefined)}
                        placeholder="chưa có"
                        onChange={(v) => setProgress(e.key, { rm1: v })}
                      />
                    ) : (
                      <NumberField
                        className="w-36"
                        label={prog.weightDelta ? `Hiện tại (${prog.weightDelta > 0 ? "+" : ""}${fmt(prog.weightDelta, 2)})` : "Hiện tại"}
                        suffix="kg"
                        value={current}
                        step={2.5}
                        onChange={(v) => v != null && setProgress(e.key, { weightDelta: Math.round((v - textWeight) * 100) / 100 })}
                      />
                    )}
                  </div>
                );
              })}
              {!uniqueExercises.length && <div className="p-4 text-sm text-muted">Chưa có bài tập nào.</div>}
            </div>
          </Card>
          <Button
            variant="ghost"
            icon={<RotateCcw size={16} />}
            onClick={async () => {
              if (!confirm("Đặt lại toàn bộ tiến độ về mức tạ ghi trong văn bản?")) return;
              await put("programs", { ...program, progress: {} });
            }}
          >
            Đặt lại tiến độ
          </Button>
        </div>
      )}

      {tab === "text" && (
        <div className="space-y-3">
          <textarea
            className="field min-h-[50dvh] font-mono text-[13px] leading-relaxed"
            spellCheck={false}
            value={text}
            onChange={(e) => (setText(e.target.value), setDirty(true))}
          />
          <div className="flex items-center gap-2">
            <Button disabled={!dirty || parsed.errors.length > 0} icon={<Save size={18} />} onClick={() => save().then(() => toast("Đã lưu chương trình"))}>
              Lưu
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => (setText(program.text), setDirty(false))}>
                Huỷ thay đổi
              </Button>
            )}
            <span className={cx("ml-auto text-sm", parsed.errors.length ? "text-danger" : "text-accent-ink")}>
              {parsed.errors.length ? `${parsed.errors.length} lỗi` : `✓ ${parsed.days.length} buổi`}
            </span>
          </div>
          {(parsed.errors.length > 0 || parsed.warnings.length > 0) && (
            <Card className="space-y-1 text-sm">
              {parsed.errors.map((e, i) => (
                <div key={"e" + i} className="text-danger">
                  Dòng {e.line}: {e.message}
                </div>
              ))}
              {parsed.warnings.map((e, i) => (
                <div key={"w" + i} className="text-carbs">
                  {e.line > 1 ? `Dòng ${e.line}: ` : ""}
                  {e.message}
                </div>
              ))}
            </Card>
          )}
          <SectionTitle>Xem trước</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {parsed.days.map((d, i) => (
              <Card key={i}>
                <div className="mb-1 font-semibold">
                  {parsed.weeks.length > 1 ? `${d.weekName} · ` : ""}
                  {d.name}
                </div>
                {d.exercises.map((e, j) => (
                  <div key={j} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{e.name}</span>
                    <span className="tabular shrink-0 text-muted">
                      {setsSummary(e.sets)} {e.sets[0]?.weightKg != null ? `${e.sets[0].weightKg}kg` : e.sets[0]?.pct != null ? `${e.sets[0].pct}%` : e.sets[0]?.rpe ? `@${e.sets[0].rpe}` : ""}
                    </span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "help" && (
        <Card>
          <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{HELP}</pre>
          <p className="mt-3 text-xs text-muted">
            Cú pháp tương thích phần cơ bản của Liftoscript (Liftosaur), nên bạn có thể dán chương trình từ liftosaur.com. Tiến độ được lưu riêng (không ghi đè văn bản), xem ở tab “Mức tạ & tiến độ”.
          </p>
        </Card>
      )}
    </div>
  );
}

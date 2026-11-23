import { BarChart3, BookOpen, ChevronRight, Dumbbell, History as HistoryIcon, ListChecks, Play, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { HBar } from "../../components/charts";
import { Badge, Button, Card, cx, Empty, ListRow, SectionTitle } from "../../components/ui";
import { startEmptyWorkout, startProgramWorkout } from "../../lib/actions";
import { formatDate, formatDuration, startOfWeek } from "../../lib/date";
import { fmt } from "../../lib/format";
import { useActiveProgram, useActiveWorkout, usePhases, useToday, useWorkouts } from "../../lib/hooks";
import { navigate } from "../../lib/router";
import { activePhase } from "../../nutrition/calc";
import { MUSCLE_LABELS, MUSCLE_ORDER } from "../../training/exercises";
import { parseProgram, setsSummary } from "../../training/liftoscript";
import { muscleSets } from "../../training/stats";
import { workoutSetCount, workoutVolume } from "../../training/workout";

export default function Training() {
  const program = useActiveProgram();
  const active = useActiveWorkout();
  const workouts = useWorkouts();
  const t = useToday();
  const phases = usePhases();
  const phase = activePhase(phases, t);
  const parsed = useMemo(() => (program ? parseProgram(program.text) : undefined), [program]);
  const [busy, setBusy] = useState(false);
  const weekFrom = startOfWeek(t);
  const thisWeek = workouts.filter((w) => w.date >= weekFrom && w.endedAt);
  const ms = muscleSets(thisWeek);
  const maxSets = Math.max(10, ...Object.values(ms));
  const next = program && parsed?.days.length ? program.nextDay % parsed.days.length : 0;

  const start = async (idx: number) => {
    if (!program) return;
    if (active && !confirm("Đang có buổi tập dở. Bắt đầu buổi mới sẽ thay thế buổi đó?")) return;
    setBusy(true);
    await startProgramWorkout(program, idx);
    navigate("/training/workout");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Tập luyện</h1>
      {active && (
        <Card className="border-train/50 bg-train-soft/50">
          <div className="flex items-center gap-3">
            <Dumbbell className="text-train" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Đang tập: {active.dayName}</div>
              <div className="text-xs text-muted">Bắt đầu lúc {new Date(active.startedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <Button variant="train" onClick={() => navigate("/training/workout")}>
              Tiếp tục
            </Button>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {program && parsed ? (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted uppercase">Chương trình đang dùng</div>
                  <div className="truncate text-lg font-bold">{program.name}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/training/program/${program.id}`)}>
                  Sửa
                </Button>
              </div>
              <div className="space-y-2">
                {parsed.days.map((d, i) => (
                  <div key={i} className={cx("rounded-xl border p-3", i === next ? "border-train bg-train-soft/40" : "border-line")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {parsed.weeks.length > 1 ? `${d.weekName} · ` : ""}
                          {d.name}
                        </div>
                        <div className="truncate text-xs text-muted">{d.exercises.map((e) => `${e.name} ${setsSummary(e.sets)}`).join(" · ")}</div>
                      </div>
                      {i === next ? (
                        <Button size="sm" variant="train" disabled={busy} icon={<Play size={14} />} onClick={() => start(i)}>
                          Bắt đầu
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(i)}>
                          Tập buổi này
                        </Button>
                      )}
                    </div>
                    {i === next && <Badge color="train" className="mt-2">Buổi tiếp theo</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <Empty
                icon={<ListChecks size={36} />}
                title="Chưa chọn chương trình tập"
                desc="Chọn chương trình mẫu (có bản dành riêng cho cutting và bulking) hoặc dán chương trình Liftoscript từ Liftosaur."
                action={
                  <Button variant="train" onClick={() => navigate("/training/programs")}>
                    Chọn chương trình
                  </Button>
                }
              />
            </Card>
          )}
          <Button variant="outline" className="w-full" icon={<Plus size={18} />} onClick={async () => (await startEmptyWorkout(), navigate("/training/workout"))}>
            Buổi tập tự do (không theo chương trình)
          </Button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { to: "/training/programs", icon: ListChecks, label: "Chương trình" },
              { to: "/training/history", icon: HistoryIcon, label: "Lịch sử" },
              { to: "/training/exercises", icon: BookOpen, label: "Bài tập" },
              { to: "/progress?tab=strength", icon: BarChart3, label: "Sức mạnh" },
            ].map((x) => (
              <button key={x.to} onClick={() => navigate(x.to)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface p-3 text-sm font-semibold hover:bg-surface-2">
                <x.icon size={22} className="text-train" />
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Card>
            <SectionTitle>Số set mỗi nhóm cơ — tuần này</SectionTitle>
            {thisWeek.length === 0 ? (
              <div className="py-2 text-sm text-muted">Chưa có buổi tập nào tuần này.</div>
            ) : (
              <div className="space-y-1.5">
                {MUSCLE_ORDER.filter((m) => ms[m]).map((m) => (
                  <HBar key={m} label={MUSCLE_LABELS[m]} value={ms[m]} max={maxSets} />
                ))}
              </div>
            )}
            <div className="mt-3 text-xs text-muted">
              {phase?.type === "cut"
                ? "Khi cutting: duy trì cường độ, khoảng 6–12 set/nhóm cơ/tuần thường đủ để giữ cơ."
                : "Để tăng cơ: khoảng 10–20 set/nhóm cơ/tuần (nhóm phụ tính ½ set)."}
            </div>
          </Card>
          <Card>
            <SectionTitle
              action={
                <button onClick={() => navigate("/training/history")} className="text-muted">
                  <ChevronRight size={18} />
                </button>
              }
            >
              Gần đây
            </SectionTitle>
            {workouts.filter((w) => w.endedAt).slice(0, 4).map((w) => {
              const c = workoutSetCount(w);
              return (
                <ListRow
                  key={w.id}
                  title={w.dayName ?? "Buổi tập"}
                  subtitle={`${formatDate(w.date, { weekday: true })} · ${formatDuration(((w.endedAt ?? w.startedAt) - w.startedAt) / 1000)} · ${c.done} set`}
                  right={<span className="tabular text-sm text-muted">{fmt(workoutVolume(w))} kg</span>}
                  onClick={() => navigate(`/training/history/${w.id}`)}
                />
              );
            })}
            {!workouts.some((w) => w.endedAt) && <div className="py-2 text-sm text-muted">Chưa có buổi tập nào.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

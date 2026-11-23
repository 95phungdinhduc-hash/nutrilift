import { ArrowLeft, ClipboardPaste, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, cx, IconButton, SectionTitle, Sheet, toast } from "../../components/ui";
import { createProgramFromText, setActiveProgram } from "../../lib/actions";
import { useActiveProgram, usePhases, usePrograms, useToday } from "../../lib/hooks";
import { goBack, navigate } from "../../lib/router";
import { activePhase } from "../../nutrition/calc";
import { parseProgram } from "../../training/liftoscript";
import { EMPTY_PROGRAM_TEXT, PROGRAM_TEMPLATES } from "../../training/programs";

export default function Programs() {
  const programs = usePrograms();
  const active = useActiveProgram();
  const phases = usePhases();
  const t = useToday();
  const phase = activePhase(phases, t);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("Chương trình từ Liftosaur");

  const applyTemplate = async (id: string) => {
    const tpl = PROGRAM_TEMPLATES.find((x) => x.id === id)!;
    const p = await createProgramFromText(tpl.name, tpl.text, tpl.id);
    await setActiveProgram(p.id);
    toast("Đã kích hoạt chương trình — hãy chỉnh mức tạ khởi điểm");
    navigate(`/training/program/${p.id}?setup=1`);
  };

  const parsedPaste = pasteText.trim() ? parseProgram(pasteText) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <IconButton label="Quay lại" onClick={() => goBack("/training")}>
          <ArrowLeft />
        </IconButton>
        <h1 className="flex-1 text-xl font-extrabold">Chương trình tập</h1>
      </div>

      <section>
        <SectionTitle>Của tôi</SectionTitle>
        <div className="space-y-2">
          {programs.map((p) => {
            const parsed = parseProgram(p.text);
            return (
              <Card key={p.id} className="flex items-center gap-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/training/program/${p.id}`)}>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    {active?.id === p.id && <Badge color="train">Đang dùng</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {parsed.days.length} buổi · {new Set(parsed.days.flatMap((d) => d.exercises.map((e) => e.key))).size} bài
                    {parsed.errors.length ? ` · ${parsed.errors.length} lỗi` : ""}
                  </div>
                </button>
                {active?.id !== p.id && (
                  <Button size="sm" variant="secondary" onClick={() => setActiveProgram(p.id).then(() => toast("Đã chuyển chương trình"))}>
                    Dùng
                  </Button>
                )}
              </Card>
            );
          })}
          {!programs.length && <div className="text-sm text-muted">Chưa có chương trình nào.</div>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              icon={<Plus size={18} />}
              onClick={async () => {
                const p = await createProgramFromText("Chương trình của tôi", EMPTY_PROGRAM_TEXT);
                navigate(`/training/program/${p.id}`);
              }}
            >
              Tạo mới
            </Button>
            <Button variant="outline" className="flex-1" icon={<ClipboardPaste size={18} />} onClick={() => setPasteOpen(true)}>
              Dán từ Liftosaur
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Chương trình mẫu</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROGRAM_TEMPLATES.map((tpl) => {
            const recommended = (phase?.type === "cut" && tpl.goal === "cut") || (phase?.type === "bulk" && tpl.goal === "bulk");
            return (
              <Card key={tpl.id} className={cx("flex flex-col", recommended && "border-train/60")}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{tpl.name}</span>
                  {recommended && <Badge color="train">Hợp giai đoạn hiện tại</Badge>}
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge>{tpl.daysPerWeek}</Badge>
                  <Badge>{tpl.level}</Badge>
                </div>
                <p className="mb-3 flex-1 text-sm text-muted">{tpl.short}</p>
                <Button variant="train" size="sm" onClick={() => applyTemplate(tpl.id)}>
                  Dùng chương trình này
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <Sheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Dán chương trình Liftoscript"
        wide
        footer={
          <Button
            className="w-full"
            size="lg"
            disabled={!parsedPaste || parsedPaste.errors.length > 0 || !parsedPaste.days.length}
            onClick={async () => {
              const p = await createProgramFromText(pasteName || "Chương trình nhập", pasteText);
              setPasteOpen(false);
              setPasteText("");
              navigate(`/training/program/${p.id}`);
            }}
          >
            Nhập chương trình
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Trong Liftosaur: mở chương trình → chế độ chỉnh sửa văn bản → sao chép toàn bộ và dán vào đây. Hỗ trợ: tuần/buổi, NxR, rep range, AMRAP, kg/lb/%, RPE, thời gian nghỉ, warmup, lp/dp/sum. Script custom() sẽ được bỏ qua.
          </p>
          <input className="field" value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Tên chương trình" />
          <textarea className="field font-mono text-sm" rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"# Week 1\n## Day 1\nSquat / 3x5 / 135lb / progress: lp(5lb)"} />
          {parsedPaste && (
            <div className="text-sm">
              {parsedPaste.errors.map((e, i) => (
                <div key={i} className="text-danger">
                  Dòng {e.line}: {e.message}
                </div>
              ))}
              {parsedPaste.warnings.map((e, i) => (
                <div key={i} className="text-carbs">
                  {e.message}
                </div>
              ))}
              {!parsedPaste.errors.length && (
                <div className="text-accent-ink">
                  ✓ {parsedPaste.days.length} buổi, {parsedPaste.days.reduce((a, d) => a + d.exercises.length, 0)} dòng bài tập
                </div>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

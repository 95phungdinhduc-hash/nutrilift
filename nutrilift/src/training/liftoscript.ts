/**
 * "Liftoscript-lite": trình phân tích cú pháp chương trình tập, tương thích với phần cú pháp phổ biến
 * của Liftoscript (Liftosaur):
 *
 *   # Week 1                      (tuần — tuỳ chọn)
 *   ## Ngày A                     (buổi tập)
 *   // Mô tả hiển thị khi tập      (mô tả cho bài tập ngay dưới)
 *   /// Ghi chú ẩn
 *   t1: Squat / 3x5 / 60kg / 180s / warmup: 1x5 20kg, 1x3 50% / progress: lp(2.5kg)
 *   Bench Press, Dumbbell / 3x8-12 @8 / 90s / progress: dp(2kg, 8, 12)
 *   Pull Up / 3x5+ / 0kg / progress: sum(30, 2.5kg)
 *
 * Hỗ trợ: NxR, NxR-R, NxR+, nhiều nhóm set ("1x5, 3x3"), kg/lb/%, @RPE, timer, warmup, nhãn "t1:",
 * lp/dp/sum/none. Các script custom() {~ ~} và "...template" được bỏ qua kèm cảnh báo.
 */
import type { CustomExercise, Equipment } from "../db/types";
import { findExerciseByName, parseEquipment, type ExerciseDef } from "./exercises";

export interface PSet {
  reps: number;
  minReps?: number;
  amrap: boolean;
  weightKg?: number;
  pct?: number;
  rpe?: number;
  timerSec?: number;
  label?: string;
}

export interface WeightValue {
  kind: "kg" | "pct";
  value: number;
}

export type Progression =
  | { type: "lp"; inc: WeightValue; succAttempts: number; dec?: WeightValue; failAttempts: number }
  | { type: "dp"; inc: WeightValue; minReps: number; maxReps: number }
  | { type: "sum"; threshold: number; inc: WeightValue }
  | { type: "none" }
  | { type: "custom" };

export interface PExercise {
  key: string;
  label?: string;
  name: string;
  exerciseId: string;
  equipment: Equipment;
  def?: ExerciseDef;
  sets: PSet[];
  warmup?: PSet[] | "none";
  timerSec?: number;
  description?: string;
  superset?: string;
  line: number;
}

export interface PDay {
  name: string;
  week: number;
  weekName?: string;
  description?: string;
  exercises: PExercise[];
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParsedProgram {
  days: PDay[];
  weeks: { name: string; days: number[] }[];
  progressions: Record<string, Progression>;
  errors: ParseIssue[];
  warnings: ParseIssue[];
  unknownExercises: string[];
}

const LB_TO_KG = 0.45359237;

export function exerciseKey(label: string | undefined, exerciseId: string, equipment: Equipment): string {
  return `${label ? label.toLowerCase() + ":" : ""}${exerciseId}_${equipment}`;
}

export function slugId(name: string): string {
  return (
    "custom_" +
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
  );
}

function parseWeightToken(tok: string): WeightValue | undefined {
  const m = tok.match(/^(-?\d+(?:[.,]\d+)?)\s*(kg|lb|%)$/i);
  if (!m) return undefined;
  const v = parseFloat(m[1].replace(",", "."));
  const unit = m[2].toLowerCase();
  if (unit === "%") return { kind: "pct", value: v };
  if (unit === "lb") return { kind: "kg", value: Math.round(v * LB_TO_KG * 100) / 100 };
  return { kind: "kg", value: v };
}

interface Modifiers {
  weightKg?: number;
  pct?: number;
  rpe?: number;
  timerSec?: number;
  label?: string;
  ask?: boolean;
}

/** Đọc các bổ ngữ: "60kg", "75%", "@8", "@8+", "90s", "(nhãn)", "?+", "100kg+". */
function parseModifiers(text: string, issues: ParseIssue[], line: number): Modifiers {
  const mods: Modifiers = {};
  let rest = text;
  const labelMatch = rest.match(/\(([^)]*)\)/);
  if (labelMatch) {
    mods.label = labelMatch[1].trim();
    rest = rest.replace(labelMatch[0], " ");
  }
  for (const raw of rest.split(/\s+/).filter(Boolean)) {
    let tok = raw;
    if (tok === "?+" || tok === "?") {
      mods.ask = true;
      continue;
    }
    if (tok.endsWith("+") && !tok.startsWith("@")) tok = tok.slice(0, -1);
    if (tok.startsWith("@")) {
      const v = parseFloat(tok.slice(1).replace("+", "").replace(",", "."));
      if (isFinite(v)) mods.rpe = v;
      else issues.push({ line, message: `RPE không hợp lệ: ${raw}` });
      continue;
    }
    const timer = tok.match(/^(\d+)s$/i);
    if (timer) {
      mods.timerSec = parseInt(timer[1], 10);
      continue;
    }
    const timer2 = tok.match(/^(\d+)s\|(\d+|\?)s?$/i);
    if (timer2) {
      if (timer2[2] !== "?") mods.timerSec = parseInt(timer2[2], 10);
      continue;
    }
    const w = parseWeightToken(tok);
    if (w) {
      if (w.kind === "pct") mods.pct = w.value;
      else mods.weightKg = w.value;
      continue;
    }
    if (tok.toLowerCase() === "auto") continue;
    issues.push({ line, message: `Không hiểu "${raw}"` });
  }
  return mods;
}

const SET_RE = /^(\d+)\s*x\s*(\d+)(?:\s*-\s*(\d+))?(\+)?(.*)$/i;

/** Phân tích phần set: "3x5", "4x5, 1x5+ (AMRAP)", "3x8-12 @8 90s". Trả undefined nếu không phải phần set. */
function parseSetsSection(text: string, issues: ParseIssue[], line: number): PSet[] | undefined {
  const groups = text.split(",").map((g) => g.trim()).filter(Boolean);
  if (!groups.length || !groups.every((g) => SET_RE.test(g))) return undefined;
  const sets: PSet[] = [];
  for (const g of groups) {
    const m = g.match(SET_RE)!;
    const count = parseInt(m[1], 10);
    let reps = parseInt(m[2], 10);
    let minReps: number | undefined;
    if (m[3]) {
      minReps = reps;
      reps = parseInt(m[3], 10);
    }
    const amrap = !!m[4];
    const mods = parseModifiers(m[5] || "", issues, line);
    if (count > 30) issues.push({ line, message: `Số set quá lớn (${count})` });
    for (let i = 0; i < Math.min(count, 30); i++) {
      sets.push({
        reps,
        minReps,
        amrap,
        weightKg: mods.weightKg,
        pct: mods.pct,
        rpe: mods.rpe,
        timerSec: mods.timerSec,
        label: mods.label,
      });
    }
  }
  return sets;
}

function splitArgs(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseProgression(text: string, issues: ParseIssue[], line: number): Progression | undefined {
  const t = text.trim();
  if (/^none$/i.test(t)) return { type: "none" };
  const m = t.match(/^(\w+)\s*\(([^)]*)\)/);
  if (!m) {
    issues.push({ line, message: `Không hiểu progress: "${t}"` });
    return undefined;
  }
  const fn = m[1].toLowerCase();
  const args = splitArgs(m[2]);
  const num = (i: number, d: number) => {
    const v = args[i] != null ? parseFloat(args[i]) : NaN;
    return isFinite(v) ? v : d;
  };
  if (fn === "lp") {
    const inc = parseWeightToken(args[0] ?? "");
    if (!inc) {
      issues.push({ line, message: "lp() cần mức tăng, ví dụ lp(2.5kg)" });
      return undefined;
    }
    const dec = args[3] ? parseWeightToken(args[3]) : undefined;
    return { type: "lp", inc, succAttempts: Math.max(1, num(1, 1)), dec, failAttempts: num(4, 0) };
  }
  if (fn === "dp") {
    const inc = parseWeightToken(args[0] ?? "");
    const minReps = num(1, NaN);
    const maxReps = num(2, NaN);
    if (!inc || !isFinite(minReps) || !isFinite(maxReps)) {
      issues.push({ line, message: "dp() cần dạng dp(2.5kg, 8, 12)" });
      return undefined;
    }
    return { type: "dp", inc, minReps, maxReps };
  }
  if (fn === "sum") {
    const threshold = num(0, NaN);
    const inc = parseWeightToken(args[1] ?? "");
    if (!isFinite(threshold) || !inc) {
      issues.push({ line, message: "sum() cần dạng sum(30, 2.5kg)" });
      return undefined;
    }
    return { type: "sum", threshold, inc };
  }
  if (fn === "custom") return { type: "custom" };
  issues.push({ line, message: `Kiểu tiến độ "${fn}" chưa được hỗ trợ` });
  return undefined;
}

export function parseProgram(text: string, customExercises: CustomExercise[] = []): ParsedProgram {
  const lines = text.replace(/\r/g, "").split("\n");
  const days: PDay[] = [];
  const weeks: { name: string; days: number[] }[] = [];
  const progressions: Record<string, Progression> = {};
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const unknown = new Set<string>();

  let weekNo = 0;
  let weekName: string | undefined;
  let pendingDesc: string[] = [];
  let lastDescByKey = new Map<string, string>();
  let inScript = false;
  let scriptStartLine = 0;
  let curDay: PDay | undefined;

  const ensureWeek = () => {
    if (weekNo === 0) {
      weekNo = 1;
      weekName = "Tuần 1";
      weeks.push({ name: weekName, days: [] });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i];
    if (inScript) {
      if (line.includes("~}")) inScript = false;
      continue;
    }
    // Bỏ khối script {~ ... ~}
    const scriptIdx = line.indexOf("{~");
    if (scriptIdx >= 0) {
      const endIdx = line.indexOf("~}", scriptIdx);
      if (endIdx < 0) {
        inScript = true;
        scriptStartLine = lineNo;
      }
      line = line.slice(0, scriptIdx) + (endIdx >= 0 ? line.slice(endIdx + 2) : "");
    }
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("///")) continue;
    if (trimmed.startsWith("//")) {
      pendingDesc.push(trimmed.replace(/^\/\/\s?/, ""));
      continue;
    }
    if (trimmed.startsWith("## ")) {
      ensureWeek();
      curDay = {
        name: trimmed.slice(3).trim() || `Buổi ${days.length + 1}`,
        week: weekNo,
        weekName,
        description: pendingDesc.join("\n").trim() || undefined,
        exercises: [],
      };
      pendingDesc = [];
      days.push(curDay);
      weeks[weeks.length - 1].days.push(days.length - 1);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      weekNo += 1;
      weekName = trimmed.slice(2).trim() || `Tuần ${weekNo}`;
      weeks.push({ name: weekName, days: [] });
      pendingDesc = [];
      curDay = undefined;
      continue;
    }
    // Dòng bài tập
    if (!curDay) {
      ensureWeek();
      curDay = { name: `Buổi ${days.length + 1}`, week: weekNo, weekName, exercises: [] };
      days.push(curDay);
      weeks[weeks.length - 1].days.push(days.length - 1);
    }
    const sections = trimmed.split("/").map((s) => s.trim());
    let head = sections[0];
    let label: string | undefined;
    const labelMatch = head.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    if (labelMatch) {
      label = labelMatch[1];
      head = labelMatch[2];
    }
    let namePart = head.trim();
    let eqPart: string | undefined;
    let def = findExerciseByName(namePart, customExercises);
    const comma = head.lastIndexOf(",");
    if (!def && comma > 0) {
      namePart = head.slice(0, comma).trim();
      eqPart = head.slice(comma + 1).trim();
      def = findExerciseByName(namePart, customExercises);
    }
    if (!namePart) {
      errors.push({ line: lineNo, message: "Thiếu tên bài tập" });
      continue;
    }
    let equipment: Equipment | undefined = eqPart ? parseEquipment(eqPart) : undefined;
    if (eqPart && !equipment) warnings.push({ line: lineNo, message: `Dụng cụ "${eqPart}" không rõ, dùng mặc định` });
    if (!def) unknown.add(namePart);
    equipment = equipment ?? def?.equipment ?? "barbell";
    const exerciseId = def?.id ?? slugId(namePart);
    const key = exerciseKey(label, exerciseId, equipment);

    let sets: PSet[] | undefined;
    let globalMods: Modifiers = {};
    let warmup: PSet[] | "none" | undefined;
    let superset: string | undefined;
    for (const sec of sections.slice(1)) {
      if (!sec) continue;
      if (sec.startsWith("...")) {
        warnings.push({ line: lineNo, message: `Cú pháp tái sử dụng "${sec}" chưa hỗ trợ — hãy viết đầy đủ set` });
        continue;
      }
      const kv = sec.match(/^(\w+)\s*:\s*(.*)$/);
      if (kv) {
        const k = kv[1].toLowerCase();
        const v = kv[2].trim();
        if (k === "progress") {
          const p = parseProgression(v, errors, lineNo);
          if (p) {
            if (p.type === "custom") {
              warnings.push({ line: lineNo, message: "Script custom() chưa hỗ trợ — bài này sẽ không tự tăng tạ" });
            }
            progressions[key] = p;
          }
        } else if (k === "warmup") {
          if (/^none$/i.test(v)) warmup = "none";
          else {
            const w = parseSetsSection(v, errors, lineNo);
            if (w) warmup = w;
            else errors.push({ line: lineNo, message: `Warmup không hợp lệ: "${v}"` });
          }
        } else if (k === "superset") {
          superset = v;
        } else if (k === "update" || k === "used" || k === "id") {
          // bỏ qua
        } else {
          warnings.push({ line: lineNo, message: `Bỏ qua phần "${k}:"` });
        }
        continue;
      }
      const parsedSets = parseSetsSection(sec, errors, lineNo);
      if (parsedSets) {
        if (sets) errors.push({ line: lineNo, message: "Khai báo set hai lần" });
        sets = parsedSets;
        continue;
      }
      const mods = parseModifiers(sec, errors, lineNo);
      globalMods = { ...globalMods, ...mods };
    }
    if (!sets) {
      errors.push({ line: lineNo, message: `"${namePart}": thiếu số set x rep (ví dụ 3x8)` });
      continue;
    }
    for (const s of sets) {
      if (s.weightKg == null && s.pct == null && globalMods.weightKg != null) s.weightKg = globalMods.weightKg;
      if (s.weightKg == null && s.pct == null && globalMods.pct != null) s.pct = globalMods.pct;
      if (s.rpe == null && globalMods.rpe != null) s.rpe = globalMods.rpe;
      if (s.timerSec == null && globalMods.timerSec != null) s.timerSec = globalMods.timerSec;
    }
    if (sets.every((s) => s.weightKg == null && s.pct == null && s.rpe == null)) {
      const start = def?.startKg ?? 0;
      for (const s of sets) s.weightKg = start;
      if (def?.equipment !== "bodyweight") {
        warnings.push({ line: lineNo, message: `"${namePart}": chưa ghi mức tạ, dùng ${start}kg` });
      }
    }
    // Mô tả: kế thừa từ lần xuất hiện trước nếu không có mô tả mới
    let description: string | undefined;
    if (pendingDesc.length) {
      description = pendingDesc.join("\n").trim() || undefined;
      if (description?.startsWith("...")) description = lastDescByKey.get(key);
      if (description) lastDescByKey.set(key, description);
      else lastDescByKey.delete(key);
    } else {
      description = lastDescByKey.get(key);
    }
    pendingDesc = [];
    curDay.exercises.push({
      key,
      label,
      name: def?.name ?? namePart,
      exerciseId,
      equipment,
      def,
      sets,
      warmup,
      timerSec: globalMods.timerSec,
      description,
      superset,
      line: lineNo,
    });
  }
  if (inScript) errors.push({ line: scriptStartLine, message: "Khối {~ chưa được đóng bằng ~}" });
  if (!days.length) errors.push({ line: 1, message: "Chương trình chưa có buổi tập nào (dùng ## Tên buổi)" });
  for (const d of days) {
    if (!d.exercises.length) warnings.push({ line: 1, message: `Buổi "${d.name}" chưa có bài tập` });
  }
  if (unknown.size) {
    warnings.push({
      line: 1,
      message: `Bài tập ngoài thư viện (sẽ tạo bài tự do): ${[...unknown].join(", ")}`,
    });
  }
  return { days, weeks: weeks.filter((w) => w.days.length), progressions, errors, warnings, unknownExercises: [...unknown] };
}

export function describeProgression(p?: Progression): string {
  if (!p) return "Không tự tăng";
  const w = (v: WeightValue) => (v.kind === "pct" ? `${v.value}%` : `${v.value}kg`);
  switch (p.type) {
    case "lp":
      return `Tăng tuyến tính +${w(p.inc)}${p.succAttempts > 1 ? ` sau ${p.succAttempts} buổi đạt` : ""}${
        p.dec && p.failAttempts ? `, giảm ${w(p.dec)} nếu trượt ${p.failAttempts} lần` : ""
      }`;
    case "dp":
      return `Tăng rep ${p.minReps}→${p.maxReps}, rồi +${w(p.inc)}`;
    case "sum":
      return `Tổng rep ≥ ${p.threshold} thì +${w(p.inc)}`;
    case "custom":
      return "Script tuỳ chỉnh (chưa hỗ trợ)";
    default:
      return "Không tự tăng";
  }
}

export function shortProgression(p?: Progression): string | undefined {
  if (!p) return undefined;
  const w = (v: WeightValue) => (v.kind === "pct" ? `${v.value}%` : `${v.value}kg`);
  switch (p.type) {
    case "lp":
      return `LP +${w(p.inc)}`;
    case "dp":
      return `DP ${p.minReps}–${p.maxReps} rep`;
    case "sum":
      return `Tổng ≥${p.threshold} rep`;
    default:
      return undefined;
  }
}

/** In set dạng gọn: "3×5 60kg", "1×5+ 80%". */
export function setsSummary(sets: { reps: number; minReps?: number; amrap?: boolean }[]): string {
  const groups: { count: number; text: string }[] = [];
  for (const s of sets) {
    const text = `${s.minReps ? `${s.minReps}-` : ""}${s.reps}${s.amrap ? "+" : ""}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.count++;
    else groups.push({ count: 1, text });
  }
  return groups.map((g) => `${g.count}×${g.text}`).join(", ");
}

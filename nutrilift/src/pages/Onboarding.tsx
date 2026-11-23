import { ArrowLeft, ArrowRight, Check, Cloud, Dumbbell, Flame, Scale, Sprout } from "lucide-react";
import { useState } from "react";
import { Button, Card, cx, NumberField, Segmented } from "../components/ui";
import { DEFAULT_GOALS, setKV } from "../db/db";
import type { ActivityLevel, Goals, PhaseType, Profile } from "../db/types";
import { createProgramFromText, logWeight, setActiveProgram, startPhase } from "../lib/actions";
import { today } from "../lib/date";
import { fmt } from "../lib/format";
import { navigate } from "../lib/router";
import {
  ACTIVITY_LEVELS,
  DEFAULT_FAT_PCT,
  DEFAULT_PROTEIN_PER_KG,
  macrosFor,
  phaseDailyDelta,
  PHASE_INFO,
  RATE_PRESETS,
  tdeeFormula,
  weeksToTarget,
  kcalFloor,
} from "../nutrition/calc";
import { PROGRAM_TEMPLATES } from "../training/programs";

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({ sex: "male", birthYear: 1998, heightCm: 170, activity: "moderate", formula: "mifflin" });
  const [weight, setWeight] = useState<number | undefined>(70);
  const [phase, setPhase] = useState<PhaseType>("cut");
  const [rate, setRate] = useState(-0.75);
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [proteinPerKg, setProteinPerKg] = useState(DEFAULT_PROTEIN_PER_KG.cut);
  const [templateId, setTemplateId] = useState<string | null>("cut-strength-3");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [saving, setSaving] = useState(false);

  const kg = weight ?? 70;
  const tdee = tdeeFormula(profile, kg);
  const delta = phaseDailyDelta(phase === "maintain" ? 0 : rate, kg);
  const kcal = Math.max(kcalFloor(profile.sex), Math.round(tdee + delta));
  const macros = macrosFor(kcal, kg, proteinPerKg, DEFAULT_FAT_PCT[phase], profile.heightCm);
  const weeks = target ? weeksToTarget(kg, target, phase === "maintain" ? 0 : rate) : undefined;

  const choosePhase = (p: PhaseType) => {
    setPhase(p);
    setRate(p === "cut" ? -0.75 : p === "bulk" ? 0.25 : 0);
    setProteinPerKg(DEFAULT_PROTEIN_PER_KG[p]);
    setTemplateId(p === "cut" ? "cut-strength-3" : p === "bulk" ? "upper-lower-4" : "upper-lower-4");
  };

  const steps = ["Chào mừng", "Về bạn", "Vận động", "Mục tiêu", "Luyện tập"];
  const canNext = step !== 1 || (weight && weight > 25 && profile.heightCm > 100 && profile.birthYear > 1900);

  const finish = async () => {
    setSaving(true);
    try {
      const date = today();
      const goals: Goals = {
        ...DEFAULT_GOALS,
        proteinPerKg,
        fatPct: DEFAULT_FAT_PCT[phase],
        trainingWeekdays: [...days].sort(),
      };
      await setKV("goals", goals);
      await logWeight(date, kg);
      await startPhase({ type: phase, startDate: date, startWeightKg: kg, targetWeightKg: target, ratePctPerWeek: phase === "maintain" ? 0 : rate });
      if (templateId) {
        const t = PROGRAM_TEMPLATES.find((x) => x.id === templateId)!;
        const p = await createProgramFromText(t.name, t.text, t.id);
        await setActiveProgram(p.id);
      }
      // Lưu hồ sơ CUỐI CÙNG: app chỉ rời màn hình thiết lập khi mọi dữ liệu khác đã được ghi.
      await setKV("profile", profile);
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-safe pb-6">
      <div className="flex items-center gap-2 py-4">
        <img src="./favicon.svg" alt="" className="h-8 w-8" />
        <span className="text-lg font-extrabold">NutriLift</span>
        <div className="ml-auto flex gap-1">
          {steps.map((s, i) => (
            <div key={s} className={cx("h-1.5 w-6 rounded-full", i <= step ? "bg-accent" : "bg-surface-3")} />
          ))}
        </div>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-5 pt-4">
            <h1 className="text-3xl leading-tight font-extrabold">
              Ăn đúng. Tập đúng.
              <br />
              <span className="text-accent-ink">Theo dõi trong một app.</span>
            </h1>
            <p className="text-muted">
              NutriLift kết hợp nhật ký dinh dưỡng (từ OpenNutriTracker) và trình theo dõi tập tạ với chương trình tự tăng tạ (từ Liftosaur) — giúp
              bạn cutting giữ cơ, rồi bulking tăng cơ hiệu quả.
            </p>
            <div className="grid grid-cols-1 gap-3">
              {[
                { icon: <Flame className="text-fat" />, t: "Calo & macro theo giai đoạn", d: "Cutting / duy trì / bulking, TDEE tự hiệu chỉnh theo cân nặng thực tế." },
                { icon: <Dumbbell className="text-train" />, t: "Chương trình tập tự tăng tạ", d: "Linear/double progression, đồng hồ nghỉ, tính bánh tạ, kỷ lục cá nhân." },
                { icon: <Scale className="text-protein" />, t: "Cân nặng, số đo & sức mạnh", d: "Đường xu hướng cân nặng, theo dõi giữ sức mạnh khi cutting." },
                { icon: <Cloud className="text-accent" />, t: "Điện thoại + máy tính", d: "Hoạt động ngoại tuyến, đồng bộ qua Internet (không cần chung wifi)." },
              ].map((x) => (
                <Card key={x.t} className="flex gap-3">
                  <div className="mt-0.5">{x.icon}</div>
                  <div>
                    <div className="font-semibold">{x.t}</div>
                    <div className="text-sm text-muted">{x.d}</div>
                  </div>
                </Card>
              ))}
            </div>
            <button className="w-full text-center text-sm font-semibold text-accent-ink underline-offset-2 hover:underline" onClick={() => navigate("/settings?tab=sync")}>
              Đã dùng NutriLift trên thiết bị khác? Đăng nhập để đồng bộ dữ liệu →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 pt-2">
            <h1 className="text-2xl font-extrabold">Thông tin cơ thể</h1>
            <p className="text-sm text-muted">Dùng để ước tính năng lượng tiêu hao (TDEE). Dữ liệu chỉ lưu trên thiết bị của bạn.</p>
            <div>
              <div className="mb-1 text-sm font-medium">Giới tính sinh học</div>
              <Segmented
                value={profile.sex}
                onChange={(v) => setProfile({ ...profile, sex: v })}
                options={[
                  { value: "male", label: "Nam" },
                  { value: "female", label: "Nữ" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Năm sinh" value={profile.birthYear} onChange={(v) => setProfile({ ...profile, birthYear: v ?? 0 })} />
              <NumberField label="Chiều cao" suffix="cm" value={profile.heightCm} onChange={(v) => setProfile({ ...profile, heightCm: v ?? 0 })} />
              <NumberField label="Cân nặng hiện tại" suffix="kg" value={weight} onChange={setWeight} step={0.1} />
              <NumberField
                label="% mỡ cơ thể"
                hint="tuỳ chọn"
                suffix="%"
                value={profile.bodyFatPct}
                onChange={(v) => setProfile({ ...profile, bodyFatPct: v, formula: v ? profile.formula : profile.formula === "katch" ? "mifflin" : profile.formula })}
              />
            </div>
            {profile.bodyFatPct ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={profile.formula === "katch"} onChange={(e) => setProfile({ ...profile, formula: e.target.checked ? "katch" : "mifflin" })} />
                Dùng công thức Katch-McArdle (chính xác hơn khi biết % mỡ)
              </label>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 pt-2">
            <h1 className="text-2xl font-extrabold">Mức độ vận động</h1>
            <p className="text-sm text-muted">Tính cả buổi tập tạ và công việc hằng ngày. Đừng lo chọn sai — app sẽ tự hiệu chỉnh TDEE theo dữ liệu thực tế sau 2–3 tuần.</p>
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.id}
                onClick={() => setProfile({ ...profile, activity: a.id as ActivityLevel })}
                className={cx(
                  "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                  profile.activity === a.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
                )}
              >
                <div className="flex-1">
                  <div className="font-semibold">{a.label}</div>
                  <div className="text-sm text-muted">{a.desc}</div>
                </div>
                {profile.activity === a.id && <Check className="text-accent-ink" />}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 pt-2">
            <h1 className="text-2xl font-extrabold">Giai đoạn hiện tại</h1>
            <div className="grid grid-cols-3 gap-2">
              {(["cut", "maintain", "bulk"] as PhaseType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => choosePhase(p)}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition",
                    phase === p ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
                  )}
                >
                  {p === "cut" ? <Flame className="text-fat" /> : p === "bulk" ? <Sprout className="text-accent" /> : <Scale className="text-protein" />}
                  <span className="text-sm font-bold">{PHASE_INFO[p].label}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">{PHASE_INFO[phase].desc}</p>
            {phase !== "maintain" && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Tốc độ mong muốn</div>
                {RATE_PRESETS[phase].map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRate(r.value)}
                    className={cx(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition",
                      rate === r.value ? "border-accent bg-accent-soft font-semibold" : "border-line bg-surface"
                    )}
                  >
                    <span>{r.label}</span>
                    <span className="tabular text-muted">{fmt((kg * r.value) / 100, 2)} kg/tuần</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Cân nặng mục tiêu" hint="tuỳ chọn" suffix="kg" value={target} onChange={setTarget} step={0.5} />
              <NumberField label="Protein" suffix="g/kg" value={proteinPerKg} onChange={(v) => setProteinPerKg(v ?? 2)} step={0.1} stepper />
            </div>
            <Card className="bg-surface-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Mục tiêu mỗi ngày</span>
                <span className="text-2xl font-extrabold tabular">{fmt(kcal)} kcal</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                TDEE ước tính {fmt(tdee)} kcal {delta < 0 ? "−" : "+"} {fmt(Math.abs(delta))} kcal
                {weeks ? ` · đạt mục tiêu sau ~${weeks} tuần` : ""}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-surface p-2">
                  <div className="font-bold text-protein">{fmt(macros.protein)}g</div>
                  <div className="text-xs text-muted">Protein</div>
                </div>
                <div className="rounded-xl bg-surface p-2">
                  <div className="font-bold text-carbs">{fmt(macros.carbs)}g</div>
                  <div className="text-xs text-muted">Carb</div>
                </div>
                <div className="rounded-xl bg-surface p-2">
                  <div className="font-bold text-fat">{fmt(macros.fat)}g</div>
                  <div className="text-xs text-muted">Chất béo</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 pt-2">
            <h1 className="text-2xl font-extrabold">Chương trình tập</h1>
            <div>
              <div className="mb-1 text-sm font-medium">Ngày tập dự kiến trong tuần</div>
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((l, i) => {
                  const d = i + 1;
                  const on = days.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                      className={cx("h-10 flex-1 rounded-xl text-sm font-bold transition", on ? "bg-train text-white dark:text-slate-950" : "bg-surface-2 text-muted")}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              {PROGRAM_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={cx(
                    "w-full rounded-2xl border p-3 text-left transition",
                    templateId === t.id ? "border-train bg-train-soft" : "border-line bg-surface hover:bg-surface-2"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{t.name}</span>
                    <span className="shrink-0 text-xs text-muted">{t.daysPerWeek}</span>
                  </div>
                  <div className="text-sm text-muted">{t.short}</div>
                </button>
              ))}
              <button
                onClick={() => setTemplateId(null)}
                className={cx("w-full rounded-2xl border p-3 text-left text-sm", templateId === null ? "border-train bg-train-soft" : "border-line bg-surface")}
              >
                Bỏ qua — tôi sẽ tự tạo hoặc dán chương trình từ Liftosaur sau
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex gap-2 bg-bg pt-4 pb-safe">
        {step > 0 && (
          <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)} icon={<ArrowLeft size={18} />}>
            Quay lại
          </Button>
        )}
        {step < 4 ? (
          <Button className="flex-1" size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {step === 0 ? "Bắt đầu" : "Tiếp tục"} <ArrowRight size={18} />
          </Button>
        ) : (
          <Button className="flex-1" size="lg" disabled={saving} onClick={finish} icon={<Check size={18} />}>
            Hoàn tất
          </Button>
        )}
      </div>
    </div>
  );
}

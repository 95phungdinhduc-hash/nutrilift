import { CheckCircle2, CloudUpload, Download, ExternalLink, LogIn, LogOut, RefreshCw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, cx, NumberField, Segmented, Select, SectionTitle, TextField, Toggle, toast } from "../components/ui";
import { alive, db, DEFAULT_GOALS, DEFAULT_PROFILE, putMany, setKV } from "../db/db";
import type { BmrFormula, Goals, Profile, Settings } from "../db/types";
import { deleteAllData } from "../lib/actions";
import { formatTime } from "../lib/date";
import { withCircleTransition } from "../lib/fx";
import type { AccentName } from "../db/types";
import { fmt } from "../lib/format";
import { useGoals, useProfile, useSettings, useTargets, useToday } from "../lib/hooks";
import { navigate, useLocation } from "../lib/router";
import { ACTIVITY_LEVELS } from "../nutrition/calc";
import { backupFileName, downloadJson, exportBackup, importBackup, validateBackup } from "../sync/backup";
import { getCloudConfig, setCloudConfig, signIn, signOut, signUp, startSync, subscribeSyncStatus, syncNow, testConnection, type SyncStatus } from "../sync/cloud";

const ACCENTS: { id: AccentName; label: string; c1: string; c2: string }[] = [
  { id: "emerald", label: "Ngọc", c1: "#10b981", c2: "#14b8a6" },
  { id: "ocean", label: "Đại dương", c1: "#0ea5e9", c2: "#6366f1" },
  { id: "violet", label: "Tím", c1: "#8b5cf6", c2: "#d946ef" },
  { id: "sunset", label: "Hoàng hôn", c1: "#f59e0b", c2: "#ef4444" },
  { id: "rose", label: "Hồng", c1: "#ec4899", c2: "#f43f5e" },
];

type Tab = "profile" | "goals" | "training" | "sync" | "data";

function ProfileSection() {
  const { profile } = useProfile();
  const p = profile ?? DEFAULT_PROFILE;
  const save = (patch: Partial<Profile>) => setKV("profile", { ...p, ...patch });
  return (
    <Card className="space-y-3">
      <TextField label="Tên hiển thị" hint="tuỳ chọn" value={p.name ?? ""} onChange={(e) => save({ name: e.target.value || undefined })} />
      <div>
        <div className="mb-1 text-sm font-medium">Giới tính sinh học</div>
        <Segmented value={p.sex} onChange={(v) => save({ sex: v })} options={[{ value: "male", label: "Nam" }, { value: "female", label: "Nữ" }]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Năm sinh" value={p.birthYear} onChange={(v) => v && v > 1900 && save({ birthYear: v })} />
        <NumberField label="Chiều cao" suffix="cm" value={p.heightCm} onChange={(v) => v && v > 100 && save({ heightCm: v })} />
        <NumberField label="% mỡ cơ thể" hint="tuỳ chọn" suffix="%" value={p.bodyFatPct} onChange={(v) => save({ bodyFatPct: v })} />
        <Select<BmrFormula>
          label="Công thức BMR/TDEE"
          value={p.formula}
          onChange={(v) => save({ formula: v })}
          options={[
            { value: "mifflin", label: "Mifflin-St Jeor" },
            { value: "iom2005", label: "IOM 2005 (như OpenNutriTracker)" },
            { value: "katch", label: "Katch-McArdle (cần % mỡ)" },
          ]}
        />
      </div>
      <Select
        label="Mức độ vận động"
        value={p.activity}
        onChange={(v) => save({ activity: v })}
        options={ACTIVITY_LEVELS.map((a) => ({ value: a.id, label: `${a.label} — ${a.desc}` }))}
      />
    </Card>
  );
}

function GoalsSection() {
  const g = useGoals();
  const date = useToday();
  const targets = useTargets(date);
  const save = (patch: Partial<Goals>) => setKV("goals", { ...g, ...patch });
  return (
    <div className="stagger space-y-4">
      {targets && (
        <Card className="bg-surface-2">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted">TDEE đang dùng</div>
              <div className="tabular font-bold">{fmt(targets.tdee)} kcal</div>
            </div>
            <div>
              <div className="text-xs text-muted">Điều chỉnh giai đoạn</div>
              <div className="tabular font-bold">
                {targets.phaseDelta > 0 ? "+" : ""}
                {fmt(targets.phaseDelta)} kcal
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Mục tiêu hôm nay</div>
              <div className="tabular font-bold text-accent-ink">{fmt(targets.kcal)} kcal</div>
            </div>
            <div>
              <div className="text-xs text-muted">P / C / F</div>
              <div className="tabular font-bold">
                {targets.protein} / {targets.carbs} / {targets.fat} g
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card className="space-y-3">
        <Segmented
          value={g.mode}
          onChange={(v) => save({ mode: v, manualKcal: v === "manual" ? g.manualKcal ?? targets?.kcal : g.manualKcal })}
          options={[
            { value: "auto", label: "Tự động theo giai đoạn" },
            { value: "manual", label: "Tự đặt" },
          ]}
        />
        {g.mode === "auto" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Protein" suffix="g/kg" value={g.proteinPerKg} onChange={(v) => v && save({ proteinPerKg: v })} step={0.1} stepper />
              <NumberField label="Chất béo" suffix="% kcal" value={g.fatPct} onChange={(v) => v && save({ fatPct: v })} step={1} stepper />
            </div>
            <NumberField label="Tinh chỉnh calo" hint="cộng/trừ vào mục tiêu" suffix="kcal" value={g.kcalAdjust} onChange={(v) => save({ kcalAdjust: v ?? 0 })} step={50} stepper />
            <Select
              label="Nguồn TDEE"
              value={g.tdeeMode}
              onChange={(v) => save({ tdeeMode: v })}
              options={[
                { value: "formula", label: "Công thức (theo hồ sơ)" },
                { value: "adaptive", label: `Thích ứng theo dữ liệu thực tế${g.tdeeSnapshot ? ` (${fmt(g.tdeeSnapshot.value)} kcal)` : " — cần check-in hằng tuần"}` },
              ]}
            />
            <p className="text-xs text-muted">Khuyến nghị: protein 1,8–2,4 g/kg khi cutting để giữ cơ; 1,6–2,0 g/kg khi bulking. Carb được tính từ phần calo còn lại.</p>
          </>
        ) : (
          <>
            <NumberField label="Calo mỗi ngày" suffix="kcal" value={g.manualKcal} onChange={(v) => save({ manualKcal: v })} step={50} />
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Protein" suffix="g" value={g.manualProtein} onChange={(v) => save({ manualProtein: v })} />
              <NumberField label="Carb" suffix="g" value={g.manualCarbs} onChange={(v) => save({ manualCarbs: v })} />
              <NumberField label="Béo" suffix="g" value={g.manualFat} onChange={(v) => save({ manualFat: v })} />
            </div>
            <p className="text-xs text-muted">
              Macro hiện tại = {fmt((g.manualProtein ?? 0) * 4 + (g.manualCarbs ?? 0) * 4 + (g.manualFat ?? 0) * 9)} kcal. Để trống macro để app tự chia theo g/kg.
            </p>
          </>
        )}
      </Card>
      <Card className="space-y-3">
        <SectionTitle>Ngày tập & calorie cycling</SectionTitle>
        <div className="flex gap-1.5">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((l, i) => {
            const d = i + 1;
            const on = g.trainingWeekdays.includes(d);
            return (
              <button
                key={d}
                onClick={() => save({ trainingWeekdays: on ? g.trainingWeekdays.filter((x) => x !== d) : [...g.trainingWeekdays, d].sort() })}
                className={cx("h-9 flex-1 rounded-xl text-sm font-bold", on ? "bg-train text-white dark:text-slate-950" : "bg-surface-2 text-muted")}
              >
                {l}
              </button>
            );
          })}
        </div>
        <NumberField
          label="Thêm calo vào ngày tập"
          hint="0 = tắt; ngày nghỉ tự giảm để giữ trung bình tuần"
          suffix="kcal"
          value={g.trainingDayBonus}
          onChange={(v) => save({ trainingDayBonus: v ?? 0 })}
          step={50}
          stepper
        />
        <Select
          label="Cộng calo vận động đã ghi vào mục tiêu"
          value={String(g.activityKcalFactor)}
          onChange={(v) => save({ activityKcalFactor: Number(v) })}
          options={[
            { value: "0", label: "Không cộng (khuyên dùng — đã tính trong mức vận động)" },
            { value: "0.5", label: "Cộng 50%" },
            { value: "0.72", label: "Cộng 72% (mặc định OpenNutriTracker)" },
            { value: "1", label: "Cộng 100%" },
          ]}
        />
        <NumberField label="Mục tiêu nước" suffix="ml" value={g.waterMl} onChange={(v) => v && save({ waterMl: v })} step={250} stepper />
      </Card>
      <Button variant="ghost" onClick={() => setKV("goals", { ...DEFAULT_GOALS, trainingWeekdays: g.trainingWeekdays })}>
        Khôi phục mặc định
      </Button>
    </div>
  );
}

function TrainingSection() {
  const s = useSettings();
  const save = (patch: Partial<Settings>) => setKV("settings", { ...s, ...patch });
  const [platesText, setPlatesText] = useState(s.plates.join(", "));
  useEffect(() => setPlatesText(s.plates.join(", ")), [s.plates]);
  return (
    <Card className="space-y-3">
      <NumberField label="Thời gian nghỉ mặc định" suffix="giây" value={s.restTimerSec} onChange={(v) => v && save({ restTimerSec: v })} step={15} stepper />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Đòn tạ (barbell)" suffix="kg" value={s.barKg} onChange={(v) => v != null && save({ barKg: v })} step={2.5} />
        <NumberField label="Bước tạ đơn" suffix="kg" value={s.dumbbellStepKg} onChange={(v) => v && save({ dumbbellStepKg: v })} step={0.5} />
        <NumberField label="Bước máy" suffix="kg" value={s.machineStepKg} onChange={(v) => v && save({ machineStepKg: v })} step={0.5} />
        <NumberField label="Bước cáp" suffix="kg" value={s.cableStepKg} onChange={(v) => v && save({ cableStepKg: v })} step={0.5} />
      </div>
      <TextField
        label="Bánh tạ có sẵn (kg, cách nhau dấu phẩy)"
        value={platesText}
        onChange={(e) => setPlatesText(e.target.value)}
        onBlur={() => {
          const arr = platesText
            .split(/[,;\s]+/)
            .map((x) => parseFloat(x.replace(",", ".")))
            .filter((x) => x > 0);
          if (arr.length) save({ plates: [...new Set(arr)].sort((a, b) => b - a) });
        }}
      />
      <Toggle checked={s.autoWarmups} onChange={(v) => save({ autoWarmups: v })} label="Tự thêm set khởi động" desc="30% → 50% → 80% mức tạ chính (như Liftosaur)" />
      <Toggle checked={s.sound} onChange={(v) => save({ sound: v })} label="Âm báo hết giờ nghỉ" />
      <Toggle checked={s.vibrate} onChange={(v) => save({ vibrate: v })} label="Rung khi hết giờ nghỉ" />
      <Toggle checked={s.keepAwake} onChange={(v) => save({ keepAwake: v })} label="Giữ màn hình sáng khi tập" />
      {"Notification" in window && Notification.permission !== "granted" && (
        <Button size="sm" variant="secondary" onClick={() => Notification.requestPermission()}>
          Cho phép thông báo (báo hết giờ nghỉ khi app chạy nền)
        </Button>
      )}
    </Card>
  );
}

function SyncSection() {
  const [status, setStatus] = useState<SyncStatus>({ state: "off" });
  const cfg = getCloudConfig();
  const [url, setUrl] = useState(cfg?.url ?? "");
  const [key, setKey] = useState(cfg?.anonKey ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  const signedIn = status.state === "idle" || status.state === "syncing" || status.state === "error" || status.state === "offline";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stagger space-y-4">
      <Card className="space-y-2 text-sm">
        <div className="font-semibold">Dùng trên điện thoại + máy tính qua Internet</div>
        <p className="text-muted">
          Dữ liệu luôn lưu trên thiết bị (dùng được khi mất mạng). Để đồng bộ giữa các thiết bị mà không cần chung wifi, kết nối một dự án <b>Supabase</b> miễn phí của riêng bạn — chỉ bạn giữ dữ liệu.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            Tạo dự án miễn phí tại{" "}
            <a className="font-semibold text-accent-ink" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
              supabase.com <ExternalLink size={12} className="inline" />
            </a>
          </li>
          <li>
            Mở <b>SQL Editor</b>, dán nội dung file <code>supabase/schema.sql</code> trong mã nguồn → Run.
          </li>
          <li>
            Vào <b>Project Settings → API</b>, sao chép <b>Project URL</b> và khoá <b>anon public</b> vào ô dưới.
          </li>
          <li>Tạo tài khoản (email + mật khẩu) rồi đăng nhập cùng tài khoản đó trên mọi thiết bị.</li>
        </ol>
      </Card>
      <Card className="space-y-3">
        <TextField label="Project URL" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        <TextField label="Anon public key" placeholder="eyJhbGciOi..." value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !url || !key}
            onClick={() =>
              run(async () => {
                const err = await testConnection({ url: url.trim(), anonKey: key.trim() });
                if (err) throw new Error(err);
                setCloudConfig({ url, anonKey: key });
                await startSync();
                await syncNow();
                toast("Kết nối máy chủ thành công");
              })
            }
            icon={<CheckCircle2 size={18} />}
          >
            Lưu & kiểm tra
          </Button>
          {cfg && (
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut().catch(() => {});
                setCloudConfig(undefined);
                setUrl("");
                setKey("");
                toast("Đã tắt đồng bộ", "info");
              }}
            >
              Tắt đồng bộ
            </Button>
          )}
        </div>
      </Card>
      {cfg && (
        <Card className="space-y-3">
          {signedIn ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted">Đã đăng nhập</div>
                  <div className="font-semibold">{status.email}</div>
                </div>
                <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={() => signOut()}>
                  Đăng xuất
                </Button>
              </div>
              <div className="text-sm">
                Trạng thái:{" "}
                <b className={status.state === "error" ? "text-danger" : ""}>
                  {{ idle: "Đã đồng bộ", syncing: "Đang đồng bộ…", error: "Lỗi", offline: "Ngoại tuyến", off: "", signed_out: "" }[status.state]}
                </b>
                {status.lastSync && <span className="text-muted"> · lần cuối {formatTime(status.lastSync)}</span>}
                {status.pending ? <span className="text-muted"> · {status.pending} thay đổi chờ gửi</span> : null}
                {status.error && <div className="mt-1 text-xs text-danger">{status.error}</div>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" icon={<RefreshCw size={16} />} onClick={() => syncNow()}>
                  Đồng bộ ngay
                </Button>
                <Button size="sm" variant="secondary" icon={<CloudUpload size={16} />} onClick={() => syncNow({ full: true }).then(() => toast("Đã đồng bộ toàn bộ"))}>
                  Đồng bộ lại toàn bộ
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">Tài khoản đồng bộ</div>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <TextField label="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={busy || !email || password.length < 6}
                  icon={<LogIn size={18} />}
                  onClick={() =>
                    run(async () => {
                      await signIn(email.trim(), password);
                      toast("Đăng nhập thành công — đang đồng bộ");
                      navigate("/", { replace: true });
                    })
                  }
                >
                  Đăng nhập
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !email || password.length < 6}
                  onClick={() =>
                    run(async () => {
                      const r = await signUp(email.trim(), password);
                      if (r.needsConfirm) setMsg("Đã tạo tài khoản. Hãy mở email xác nhận, sau đó quay lại đây đăng nhập.");
                      else {
                        await signIn(email.trim(), password);
                        toast("Đã tạo tài khoản và đăng nhập");
                      }
                    })
                  }
                >
                  Tạo tài khoản
                </Button>
              </div>
              <p className="text-xs text-muted">Mật khẩu tối thiểu 6 ký tự. Khi đăng nhập trên thiết bị đã có dữ liệu, hai bên sẽ được gộp (giữ bản sửa mới nhất).</p>
            </>
          )}
        </Card>
      )}
      {msg && <Card className="text-sm text-danger">{msg}</Card>}
    </div>
  );
}

function ImportSection() {
  const liftoRef = useRef<HTMLInputElement>(null);
  const ontRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e: any) {
      toast(e?.message ?? String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <SectionTitle>Chuyển dữ liệu từ app cũ</SectionTitle>
      <div className="space-y-1 text-sm">
        <div className="font-semibold">Liftosaur — lịch sử tập</div>
        <p className="text-muted">Trong Liftosaur: Cài đặt (Settings) → Export → “Export history to CSV”. Bài tập trùng tên được nối với thư viện, bài lạ thành bài tự tạo.</p>
        <input
          ref={liftoRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            await run(async () => {
              const { importLiftosaurCsv } = await import("../sync/importers");
              const existing = alive(await db.exercises.toArray());
              const r = importLiftosaurCsv(await f.text(), existing);
              await putMany("exercises", r.customExercises);
              await putMany("workouts", r.workouts);
              return `Đã nhập ${r.workouts.length} buổi tập${r.customExercises.length ? `, ${r.customExercises.length} bài tự tạo` : ""} từ Liftosaur.`;
            });
          }}
        />
        <Button size="sm" variant="secondary" disabled={busy} icon={<Upload size={16} />} onClick={() => liftoRef.current?.click()}>
          Chọn file CSV Liftosaur
        </Button>
      </div>
      <div className="space-y-1 border-t border-line pt-3 text-sm">
        <div className="font-semibold">OpenNutriTracker — nhật ký ăn, cân nặng, vận động</div>
        <p className="text-muted">Trong OpenNutriTracker: Cài đặt → Xuất/Nhập dữ liệu → Xuất (JSON). Chọn file .zip vừa xuất (hoặc file user_intake.json).</p>
        <input
          ref={ontRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            await run(async () => {
              const { readOntExport } = await import("../sync/importers");
              const r = await readOntExport(f);
              await putMany("foodLogs", r.foodLogs);
              await putMany("weights", r.weights);
              await putMany("activityLogs", r.activities);
              return `Đã nhập ${r.foodLogs.length} món ăn, ${r.weights.length} lần cân, ${r.activities.length} hoạt động từ OpenNutriTracker.`;
            });
          }}
        />
        <Button size="sm" variant="secondary" disabled={busy} icon={<Upload size={16} />} onClick={() => ontRef.current?.click()}>
          Chọn file ZIP/JSON OpenNutriTracker
        </Button>
      </div>
      {result && <div className="rounded-xl bg-accent-soft p-2.5 text-sm text-accent-ink">{result}</div>}
      <p className="text-xs text-muted">Nhập lại cùng một file không tạo bản trùng (mỗi bản ghi có mã cố định).</p>
    </Card>
  );
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const s = useSettings();
  const saveS = (patch: Partial<Settings>) => setKV("settings", { ...s, ...patch });
  return (
    <div className="stagger space-y-4">
      <Card className="space-y-3">
        <SectionTitle>Sao lưu</SectionTitle>
        <p className="text-sm text-muted">Xuất toàn bộ dữ liệu ra file JSON để lưu trữ hoặc chuyển sang thiết bị khác khi không dùng đồng bộ đám mây.</p>
        <Button icon={<Download size={18} />} onClick={async () => downloadJson(await exportBackup(), backupFileName())}>
          Xuất bản sao lưu
        </Button>
        <div className="border-t border-line pt-3">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "merge", label: "Gộp (giữ bản mới hơn)" },
              { value: "replace", label: "Thay thế toàn bộ" },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                if (!validateBackup(data)) throw new Error("File không phải bản sao lưu NutriLift");
                if (mode === "replace" && !confirm("Thay thế TOÀN BỘ dữ liệu hiện tại bằng bản sao lưu?")) return;
                const n = await importBackup(data, mode);
                toast(`Đã nhập ${n} bản ghi`);
              } catch (err: any) {
                toast(err?.message ?? "Không đọc được file", "error");
              }
            }}
          />
          <Button className="mt-2" variant="secondary" icon={<Upload size={18} />} onClick={() => fileRef.current?.click()}>
            Nhập bản sao lưu
          </Button>
        </div>
      </Card>
      <ImportSection />
      <Card className="space-y-2">
        <SectionTitle>Nguồn thực phẩm trực tuyến</SectionTitle>
        <Toggle checked={s.onlineSources.off} onChange={(v) => saveS({ onlineSources: { ...s.onlineSources, off: v } })} label="Open Food Facts" desc="CSDL mở, có nhiều sản phẩm đóng gói tại Việt Nam; tra mã vạch" />
        <Toggle checked={s.onlineSources.fdc} onChange={(v) => saveS({ onlineSources: { ...s.onlineSources, fdc: v } })} label="USDA FoodData Central" desc="Thực phẩm cơ bản (tên tiếng Anh)" />
        <TextField
          label="USDA API key"
          hint={
            <a className="text-accent-ink" href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noreferrer">
              lấy miễn phí
            </a>
          }
          placeholder="Để trống = DEMO_KEY (giới hạn lượt)"
          value={s.fdcApiKey ?? ""}
          onChange={(e) => saveS({ fdcApiKey: e.target.value || undefined })}
        />
      </Card>
      <Card className="space-y-2">
        <SectionTitle>Giao diện</SectionTitle>
        <Segmented
          value={s.theme}
          onChange={(v) => {
            const dark = v === "dark" || (v === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            withCircleTransition(() => document.documentElement.classList.toggle("dark", dark), window.innerWidth / 2, window.innerHeight / 2);
            saveS({ theme: v });
          }}
          options={[
            { value: "system", label: "Theo hệ thống" },
            { value: "light", label: "Sáng" },
            { value: "dark", label: "Tối" },
          ]}
        />
        <div className="pt-2 text-sm font-medium">Màu chủ đạo</div>
        <div className="grid grid-cols-5 gap-2">
          {ACCENTS.map((a) => {
            const active = (s.accent ?? "emerald") === a.id;
            return (
              <button
                key={a.id}
                aria-label={a.label}
                title={a.label}
                onClick={(e) => {
                  withCircleTransition(
                    () => {
                      if (a.id === "emerald") document.documentElement.removeAttribute("data-accent");
                      else document.documentElement.setAttribute("data-accent", a.id);
                    },
                    e.clientX,
                    e.clientY
                  );
                  saveS({ accent: a.id });
                }}
                className={cx(
                  "group flex flex-col items-center gap-1.5 rounded-2xl p-2 text-[11px] font-semibold transition",
                  active ? "bg-surface-2 text-ink ring-2 ring-accent" : "text-muted hover:bg-surface-2"
                )}
              >
                <span
                  className="h-9 w-9 rounded-full shadow-[0_6px_16px_-6px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-110 group-active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${a.c1}, ${a.c2})` }}
                />
                {a.label}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="space-y-2 text-sm">
        <SectionTitle>Giới thiệu</SectionTitle>
        <p>
          <b>NutriLift</b> kết hợp và mở rộng hai dự án mã nguồn mở:{" "}
          <a className="text-accent-ink" href="https://github.com/simonoppowa/OpenNutriTracker" target="_blank" rel="noreferrer">
            OpenNutriTracker
          </a>{" "}
          (GPL-3.0) — công thức TDEE/MET, nguồn Open Food Facts & USDA; và{" "}
          <a className="text-accent-ink" href="https://github.com/astashov/liftosaur" target="_blank" rel="noreferrer">
            Liftosaur
          </a>{" "}
          (AGPL-3.0) — cú pháp Liftoscript, thư viện bài tập, quy tắc tăng tạ, khởi động.
        </p>
        <p className="text-muted">Phát hành theo giấy phép AGPL-3.0. Giá trị dinh dưỡng và calo chỉ mang tính tham khảo, không thay thế tư vấn y tế.</p>
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            if (!confirm("Xoá TOÀN BỘ dữ liệu trên thiết bị này? (Dữ liệu trên máy chủ đồng bộ không bị xoá)")) return;
            await deleteAllData();
            location.reload();
          }}
        >
          Xoá dữ liệu trên thiết bị
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { query } = useLocation();
  const { profile } = useProfile();
  const tab = (query.get("tab") as Tab) || (profile ? "profile" : "sync");
  return (
    <div className="stagger mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold">Cài đặt</h1>
      {!profile && (
        <Card className="text-sm">
          Đăng nhập đồng bộ để tải dữ liệu từ thiết bị khác, hoặc{" "}
          <button className="font-semibold text-accent-ink" onClick={() => navigate("/")}>
            quay lại thiết lập ban đầu
          </button>
          .
        </Card>
      )}
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
        <Segmented
          className="min-w-max"
          value={tab}
          onChange={(v) => navigate(`/settings?tab=${v}`, { replace: true })}
          options={[
            { value: "profile", label: "Hồ sơ" },
            { value: "goals", label: "Mục tiêu" },
            { value: "training", label: "Tập luyện" },
            { value: "sync", label: "Đồng bộ" },
            { value: "data", label: "Dữ liệu & khác" },
          ]}
        />
      </div>
      {tab === "profile" && <ProfileSection />}
      {tab === "goals" && <GoalsSection />}
      {tab === "training" && <TrainingSection />}
      {tab === "sync" && <SyncSection />}
      {tab === "data" && <DataSection />}
      <div className="pt-2 text-center text-xs text-muted">NutriLift v{__APP_VERSION__}</div>
    </div>
  );
}


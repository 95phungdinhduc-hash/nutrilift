// Mô hình dữ liệu NutriLift. Mọi bản ghi đồng bộ đều có id + updatedAt (+ deleted khi xoá mềm).

export interface SyncMeta {
  id: string;
  updatedAt: number;
  deleted?: 0 | 1;
}

// ---------- Hồ sơ & mục tiêu ----------
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type BmrFormula = "mifflin" | "iom2005" | "katch";
export type PhaseType = "cut" | "maintain" | "bulk";

export interface Profile {
  name?: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activity: ActivityLevel;
  bodyFatPct?: number;
  formula: BmrFormula;
}

export interface Goals {
  /** "auto": tính từ TDEE + giai đoạn; "manual": người dùng tự đặt kcal/macro. */
  mode: "auto" | "manual";
  manualKcal?: number;
  manualProtein?: number;
  manualCarbs?: number;
  manualFat?: number;
  /** Gam protein / kg cân nặng (chế độ auto). */
  proteinPerKg: number;
  /** % năng lượng từ chất béo (chế độ auto). */
  fatPct: number;
  /** Nguồn TDEE: công thức hay ước tính thích ứng từ dữ liệu thực tế. */
  tdeeMode: "formula" | "adaptive";
  tdeeSnapshot?: { value: number; date: string };
  /** Tinh chỉnh tay (+/- kcal). */
  kcalAdjust: number;
  waterMl: number;
  /** Chênh lệch kcal ngày tập so với ngày nghỉ (0 = tắt calorie cycling). */
  trainingDayBonus: number;
  /** Ngày tập dự kiến: 1 = T2 ... 7 = CN. */
  trainingWeekdays: number[];
  /** Hệ số cộng calo vận động vào mục tiêu (0 = không cộng). */
  activityKcalFactor: number;
}

export interface Phase extends SyncMeta {
  type: PhaseType;
  startDate: string;
  endDate?: string;
  startWeightKg: number;
  targetWeightKg?: number;
  /** % cân nặng mỗi tuần: âm = giảm (cut), dương = tăng (bulk). */
  ratePctPerWeek: number;
  note?: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  restTimerSec: number;
  barKg: number;
  /** Các loại bánh tạ có sẵn (kg, một bên). */
  plates: number[];
  dumbbellStepKg: number;
  machineStepKg: number;
  cableStepKg: number;
  autoWarmups: boolean;
  sound: boolean;
  vibrate: boolean;
  keepAwake: boolean;
  fdcApiKey?: string;
  onlineSources: { off: boolean; fdc: boolean };
}

// ---------- Cân nặng & số đo ----------
export interface WeightEntry extends SyncMeta {
  date: string;
  kg: number;
  note?: string;
}

export interface Measurement extends SyncMeta {
  date: string;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  neckCm?: number;
  bodyFatPct?: number;
  note?: string;
}

// ---------- Dinh dưỡng ----------
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  sodiumMg?: number;
}

export interface Serving {
  label: string;
  grams: number;
}

export type FoodSource = "custom" | "recipe" | "off" | "fdc" | "vn" | "quick";

export interface RecipeItem {
  name: string;
  grams: number;
  per100: Nutrients;
  foodId?: string;
}

export interface Food extends SyncMeta {
  name: string;
  brand?: string;
  barcode?: string;
  source: FoodSource;
  sourceId?: string;
  /** Giá trị dinh dưỡng trên 100 g (hoặc 100 ml). */
  per100: Nutrients;
  servings: Serving[];
  unit?: "g" | "ml";
  favorite?: 0 | 1;
  imageUrl?: string;
  category?: string;
  /** Từ khoá tìm kiếm phụ. */
  aliases?: string;
  recipe?: { items: RecipeItem[]; totalGrams: number; portions: number };
}

export interface FoodLog extends SyncMeta {
  date: string;
  meal: MealType;
  foodId?: string;
  source: FoodSource;
  name: string;
  brand?: string;
  grams: number;
  servingLabel?: string;
  servingQty?: number;
  /** Tổng dinh dưỡng của mục này. */
  n: Nutrients;
  /** Dinh dưỡng /100 g để sửa khẩu phần sau này. */
  per100?: Nutrients;
  createdAt: number;
}

export interface WaterLog extends SyncMeta {
  date: string;
  ml: number;
  createdAt: number;
}

export interface ActivityLog extends SyncMeta {
  date: string;
  code: string;
  name: string;
  met: number;
  minutes: number;
  kcal: number;
  createdAt: number;
}

// ---------- Luyện tập ----------
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "leverageMachine"
  | "smith"
  | "kettlebell"
  | "bodyweight"
  | "band"
  | "ezbar"
  | "trapbar"
  | "medicineball";

export type MuscleGroup =
  | "chest"
  | "back"
  | "traps"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "calves"
  | "abs"
  | "lower_back";

export interface CustomExercise extends SyncMeta {
  name: string;
  nameVi?: string;
  equipment: Equipment;
  target: MuscleGroup[];
  synergist: MuscleGroup[];
}

export interface ExerciseProgress {
  /** Kg cộng thêm vào mức tạ ghi trong văn bản chương trình. */
  weightDelta: number;
  /** Số rep cộng thêm (double progression). */
  repsDelta: number;
  /** 1RM dùng cho các set theo % hoặc RPE. */
  rm1?: number;
  succ: number;
  fail: number;
  updatedAt?: number;
}

export interface Program extends SyncMeta {
  name: string;
  text: string;
  description?: string;
  templateId?: string;
  progress: Record<string, ExerciseProgress>;
  /** Chỉ số buổi tiếp theo trong danh sách buổi (đã trải phẳng qua các tuần). */
  nextDay: number;
  createdAt: number;
}

export interface WorkoutSet {
  reps: number;
  minReps?: number;
  weight: number;
  rpe?: number;
  amrap?: boolean;
  warmup?: boolean;
  done: boolean;
  doneReps?: number;
  doneWeight?: number;
  doneRpe?: number;
  label?: string;
}

export interface WorkoutExercise {
  uid: string;
  key: string;
  exerciseId: string;
  name: string;
  equipment: Equipment;
  sets: WorkoutSet[];
  restSec?: number;
  notes?: string;
  description?: string;
  progressLabel?: string;
  superset?: string;
}

export interface Workout extends SyncMeta {
  date: string;
  startedAt: number;
  endedAt?: number;
  programId?: string;
  programName?: string;
  dayIndex?: number;
  dayName?: string;
  exercises: WorkoutExercise[];
  notes?: string;
  bodyweightKg?: number;
  kcal?: number;
  progressSummary?: string[];
}

// ---------- Kho khoá-giá trị đồng bộ ----------
export interface KV<T = unknown> extends SyncMeta {
  value: T;
}

export type KVKey = "profile" | "goals" | "settings" | "activeWorkout" | "activeProgramId";

export const SYNC_TABLES = [
  "kv",
  "phases",
  "weights",
  "measurements",
  "foods",
  "foodLogs",
  "waterLogs",
  "activityLogs",
  "exercises",
  "programs",
  "workouts",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

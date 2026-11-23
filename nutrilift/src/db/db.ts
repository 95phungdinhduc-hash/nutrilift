import Dexie, { type Table } from "dexie";
import type {
  ActivityLog,
  CustomExercise,
  Food,
  FoodLog,
  Goals,
  KV,
  KVKey,
  Measurement,
  Phase,
  Profile,
  Program,
  Settings,
  SyncTable,
  WaterLog,
  WeightEntry,
  Workout,
} from "./types";

export interface OutboxEntry {
  key: string; // `${table}|${id}`
  table: SyncTable;
  id: string;
  updatedAt: number;
}

export interface MetaEntry {
  id: string;
  value: unknown;
}

export class NutriLiftDB extends Dexie {
  kv!: Table<KV, string>;
  phases!: Table<Phase, string>;
  weights!: Table<WeightEntry, string>;
  measurements!: Table<Measurement, string>;
  foods!: Table<Food, string>;
  foodLogs!: Table<FoodLog, string>;
  waterLogs!: Table<WaterLog, string>;
  activityLogs!: Table<ActivityLog, string>;
  exercises!: Table<CustomExercise, string>;
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
  outbox!: Table<OutboxEntry, string>;
  /** Dữ liệu cục bộ, KHÔNG đồng bộ (trạng thái sync, cache...). */
  meta!: Table<MetaEntry, string>;

  constructor(name = "nutrilift") {
    super(name);
    this.version(1).stores({
      kv: "id",
      phases: "id, startDate",
      weights: "id, date",
      measurements: "id, date",
      foods: "id, name, barcode, source",
      foodLogs: "id, date, foodId, createdAt",
      waterLogs: "id, date",
      activityLogs: "id, date",
      exercises: "id, name",
      programs: "id, createdAt",
      workouts: "id, date, startedAt, programId",
      outbox: "key",
      meta: "id",
    });
  }
}

export let db = new NutriLiftDB();

/** Chỉ dùng cho test. */
export function _setDb(d: NutriLiftDB) {
  db = d;
}

// ---------- Sự kiện thay đổi cục bộ (để kích hoạt đồng bộ) ----------
type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emitLocalChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function table(name: SyncTable): Table<any, string> {
  return (db as any)[name] as Table<any, string>;
}

/** Ghi bản ghi (tạo/cập nhật), gắn updatedAt và đưa vào hàng đợi đồng bộ. */
export async function put<T extends { id: string }>(name: SyncTable, rec: T): Promise<T & { updatedAt: number }> {
  const now = Math.max(Date.now(), ((rec as any).updatedAt ?? 0) + 1);
  const full = { ...rec, updatedAt: now } as T & { updatedAt: number };
  if ((full as any).deleted === undefined) (full as any).deleted = 0;
  await db.transaction("rw", [table(name), db.outbox], async () => {
    await table(name).put(full);
    await db.outbox.put({ key: `${name}|${rec.id}`, table: name, id: rec.id, updatedAt: now });
  });
  emitLocalChange();
  return full;
}

export async function putMany<T extends { id: string }>(name: SyncTable, recs: T[]): Promise<void> {
  if (!recs.length) return;
  const now = Date.now();
  await db.transaction("rw", [table(name), db.outbox], async () => {
    for (const r of recs) {
      const full = { deleted: 0, ...r, updatedAt: now };
      await table(name).put(full);
      await db.outbox.put({ key: `${name}|${r.id}`, table: name, id: r.id, updatedAt: now });
    }
  });
  emitLocalChange();
}

/** Xoá mềm (giữ tombstone để đồng bộ xoá sang thiết bị khác). */
export async function remove(name: SyncTable, id: string): Promise<void> {
  const existing = await table(name).get(id);
  if (!existing) return;
  await put(name, { ...existing, deleted: 1 });
}

export async function getKV<T>(key: KVKey, fallback: T): Promise<T> {
  const r = await db.kv.get(key);
  if (!r || r.deleted) return fallback;
  return r.value as T;
}

export async function setKV<T>(key: KVKey, value: T): Promise<void> {
  await put("kv", { id: key, value });
}

export async function clearKV(key: KVKey): Promise<void> {
  await remove("kv", key);
}

export async function getMeta<T>(id: string, fallback: T): Promise<T> {
  const r = await db.meta.get(id);
  return r ? (r.value as T) : fallback;
}

export async function setMeta(id: string, value: unknown): Promise<void> {
  await db.meta.put({ id, value });
}

/** Lọc bỏ bản ghi đã xoá. */
export function alive<T extends { deleted?: 0 | 1 }>(arr: T[]): T[] {
  return arr.filter((r) => !r.deleted);
}

// ---------- Giá trị mặc định ----------
export const DEFAULT_PROFILE: Profile = {
  sex: "male",
  birthYear: 1995,
  heightCm: 170,
  activity: "moderate",
  formula: "mifflin",
};

export const DEFAULT_GOALS: Goals = {
  mode: "auto",
  proteinPerKg: 2.0,
  fatPct: 25,
  tdeeMode: "formula",
  kcalAdjust: 0,
  waterMl: 2500,
  trainingDayBonus: 0,
  trainingWeekdays: [1, 3, 5],
  activityKcalFactor: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  restTimerSec: 120,
  barKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellStepKg: 2,
  machineStepKg: 5,
  cableStepKg: 2.5,
  autoWarmups: true,
  sound: true,
  vibrate: true,
  keepAwake: true,
  onlineSources: { off: true, fdc: true },
};

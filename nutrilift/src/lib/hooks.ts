import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { alive, db, DEFAULT_GOALS, DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../db/db";
import type { ActivityLog, FoodLog, Goals, KVKey, Phase, Profile, Program, Settings, WaterLog, WeightEntry, Workout } from "../db/types";
import { computeTargets, type DayTargets } from "../nutrition/calc";
import { today } from "./date";

export function useKV<T>(key: KVKey, fallback: T): { value: T; loaded: boolean } {
  const r = useLiveQuery(async () => (await db.kv.get(key)) ?? null, [key]);
  return useMemo(() => {
    if (r === undefined) return { value: fallback, loaded: false };
    if (r === null || r.deleted) return { value: fallback, loaded: true };
    return { value: r.value as T, loaded: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
}

export function useProfile() {
  const { value, loaded } = useKV<Profile | null>("profile", null);
  return { profile: value ? { ...DEFAULT_PROFILE, ...value } : null, loaded };
}

export function useGoals(): Goals {
  const { value } = useKV<Partial<Goals>>("goals", DEFAULT_GOALS);
  return useMemo(() => ({ ...DEFAULT_GOALS, ...value }), [value]);
}

export function useSettings(): Settings {
  const { value } = useKV<Partial<Settings>>("settings", DEFAULT_SETTINGS);
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...value, onlineSources: { ...DEFAULT_SETTINGS.onlineSources, ...(value.onlineSources ?? {}) } }), [value]);
}

export function usePhases(): Phase[] {
  return useLiveQuery(async () => alive(await db.phases.orderBy("startDate").toArray()), []) ?? [];
}

export function useWeights(): WeightEntry[] {
  return useLiveQuery(async () => alive(await db.weights.orderBy("date").toArray()), []) ?? [];
}

export function useFoodLogs(date: string): FoodLog[] | undefined {
  return useLiveQuery(async () => alive(await db.foodLogs.where("date").equals(date).toArray()).sort((a, b) => a.createdAt - b.createdAt), [date]);
}

export function useFoodLogsRange(from: string, to: string): FoodLog[] {
  return useLiveQuery(async () => alive(await db.foodLogs.where("date").between(from, to, true, true).toArray()), [from, to]) ?? [];
}

export function useWater(date: string): WaterLog[] {
  return useLiveQuery(async () => alive(await db.waterLogs.where("date").equals(date).toArray()), [date]) ?? [];
}

export function useActivities(date: string): ActivityLog[] {
  return useLiveQuery(async () => alive(await db.activityLogs.where("date").equals(date).toArray()), [date]) ?? [];
}

export function useWorkouts(): Workout[] {
  return useLiveQuery(async () => alive(await db.workouts.orderBy("startedAt").reverse().toArray()), []) ?? [];
}

export function usePrograms(): Program[] {
  return useLiveQuery(async () => alive(await db.programs.orderBy("createdAt").toArray()), []) ?? [];
}

export function useActiveProgram(): Program | undefined {
  const { value: activeId } = useKV<string | null>("activeProgramId", null);
  return useLiveQuery(async () => {
    if (!activeId) return undefined;
    const p = await db.programs.get(activeId);
    return p && !p.deleted ? p : undefined;
  }, [activeId]);
}

export function useActiveWorkout(): Workout | null | undefined {
  const { value, loaded } = useKV<Workout | null>("activeWorkout", null);
  return loaded ? value : undefined;
}

/** Mục tiêu dinh dưỡng của một ngày (đã tính giai đoạn, calorie cycling, vận động). */
export function useTargets(date: string): DayTargets | undefined {
  const { profile } = useProfile();
  const goals = useGoals();
  const phases = usePhases();
  const weights = useWeights();
  const activities = useActivities(date);
  const trainedToday = useLiveQuery(async () => (await db.workouts.where("date").equals(date).filter((w) => !w.deleted).count()) > 0, [date]);
  return useMemo(() => {
    if (!profile) return undefined;
    const activityKcal = activities.reduce((a, x) => a + x.kcal, 0);
    const isTrainingDay = trainedToday ? true : undefined;
    return computeTargets({ profile, goals, phases, weights, date, activityKcal, isTrainingDay });
  }, [profile, goals, phases, weights, activities, date, trainedToday]);
}

export function useToday(): string {
  const [d, setD] = useState(today());
  useEffect(() => {
    const t = setInterval(() => setD(today()), 60000);
    return () => clearInterval(t);
  }, []);
  return d;
}

export function useNow(intervalMs = 1000): number {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return n;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    return () => {
      window.removeEventListener("online", a);
      window.removeEventListener("offline", b);
    };
  }, []);
  return on;
}

/** Giữ màn hình sáng (Wake Lock API) khi đang tập. */
export function useWakeLock(enabled: boolean) {
  const lock = useRef<any>(null);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock.current = await (navigator as any).wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lock.current?.release?.().catch(() => {});
    };
  }, [enabled]);
}

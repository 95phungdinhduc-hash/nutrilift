import type { CustomExercise, Equipment, MuscleGroup } from "../db/types";
import { matchScore, normalize } from "../lib/text";
import { RAW_EXERCISES } from "./exercisesData";

export interface ExerciseDef {
  id: string;
  name: string;
  nameVi: string;
  equipment: Equipment;
  equipments: Equipment[];
  target: MuscleGroup[];
  synergist: MuscleGroup[];
  /** Ngưỡng khởi động kiểu Liftosaur (10 / 45 / 95), 0 = không tự khởi động. */
  warmup: number;
  startKg: number;
  custom?: boolean;
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Ngực",
  back: "Lưng",
  traps: "Cầu vai",
  front_delts: "Vai trước",
  side_delts: "Vai giữa",
  rear_delts: "Vai sau",
  biceps: "Tay trước",
  triceps: "Tay sau",
  forearms: "Cẳng tay",
  quads: "Đùi trước",
  hamstrings: "Đùi sau",
  glutes: "Mông",
  adductors: "Đùi trong",
  calves: "Bắp chân",
  abs: "Bụng",
  lower_back: "Lưng dưới",
};

export const MUSCLE_ORDER: MuscleGroup[] = [
  "chest",
  "back",
  "traps",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
  "abs",
  "lower_back",
];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Tạ đòn",
  dumbbell: "Tạ đơn",
  cable: "Cáp",
  leverageMachine: "Máy",
  smith: "Máy Smith",
  kettlebell: "Tạ ấm",
  bodyweight: "Trọng lượng cơ thể",
  band: "Dây kháng lực",
  ezbar: "Đòn EZ",
  trapbar: "Đòn lục giác",
  medicineball: "Bóng tạ",
};

/** Tên dụng cụ trong Liftoscript (tiếng Anh) -> mã. */
const EQUIPMENT_ALIASES: Record<string, Equipment> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  machine: "leverageMachine",
  "leverage machine": "leverageMachine",
  leveragemachine: "leverageMachine",
  smith: "smith",
  "smith machine": "smith",
  kettlebell: "kettlebell",
  bodyweight: "bodyweight",
  band: "band",
  "ez bar": "ezbar",
  ezbar: "ezbar",
  "trap bar": "trapbar",
  trapbar: "trapbar",
  "medicine ball": "medicineball",
  medicineball: "medicineball",
};

export const EQUIPMENT_NAMES_EN: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  leverageMachine: "Leverage Machine",
  smith: "Smith Machine",
  kettlebell: "Kettlebell",
  bodyweight: "Bodyweight",
  band: "Band",
  ezbar: "EZ Bar",
  trapbar: "Trap Bar",
  medicineball: "Medicine Ball",
};

export function parseEquipment(s: string): Equipment | undefined {
  return EQUIPMENT_ALIASES[s.trim().toLowerCase()];
}

export const BUILTIN_EXERCISES: ExerciseDef[] = RAW_EXERCISES.map(([id, name, nameVi, eq, eqs, target, syn, warm, kg]) => ({
  id,
  name,
  nameVi,
  equipment: eq as Equipment,
  equipments: eqs as Equipment[],
  target: target as MuscleGroup[],
  synergist: syn as MuscleGroup[],
  warmup: warm,
  startKg: kg,
}));

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
const byName = new Map<string, ExerciseDef>();
for (const e of BUILTIN_EXERCISES) {
  byName.set(e.name.toLowerCase(), e);
  if (e.nameVi) byName.set(normalize(e.nameVi), e);
}
// Một số tên gọi phổ biến khác
const EXTRA_ALIASES: Record<string, string> = {
  "back squat": "squat",
  ohp: "overheadPress",
  "military press": "overheadPress",
  "barbell row": "bentOverRow",
  rdl: "romanianDeadlift",
  "dumbbell row": "bentOverOneArmRow",
  "lat pull down": "latPulldown",
  "lat pulldown": "latPulldown",
  "cable row": "seatedRow",
  "leg curl": "legCurl",
  dips: "chestDip",
  dip: "chestDip",
  "pull-up": "pullUp",
  "chin-up": "chinUp",
  "push-up": "pushUp",
  "calf raise": "standingCalfRaise",
  "tricep pushdown": "tricepsPushdown",
  "triceps pushdown": "tricepsPushdown",
  "bicep curl": "bicepCurl",
  "biceps curl": "bicepCurl",
  "dumbbell bench press": "chestPress",
  "incline dumbbell press": "inclineChestPress",
  "step up": "stepUp",
};
for (const [alias, id] of Object.entries(EXTRA_ALIASES)) {
  const e = byId.get(id);
  if (e) byName.set(alias, e);
}

export function customToDef(c: CustomExercise): ExerciseDef {
  return {
    id: c.id,
    name: c.name,
    nameVi: c.nameVi || "",
    equipment: c.equipment,
    equipments: [c.equipment],
    target: c.target,
    synergist: c.synergist,
    warmup: c.equipment === "barbell" || c.equipment === "trapbar" ? 45 : c.equipment === "bodyweight" ? 0 : 10,
    startKg: 0,
    custom: true,
  };
}

export function findExercise(id: string, custom: CustomExercise[] = []): ExerciseDef | undefined {
  const b = byId.get(id);
  if (b) return b;
  const c = custom.find((x) => x.id === id && !x.deleted);
  return c ? customToDef(c) : undefined;
}

export function findExerciseByName(name: string, custom: CustomExercise[] = []): ExerciseDef | undefined {
  const key = name.trim().toLowerCase();
  const b = byName.get(key) || byName.get(normalize(name));
  if (b) return b;
  const c = custom.find((x) => !x.deleted && (x.name.toLowerCase() === key || normalize(x.nameVi || "") === normalize(name)));
  return c ? customToDef(c) : undefined;
}

export function allExercises(custom: CustomExercise[] = []): ExerciseDef[] {
  return [...custom.filter((c) => !c.deleted).map(customToDef), ...BUILTIN_EXERCISES];
}

export function searchExercises(
  query: string,
  opts: { custom?: CustomExercise[]; muscle?: MuscleGroup; equipment?: Equipment } = {}
): ExerciseDef[] {
  let list = allExercises(opts.custom);
  if (opts.muscle) list = list.filter((e) => e.target.includes(opts.muscle!) || e.synergist.includes(opts.muscle!));
  if (opts.equipment) list = list.filter((e) => e.equipments.includes(opts.equipment!));
  if (!query.trim()) {
    return list.sort((a, b) => {
      if (opts.muscle) {
        const ta = a.target.includes(opts.muscle) ? 0 : 1;
        const tb = b.target.includes(opts.muscle) ? 0 : 1;
        if (ta !== tb) return ta - tb;
      }
      return a.name.localeCompare(b.name);
    });
  }
  return list
    .map((e) => ({ e, s: matchScore(query, e.name, e.nameVi) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}

export function exerciseDisplayName(name: string, equipment: Equipment, def?: ExerciseDef): string {
  if (def && def.equipment === equipment) return name;
  return `${name}, ${EQUIPMENT_LABELS[equipment] ?? equipment}`;
}

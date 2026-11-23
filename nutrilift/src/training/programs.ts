// Chương trình mẫu viết bằng Liftoscript-lite. Mức tạ ban đầu chỉ là gợi ý — khi kích hoạt chương trình
// app sẽ cho bạn chỉnh mức tạ khởi điểm cho từng bài.

export interface ProgramTemplate {
  id: string;
  name: string;
  short: string;
  daysPerWeek: string;
  level: "Mới tập" | "Trung bình" | "Mọi trình độ";
  goal: "cut" | "bulk" | "strength" | "general";
  text: string;
}

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: "cut-strength-3",
    name: "Cutting — Giữ cơ & sức mạnh",
    short: "Full body 3 buổi/tuần. Giữ mức tạ nặng, giảm khối lượng để hồi phục tốt khi ăn thâm hụt.",
    daysPerWeek: "3 buổi/tuần",
    level: "Mọi trình độ",
    goal: "cut",
    text: `/// Chương trình cho giai đoạn GIẢM MỠ.
/// Nguyên tắc: giữ cường độ (mức tạ) để báo cho cơ thể "cần giữ cơ", giảm số set để hồi phục được khi thiếu calo.
/// Tăng tạ chậm: chỉ tăng sau 2 buổi đạt đủ rep liên tiếp. Trượt 2 lần → giảm 10%.

// Giữ lưng thẳng, xuống đến khi đùi song song sàn. Dừng set khi còn 1–2 rep.
## Ngày 1 — Squat & Đẩy ngực
Squat / 3x5 / 60kg / 180s / progress: lp(2.5kg, 2, 0, 10%, 2)
Bench Press / 3x5 / 50kg / 180s / progress: lp(2.5kg, 2, 0, 10%, 2)
Seated Row / 3x8 / 40kg / 90s / progress: dp(2.5kg, 8, 12)
Lateral Raise / 2x12 / 6kg / 60s / warmup: none / progress: dp(1kg, 12, 15)
Triceps Pushdown / 2x10 / 20kg / 60s / warmup: none / progress: dp(2.5kg, 10, 15)

## Ngày 2 — Deadlift & Vai
Deadlift / 3x4 / 80kg / 180s / progress: lp(2.5kg, 2, 0, 10%, 2)
Overhead Press / 3x5 / 30kg / 150s / progress: lp(1.25kg, 2, 0, 10%, 2)
Lat Pulldown / 3x8 / 40kg / 90s / progress: dp(2.5kg, 8, 12)
Bulgarian Split Squat / 2x8 / 10kg / 90s / progress: dp(2kg, 8, 12)
Hammer Curl / 2x10 / 10kg / 60s / warmup: none / progress: dp(2kg, 10, 15)

## Ngày 3 — Toàn thân
Incline Bench Press / 3x6 / 40kg / 150s / progress: dp(2.5kg, 6, 10)
Romanian Deadlift, Barbell / 3x8 / 50kg / 120s / progress: dp(2.5kg, 8, 12)
Pull Up / 3x5+ / 0kg / 120s / progress: sum(25, 2.5kg)
Leg Press / 2x10 / 80kg / 120s / progress: dp(5kg, 10, 15)
Face Pull, Cable / 2x15 / 15kg / 60s / warmup: none / progress: dp(2.5kg, 15, 20)
`,
  },
  {
    id: "upper-lower-4",
    name: "Upper / Lower — Tăng cơ",
    short: "4 buổi/tuần, mỗi nhóm cơ 2 lần/tuần. Double progression: tăng rep trước, đủ rep thì tăng tạ.",
    daysPerWeek: "4 buổi/tuần",
    level: "Trung bình",
    goal: "bulk",
    text: `/// Upper/Lower 4 buổi — phù hợp cả cutting (giữ nguyên) lẫn bulking (có thể thêm 1 set cho mỗi bài).
/// dp(2.5kg, 6, 8): tập 3x6 → 3x7 → 3x8, đủ 3x8 thì +2.5kg và quay về 3x6.

## Upper 1 — Nặng
Bench Press / 3x6 / 50kg / 150s / progress: dp(2.5kg, 6, 8)
Bent Over Row / 3x6 / 45kg / 150s / progress: dp(2.5kg, 6, 8)
Shoulder Press / 3x8 / 14kg / 120s / progress: dp(2kg, 8, 12)
Lat Pulldown / 3x10 / 40kg / 90s / progress: dp(2.5kg, 10, 12)
Bicep Curl / 3x10 / 10kg / 60s / warmup: none / progress: dp(2kg, 10, 15)
Triceps Pushdown / 3x10 / 20kg / 60s / warmup: none / progress: dp(2.5kg, 10, 15)

## Lower 1 — Nặng
Squat / 3x6 / 60kg / 180s / progress: dp(2.5kg, 6, 8)
Romanian Deadlift, Barbell / 3x8 / 50kg / 150s / progress: dp(2.5kg, 8, 10)
Leg Press / 3x10 / 80kg / 120s / progress: dp(5kg, 10, 15)
Leg Curl / 3x10 / 30kg / 90s / warmup: none / progress: dp(5kg, 10, 15)
Standing Calf Raise / 4x10 / 20kg / 60s / warmup: none / progress: dp(2kg, 10, 15)

## Upper 2 — Nhiều rep
Incline Chest Press / 3x10 / 16kg / 120s / progress: dp(2kg, 10, 12)
Seated Row / 3x10 / 40kg / 90s / progress: dp(2.5kg, 10, 12)
Lateral Raise / 4x12 / 6kg / 60s / warmup: none / progress: dp(1kg, 12, 20)
Pull Up / 3x6+ / 0kg / 120s / progress: sum(24, 2.5kg)
Hammer Curl / 3x12 / 10kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
Triceps Extension / 3x12 / 12kg / 60s / warmup: none / progress: dp(2kg, 12, 15)

## Lower 2 — Nhiều rep
Deadlift / 3x5 / 80kg / 180s / progress: lp(2.5kg)
Bulgarian Split Squat / 3x10 / 10kg / 90s / progress: dp(2kg, 10, 12)
Leg Extension / 3x12 / 30kg / 90s / warmup: none / progress: dp(5kg, 12, 15)
Hip Thrust / 3x10 / 60kg / 120s / progress: dp(5kg, 10, 12)
Hanging Leg Raise / 3x10 / 0kg / 60s / warmup: none
`,
  },
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    short: "Xoay vòng Đẩy – Kéo – Chân. Tập 3 buổi (1 vòng) hoặc 6 buổi (2 vòng) mỗi tuần.",
    daysPerWeek: "3 hoặc 6 buổi/tuần",
    level: "Trung bình",
    goal: "bulk",
    text: `/// PPL kinh điển. Khi bulking nên tập 6 buổi/tuần (mỗi nhóm cơ 2 lần). Khi cutting 3–4 buổi là đủ.

## Push — Đẩy
Bench Press / 4x6 / 50kg / 150s / progress: dp(2.5kg, 6, 10)
Overhead Press / 3x8 / 30kg / 120s / progress: dp(2.5kg, 8, 10)
Incline Chest Press / 3x10 / 16kg / 90s / progress: dp(2kg, 10, 12)
Lateral Raise / 4x12 / 6kg / 60s / warmup: none / progress: dp(1kg, 12, 20)
Triceps Pushdown / 3x10 / 20kg / 60s / warmup: none / progress: dp(2.5kg, 10, 15)
Triceps Extension / 3x12 / 12kg / 60s / warmup: none / progress: dp(2kg, 12, 15)

## Pull — Kéo
Deadlift / 3x5 / 80kg / 180s / progress: lp(2.5kg)
Pull Up / 3x6+ / 0kg / 120s / progress: sum(24, 2.5kg)
Bent Over Row / 3x8 / 45kg / 120s / progress: dp(2.5kg, 8, 12)
Face Pull, Cable / 3x15 / 15kg / 60s / warmup: none / progress: dp(2.5kg, 15, 20)
Bicep Curl / 3x10 / 10kg / 60s / warmup: none / progress: dp(2kg, 10, 15)
Hammer Curl / 3x12 / 10kg / 60s / warmup: none / progress: dp(2kg, 12, 15)

## Legs — Chân
Squat / 4x6 / 60kg / 180s / progress: dp(2.5kg, 6, 10)
Romanian Deadlift, Barbell / 3x8 / 50kg / 150s / progress: dp(2.5kg, 8, 12)
Leg Press / 3x10 / 80kg / 120s / progress: dp(5kg, 10, 15)
Leg Curl / 3x12 / 30kg / 90s / warmup: none / progress: dp(5kg, 12, 15)
Standing Calf Raise / 4x12 / 20kg / 60s / warmup: none / progress: dp(2kg, 12, 20)
Cable Crunch / 3x12 / 25kg / 60s / warmup: none / progress: dp(2.5kg, 12, 20)
`,
  },
  {
    id: "bulk-5",
    name: "Bulking — Tăng cơ 5 buổi",
    short: "Upper/Lower sức mạnh + Push/Pull/Legs phì đại. Khối lượng cao, dùng khi ăn dư calo.",
    daysPerWeek: "5 buổi/tuần",
    level: "Trung bình",
    goal: "bulk",
    text: `/// Dùng khi BULKING: dư calo giúp hồi phục khối lượng tập lớn.
/// 2 buổi đầu tuần tập nặng (sức mạnh), 3 buổi sau tập nhiều rep (phì đại).

## Upper — Sức mạnh
Bench Press / 4x5 / 55kg / 180s / progress: lp(2.5kg, 1, 0, 10%, 3)
Bent Over Row / 4x6 / 50kg / 150s / progress: lp(2.5kg, 1, 0, 10%, 3)
Overhead Press / 3x6 / 32.5kg / 150s / progress: lp(1.25kg, 1, 0, 10%, 3)
Pull Up / 3x6+ / 0kg / 120s / progress: sum(24, 2.5kg)
Bicep Curl / 2x10 / 10kg / 60s / warmup: none / progress: dp(2kg, 10, 15)

## Lower — Sức mạnh
Squat / 4x5 / 70kg / 180s / progress: lp(2.5kg, 1, 0, 10%, 3)
Deadlift / 3x5 / 90kg / 180s / progress: lp(5kg, 1, 0, 10%, 3)
Leg Press / 3x10 / 100kg / 120s / progress: dp(5kg, 10, 15)
Standing Calf Raise / 4x10 / 30kg / 60s / warmup: none / progress: dp(2kg, 10, 15)

## Push — Phì đại
Incline Bench Press / 4x8 / 40kg / 120s / progress: dp(2.5kg, 8, 12)
Chest Fly / 3x12 / 10kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
Shoulder Press / 3x10 / 14kg / 90s / progress: dp(2kg, 10, 12)
Lateral Raise / 4x15 / 6kg / 60s / warmup: none / progress: dp(1kg, 15, 20)
Triceps Pushdown / 4x12 / 20kg / 60s / warmup: none / progress: dp(2.5kg, 12, 15)

## Pull — Phì đại
Lat Pulldown / 4x10 / 45kg / 90s / progress: dp(2.5kg, 10, 12)
Seated Row / 3x10 / 45kg / 90s / progress: dp(2.5kg, 10, 12)
Reverse Fly / 3x15 / 5kg / 60s / warmup: none / progress: dp(1kg, 15, 20)
Incline Curl / 3x12 / 8kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
Hammer Curl / 3x12 / 10kg / 60s / warmup: none / progress: dp(2kg, 12, 15)

## Legs — Phì đại
Front Squat / 3x8 / 40kg / 150s / progress: dp(2.5kg, 8, 12)
Romanian Deadlift, Barbell / 3x10 / 50kg / 120s / progress: dp(2.5kg, 10, 12)
Bulgarian Split Squat / 3x10 / 10kg / 90s / progress: dp(2kg, 10, 12)
Leg Curl / 3x12 / 30kg / 60s / warmup: none / progress: dp(5kg, 12, 15)
Leg Extension / 3x15 / 30kg / 60s / warmup: none / progress: dp(5kg, 15, 20)
`,
  },
  {
    id: "beginner-ab",
    name: "Full Body cơ bản (người mới)",
    short: "2 buổi A/B luân phiên, 3 buổi/tuần. Tăng tạ mỗi buổi — tiến bộ nhanh nhất cho người mới.",
    daysPerWeek: "3 buổi/tuần",
    level: "Mới tập",
    goal: "strength",
    text: `/// Dựa trên "Basic Beginner Routine" (có trong Liftosaur).
/// Luân phiên A – B – A, tuần sau B – A – B. Set cuối "5+" là AMRAP: làm nhiều nhất có thể với kỹ thuật chuẩn.
/// Trượt 3 buổi liên tiếp → giảm 10% và xây lại.

## Buổi A
Bent Over Row / 2x5, 1x5+ / 40kg / 120s / progress: lp(2.5kg, 1, 0, 10%, 3)
Bench Press / 2x5, 1x5+ / 40kg / 150s / progress: lp(2.5kg, 1, 0, 10%, 3)
Squat / 2x5, 1x5+ / 50kg / 180s / progress: lp(5kg, 1, 0, 10%, 3)

## Buổi B
Chin Up / 2x5, 1x5+ / 0kg / 120s / progress: lp(2.5kg, 1, 0, 10%, 3)
Overhead Press / 2x5, 1x5+ / 25kg / 150s / progress: lp(2.5kg, 1, 0, 10%, 3)
Deadlift / 2x5, 1x5+ / 60kg / 180s / progress: lp(5kg, 1, 0, 10%, 3)
`,
  },
  {
    id: "strength-5x5",
    name: "5×5 Sức mạnh",
    short: "Kinh điển A/B: 5 hiệp × 5 lần các bài compound, tăng tạ mỗi buổi.",
    daysPerWeek: "3 buổi/tuần",
    level: "Mới tập",
    goal: "strength",
    text: `/// 5x5 A/B luân phiên. Squat mỗi buổi, các bài còn lại xoay vòng.

## Buổi A
Squat / 5x5 / 50kg / 180s / progress: lp(2.5kg, 1, 0, 10%, 3)
Bench Press / 5x5 / 40kg / 180s / progress: lp(2.5kg, 1, 0, 10%, 3)
Bent Over Row / 5x5 / 40kg / 150s / progress: lp(2.5kg, 1, 0, 10%, 3)

## Buổi B
Squat / 5x5 / 50kg / 180s
Overhead Press / 5x5 / 25kg / 180s / progress: lp(2.5kg, 1, 0, 10%, 3)
Deadlift / 1x5 / 60kg / 180s / progress: lp(5kg, 1, 0, 10%, 3)
`,
  },
  {
    id: "home-dumbbell",
    name: "Tập ở nhà với tạ đơn",
    short: "Full body A/B chỉ cần 1 đôi tạ đơn (tốt nhất loại chỉnh được) và 1 ghế.",
    daysPerWeek: "3 buổi/tuần",
    level: "Mọi trình độ",
    goal: "general",
    text: `/// Chỉ cần tạ đơn + ghế (hoặc tập trên sàn). Đủ rep tối đa thì tăng tạ.

## Ngày A
Goblet Squat / 3x10 / 12kg / 90s / progress: dp(2kg, 10, 15)
Chest Press / 3x10 / 10kg / 90s / progress: dp(2kg, 10, 15)
Bent Over One Arm Row / 3x10 / 12kg / 90s / progress: dp(2kg, 10, 15)
Shoulder Press / 3x10 / 8kg / 90s / progress: dp(2kg, 10, 15)
Push Up / 2x10+ / 0kg / 60s / warmup: none

## Ngày B
Romanian Deadlift / 3x10 / 14kg / 90s / progress: dp(2kg, 10, 15)
Bulgarian Split Squat / 3x10 / 8kg / 90s / progress: dp(2kg, 10, 15)
Pullover / 3x12 / 10kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
Lateral Raise / 3x15 / 4kg / 60s / warmup: none / progress: dp(1kg, 15, 20)
Bicep Curl / 3x12 / 8kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
Triceps Extension / 3x12 / 8kg / 60s / warmup: none / progress: dp(2kg, 12, 15)
`,
  },
];

export const EMPTY_PROGRAM_TEXT = `/// Viết chương trình của bạn. Mỗi buổi bắt đầu bằng "## Tên buổi".
/// Mỗi dòng: Tên bài / số set x rep / mức tạ / thời gian nghỉ / progress: ...

## Buổi 1
Squat / 3x8 / 40kg / 120s / progress: dp(2.5kg, 8, 12)
Bench Press / 3x8 / 30kg / 120s / progress: dp(2.5kg, 8, 12)
`;

// Biểu đồ SVG nhẹ (không cần thư viện): đường, chấm và cột.
import { useMemo, useRef, useState } from "react";
import { formatDate } from "../lib/date";
import { fmt } from "../lib/format";

export interface Series {
  name: string;
  color: string;
  points: { x: string; y: number }[];
  /** "line" | "dots" | "both" */
  style?: "line" | "dots" | "both";
  dashed?: boolean;
}

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

export function LineChart({
  series,
  height = 180,
  unit = "",
  digits = 1,
  refLine,
  emptyText = "Chưa có dữ liệu",
}: {
  series: Series[];
  height?: number;
  unit?: string;
  digits?: number;
  refLine?: { y: number; label: string; color?: string };
  emptyText?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 24;

  const { xs, xIndex, yMin, yMax } = useMemo(() => {
    const all = new Set<string>();
    series.forEach((s) => s.points.forEach((p) => all.add(p.x)));
    const xs = [...all].sort();
    const xIndex = new Map(xs.map((x, i) => [x, i]));
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    if (refLine) ys.push(refLine.y);
    const [yMin, yMax] = ys.length ? niceRange(Math.min(...ys), Math.max(...ys)) : [0, 1];
    return { xs, xIndex, yMin, yMax };
  }, [series, refLine]);

  if (!xs.length) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>{emptyText}</div>;

  const sx = (i: number) => padL + (xs.length === 1 ? (W - padL - padR) / 2 : (i / (xs.length - 1)) * (W - padL - padR));
  const sy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((t) => yMin + t * (yMax - yMin));
  const xTicks = xs.length <= 1 ? [0] : [0, Math.floor((xs.length - 1) / 2), xs.length - 1];

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (xs.length - 1));
    setHover(Math.max(0, Math.min(xs.length - 1, i)));
  };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        style={{ height }}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {fmt(t, t > 100 ? 0 : digits)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={sx(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === xs.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
            {formatDate(xs[i])}
          </text>
        ))}
        {refLine && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={sy(refLine.y)}
              y2={sy(refLine.y)}
              stroke={refLine.color ?? "var(--accent)"}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
        {series.map((s) => {
          const pts = s.points.map((p) => [sx(xIndex.get(p.x)!), sy(p.y)] as const);
          const style = s.style ?? "line";
          return (
            <g key={s.name}>
              {(style === "line" || style === "both") && pts.length > 1 && (
                <polyline
                  points={pts.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "6 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {(style === "dots" || style === "both" || pts.length === 1) &&
                pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={style === "dots" ? 2.6 : 3} fill={s.color} opacity={style === "dots" ? 0.55 : 1} />)}
            </g>
          );
        })}
        {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg bg-surface-2 px-2 py-1 text-xs shadow">
          <div className="font-semibold">{formatDate(xs[hover], { weekday: true })}</div>
          {series.map((s) => {
            const p = s.points.find((pp) => pp.x === xs[hover]);
            return p ? (
              <div key={s.name} className="tabular" style={{ color: s.color }}>
                {s.name}: {fmt(p.y, digits)}
                {unit}
              </div>
            ) : null;
          })}
        </div>
      )}
      {refLine && <div className="mt-1 text-right text-[11px] text-muted">— — {refLine.label}</div>}
    </div>
  );
}

export function BarChart({
  data,
  height = 140,
  target,
  color = "var(--accent)",
  unit = "",
}: {
  data: { x: string; y: number; label?: string }[];
  height?: number;
  target?: number;
  color?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.y), target ?? 0) * 1.1;
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => {
        const h = (d.y / max) * (height - 22);
        const over = target != null && d.y > target * 1.05;
        return (
          <div key={d.x} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatDate(d.x)}: ${fmt(d.y)}${unit}`}>
            <div className="relative flex w-full flex-1 items-end justify-center">
              {target != null && <div className="absolute inset-x-0 border-t border-dashed border-muted/60" style={{ bottom: (target / max) * (height - 22) }} />}
              <div className="w-full max-w-7 rounded-t-md transition-all" style={{ height: Math.max(2, h), background: d.y === 0 ? "var(--surface-3)" : over ? "var(--carbs)" : color }} />
            </div>
            <div className="w-full truncate text-center text-[10px] text-muted">{d.label ?? formatDate(d.x)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Thanh ngang cho thống kê nhóm cơ. */
export function HBar({ label, value, max, color = "var(--train)", hint }: { label: string; value: number; max: number; color?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="w-24 shrink-0 truncate text-muted">{label}</div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, background: color }} />
      </div>
      <div className="tabular w-12 shrink-0 text-right font-semibold">{fmt(value, 1)}</div>
      {hint && <div className="w-10 shrink-0 text-xs text-muted">{hint}</div>}
    </div>
  );
}

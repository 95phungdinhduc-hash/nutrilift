import { X } from "lucide-react";
import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parseNum } from "../lib/format";
import { ripple } from "../lib/fx";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "train" | "outline";

export function Button({
  variant = "primary",
  size = "md",
  className,
  icon,
  children,
  onPointerDown,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary:
      "btn-shine bg-gradient-accent text-white dark:text-slate-950 shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent)] hover:shadow-[0_12px_28px_-8px_color-mix(in_srgb,var(--accent)_80%,transparent)] hover:brightness-[1.04]",
    train:
      "btn-shine bg-gradient-train text-white dark:text-slate-950 shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--train)_70%,transparent)] hover:shadow-[0_12px_28px_-8px_color-mix(in_srgb,var(--train)_80%,transparent)] hover:brightness-[1.04]",
    secondary: "bg-surface-2 text-ink hover:bg-surface-3",
    outline: "border border-line bg-surface/70 text-ink hover:border-accent/40 hover:bg-surface-2",
    ghost: "text-ink hover:bg-surface-2",
    danger: "bg-danger/10 text-danger hover:bg-danger/15",
  };
  const s = { sm: "h-8 px-3 text-sm gap-1.5", md: "h-10 px-4 text-[15px] gap-2", lg: "h-12 px-5 text-base gap-2" }[size];
  return (
    <button
      className={cx(
        "relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-xl font-semibold transition-all duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        v[variant],
        s,
        className
      )}
      onPointerDown={(e) => {
        ripple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ className, label, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx("inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-all duration-200 hover:bg-surface-2 hover:text-ink active:scale-90", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("card rounded-[1.35rem] p-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between gap-2", className)}>
      <h2 className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ children, color = "muted", className }: { children: ReactNode; color?: "muted" | "accent" | "train" | "danger" | "protein"; className?: string }) {
  const c = {
    muted: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent-ink",
    train: "bg-train-soft text-train",
    danger: "bg-danger/10 text-danger",
    protein: "bg-protein/10 text-protein",
  }[color];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", c, className)}>{children}</span>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </span>
  );
}

export function TextField({ label, hint, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cx("block", className)}>
      {label && <Label hint={hint}>{label}</Label>}
      <input className="field" {...rest} />
    </label>
  );
}

/** Ô nhập số (hỗ trợ dấu phẩy), có thể kèm nút +/−. */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
  placeholder,
  className,
  inputClassName,
  stepper,
  autoFocus,
  id,
  disabled,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  stepper?: boolean;
  autoFocus?: boolean;
  id?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    // Cập nhật chữ khi giá trị đổi từ bên ngoài (kể cả lúc đang focus), nhưng không phá chữ người dùng đang gõ.
    const typed = parseNum(text);
    const same = typed === value || (typed != null && value != null && Math.abs(typed - value) < 1e-9);
    if (!focused.current || !same) setText(value == null ? "" : String(Math.round(value * 1000) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (t: string) => {
    let n = parseNum(t);
    if (n != null) {
      if (min != null) n = Math.max(min, n);
      if (max != null) n = Math.min(max, n);
    }
    onChange(n);
  };
  const bump = (dir: 1 | -1) => {
    const cur = value ?? 0;
    let n = Math.round((cur + dir * (step ?? 1)) * 1000) / 1000;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
    setText(String(n));
  };
  return (
    <label className={cx("block", className)}>
      {label && <Label hint={hint}>{label}</Label>}
      <div className="flex items-stretch gap-1.5">
        {stepper && (
          <button type="button" disabled={disabled} onClick={() => bump(-1)} className="w-10 shrink-0 rounded-xl bg-surface-2 text-lg font-bold hover:bg-surface-3" aria-label="Giảm">
            −
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            disabled={disabled}
            className={cx("field tabular", suffix && "pr-10", stepper && "text-center", inputClassName)}
            inputMode="decimal"
            value={text}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              focused.current = false;
              commit(text);
            }}
            onChange={(e) => {
              setText(e.target.value);
              const n = parseNum(e.target.value);
              if (n != null || e.target.value === "") onChange(n);
            }}
          />
          {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
        </div>
        {stepper && (
          <button type="button" disabled={disabled} onClick={() => bump(1)} className="w-10 shrink-0 rounded-xl bg-surface-2 text-lg font-bold hover:bg-surface-3" aria-label="Tăng">
            +
          </button>
        )}
      </div>
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      {label && <Label>{label}</Label>}
      <select className="field appearance-none" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className={cx("flex rounded-2xl bg-surface-2/80 p-1 ring-1 ring-line/60 ring-inset", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex-1 rounded-xl font-semibold whitespace-nowrap transition-colors duration-200",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "text-ink" : "text-muted hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-surface shadow-[0_2px_8px_-2px_rgba(15,23,42,0.18)] ring-1 ring-line/70"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; desc?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {desc && <span className="block text-xs text-muted">{desc}</span>}
      </span>
      <span className={cx("relative flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300", checked ? "bg-gradient-accent justify-end" : "bg-surface-3 justify-start")}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <motion.span layout transition={{ type: "spring", stiffness: 700, damping: 32 }} className="h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
      </span>
    </label>
  );
}

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setD(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

/** Bảng trượt từ dưới lên (điện thoại, kéo xuống để đóng) / hộp thoại giữa màn hình (máy tính). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const desktop = useIsDesktop();
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[6px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          />
          <motion.div
            className={cx(
              "relative flex max-h-[92dvh] w-full flex-col rounded-t-[1.75rem] border border-[var(--card-border)] bg-surface shadow-[var(--shadow-pop)] sm:rounded-[1.75rem]",
              wide ? "sm:max-w-2xl" : "sm:max-w-md"
            )}
            initial={desktop ? { opacity: 0, scale: 0.94, y: 12 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.96, y: 8 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.9 }}
            drag={desktop ? false : "y"}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="touch-none cursor-grab pt-2.5 active:cursor-grabbing sm:hidden" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto h-1.5 w-11 rounded-full bg-surface-3" />
            </div>
            <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2" onPointerDown={(e) => !desktop && drag.start(e)}>
              <div className="min-w-0 text-lg font-bold tracking-tight">{title}</div>
              <IconButton label="Đóng" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
                <X size={20} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
            {footer && <div className="border-t border-line px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Số chạy mượt khi thay đổi. */
export function AnimatedNumber({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString("vi-VN", { maximumFractionDigits: digits }));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

export function ProgressRing({
  value,
  max,
  size = 120,
  stroke = 11,
  color,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.02;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={over ? "var(--danger)" : color ?? "var(--accent)"} />
            <stop offset="100%" stopColor={over ? "var(--train)" : color ?? "var(--protein)"} />
          </linearGradient>
          <filter id={`f${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} opacity={0.7} />
        {/* quầng sáng */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          filter={`url(#f${id})`}
          opacity={0.45}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function MacroBar({ label, value, target, color, unit = "g" }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-1 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="tabular text-muted">
          <AnimatedNumber value={value} className="font-bold text-ink" />/{Math.round(target)}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3/80">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, white), ${color})`, boxShadow: `0 0 12px -2px ${color}` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

export function Empty({ icon, title, desc, action }: { icon?: ReactNode; title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {desc && <div className="max-w-sm text-sm text-muted">{desc}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------- Toast ----------
type ToastItem = { id: number; text: string; kind: "ok" | "error" | "info" };
let toastId = 0;
const toastListeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];

export function toast(text: string, kind: ToastItem["kind"] = "ok") {
  const item = { id: ++toastId, text, kind };
  toasts = [...toasts, item].slice(-3);
  toastListeners.forEach((fn) => fn(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    toastListeners.forEach((fn) => fn(toasts));
  }, 2600);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    toastListeners.add(setItems);
    return () => {
      toastListeners.delete(setItems);
    };
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 pt-safe">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            role="status"
            layout
            initial={{ opacity: 0, y: -24, scale: 0.9, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, scale: 0.95, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            className={cx(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-pop)] backdrop-blur-xl",
              t.kind === "error"
                ? "border-danger/30 bg-danger/90 text-white"
                : t.kind === "info"
                  ? "border-white/10 bg-slate-900/90 text-white"
                  : "border-white/20 bg-gradient-accent text-white dark:text-slate-950"
            )}
          >
            <span className="text-base leading-none">{t.kind === "error" ? "⚠️" : t.kind === "info" ? "ℹ️" : "✓"}</span>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-2xl bg-surface-2/80 px-3 py-2.5 ring-1 ring-line/50 ring-inset", className)}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="tabular truncate text-lg font-bold tracking-tight">{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onClick,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      className={cx(
        "flex w-full items-center gap-3 py-2.5 text-left",
        onClick && "-mx-2 w-[calc(100%+1rem)] cursor-pointer rounded-xl px-2 transition hover:bg-surface-2",
        className
      )}
    >
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </div>
  );
}

export function confirmDialog(text: string): boolean {
  return window.confirm(text);
}

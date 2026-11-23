import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parseNum } from "../lib/format";

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
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-accent text-white dark:text-slate-950 hover:brightness-105 active:brightness-95 shadow-sm",
    train: "bg-train text-white dark:text-slate-950 hover:brightness-105 active:brightness-95 shadow-sm",
    secondary: "bg-surface-2 text-ink hover:bg-surface-3",
    outline: "border border-line bg-surface text-ink hover:bg-surface-2",
    ghost: "text-ink hover:bg-surface-2",
    danger: "bg-danger/10 text-danger hover:bg-danger/15",
  };
  const s = { sm: "h-8 px-3 text-sm gap-1.5", md: "h-10 px-4 text-[15px] gap-2", lg: "h-12 px-5 text-base gap-2" }[size];
  return (
    <button
      className={cx(
        "inline-flex select-none items-center justify-center rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        v[variant],
        s,
        className
      )}
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
      className={cx("inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between gap-2", className)}>
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">{children}</h2>
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
  return (
    <div className={cx("flex rounded-xl bg-surface-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-lg font-semibold whitespace-nowrap transition",
            size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
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
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-surface-3")}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-5.5" : "left-0.5")} />
      </span>
    </label>
  );
}

/** Bảng trượt từ dưới lên (điện thoại) / hộp thoại giữa màn hình (máy tính). */
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
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-fade absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          "animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <div className="min-w-0 text-lg font-bold">{title}</div>
          <IconButton label="Đóng" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ProgressRing({
  value,
  max,
  size = 120,
  stroke = 11,
  color = "var(--accent)",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = max > 0 && value > max * 1.02;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--danger)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
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
      <div className="mb-1 flex items-baseline justify-between gap-1 text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular text-muted">
          <b className="text-ink">{Math.round(value)}</b>/{Math.round(target)}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
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
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            "animate-sheet pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg",
            t.kind === "error" ? "bg-danger text-white" : t.kind === "info" ? "bg-slate-800 text-white" : "bg-accent text-white dark:text-slate-950"
          )}
        >
          {t.text}
        </div>
      ))}
    </div>,
    document.body
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-xl bg-surface-2 px-3 py-2", className)}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="tabular truncate text-lg font-bold">{value}</div>
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

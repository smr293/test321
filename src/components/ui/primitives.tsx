import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

/* ------------------------------- layout ------------------------------- */

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("card p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ------------------------------- buttons ------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------- display ------------------------------ */

export type BadgeTone = "neutral" | "accent" | "danger" | "warn" | "info";
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("badge", tone !== "neutral" && `badge-${tone}`, className)}>{children}</span>
  );
}

export function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case "active":
    case "attended":
    case "booked":
    case "paid":
    case "succeeded":
    case "completed":
    case "win":
    case "done":
      return "accent";
    case "trial":
    case "trialing":
    case "pending":
    case "waitlisted":
    case "open":
    case "scheduled":
    case "cancel_scheduled":
      return "info";
    case "past_due":
    case "overdue":
    case "no_show":
    case "failed":
    case "late_cancelled":
    case "loss":
    case "suspended":
    case "urgent":
      return "danger";
    case "paused":
    case "draft":
    case "void":
      return "warn";
    default:
      return "neutral";
  }
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <Badge>—</Badge>;
  return <Badge tone={statusTone(status)}>{(label ?? status).replace(/_/g, " ")}</Badge>;
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "var(--card-2)",
        borderColor: "var(--line)",
        color: "var(--ink)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center" style={{ borderColor: "var(--line-strong)" }}>
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--card-2)", color: "var(--accent)" }}>
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warn";
}) {
  const color =
    tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--muted)";
  return (
    <div className="card-flat p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
          {label}
        </p>
        {icon ? <span style={{ color }}>{icon}</span> : null}
      </div>
      <p className="stat-value mt-2 text-2xl">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value, tone = "accent", label }: { value: number; tone?: "accent" | "warn" | "danger"; label?: string }) {
  const pctValue = Math.max(0, Math.min(100, Math.round(value)));
  const color = tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--accent)";
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>{label}</span>
          <span className="stat-value">{pctValue}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--card-2)" }}
        role="progressbar"
        aria-valuenow={pctValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pctValue}%`, background: color }} />
      </div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("divider my-4", className)} />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "accent" | "danger" | "warn" | "info";
  title?: string;
  children: ReactNode;
}) {
  const map: Record<string, { bg: string; border: string; fg: string }> = {
    neutral: { bg: "var(--card-2)", border: "var(--line)", fg: "var(--ink)" },
    accent: { bg: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "color-mix(in srgb, var(--accent) 28%, transparent)", fg: "var(--ink)" },
    danger: { bg: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "color-mix(in srgb, var(--danger) 30%, transparent)", fg: "var(--ink)" },
    warn: { bg: "color-mix(in srgb, var(--warn) 10%, transparent)", border: "color-mix(in srgb, var(--warn) 30%, transparent)", fg: "var(--ink)" },
    info: { bg: "color-mix(in srgb, var(--info) 10%, transparent)", border: "color-mix(in srgb, var(--info) 30%, transparent)", fg: "var(--ink)" },
  };
  const c = map[tone];
  return (
    <div className="rounded-xl border p-3.5 text-sm" style={{ background: c.bg, borderColor: c.border, color: c.fg }}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div style={{ color: "var(--muted)" }}>{children}</div>
    </div>
  );
}

/* -------------------------------- forms ------------------------------- */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn("input", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn("textarea min-h-24", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn("select", className)} {...rest}>
      {children}
    </select>
  );
}

/* ------------------------------- helpers ------------------------------ */

export function SearchInput({ name = "q", placeholder = "Search…", defaultValue }: { name?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input"
        aria-label={placeholder}
      />
      <Button type="submit" variant="secondary" size="sm">
        Filter
      </Button>
    </div>
  );
}

export function Money({ cents, currency = "SEK", className }: { cents: number; currency?: string; className?: string }) {
  const formatted = new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format((cents ?? 0) / 100);
  return <span className={cn("stat-value", className)}>{formatted}</span>;
}

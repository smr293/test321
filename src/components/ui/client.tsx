"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "./primitives";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  pendingLabel?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button className={buttonClass(variant, size, className)} disabled={pending || rest.disabled} type="submit" {...rest}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}

export function Modal({
  trigger,
  title,
  description,
  children,
  wide,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize, triggerClassName)} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            ref={panelRef}
            tabIndex={-1}
            className={cn(
              "animate-in max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-2xl sm:rounded-2xl",
              wide ? "sm:max-w-3xl" : "sm:max-w-lg",
            )}
            style={{ background: "var(--surface)", borderColor: "var(--line-strong)" }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost btn-sm"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div onClick={(event) => event.stopPropagation()}>{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ConfirmSubmit({
  children,
  message,
  variant = "danger",
  size = "sm",
  className,
  name,
  value,
}: {
  children: ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border p-1" style={{ borderColor: "var(--line)", background: "var(--card)" }} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active === tab.id ? "bg-[var(--card-2)] text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) =>
        active === tab.id ? (
          <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" className="animate-in-fast">
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ThemeToggle({ initialTheme }: { initialTheme: "dark" | "light" | "system" }) {
  const [theme, setTheme] = useState(initialTheme);
  const apply = (next: "dark" | "light" | "system") => {
    setTheme(next);
    const root = document.documentElement;
    const resolved =
      next === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : next;
    root.classList.toggle("light", resolved === "light");
    document.cookie = `mma_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--line)" }}>
      {(["dark", "light", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          className={cn(
            "rounded-md px-2 py-1 text-xs capitalize",
            theme === t ? "bg-[var(--card-2)] text-[var(--ink)]" : "text-[var(--muted)]",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="text-xs" style={{ color: "var(--danger)" }} role="alert">
      {message}
    </p>
  );
}

/** Reusable inline toggle that submits its enclosing form. */
export function Toggle({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--accent)]" />
    </label>
  );
}

export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
      <summary className="cursor-pointer list-none text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <span className="text-[var(--accent)] transition-transform group-open:rotate-90">›</span>
          {summary}
        </span>
      </summary>
      <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
        {children}
      </div>
    </details>
  );
}

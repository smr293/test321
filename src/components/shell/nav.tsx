"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean; badge?: number };

function useActive() {
  const pathname = usePathname();
  return (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SidebarNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  const isActive = useActive();
  return (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main navigation">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link" data-active={isActive(item)}>
          <span className="shrink-0" aria-hidden>
            {item.icon}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="badge badge-accent px-1.5 py-0 text-[0.65rem]">{item.badge}</span>
          ) : null}
        </Link>
      ))}
      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </nav>
  );
}

export function MobileSidebar({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isActive = useActive();
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
        <Menu className="h-4 w-4" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="animate-in absolute inset-y-0 left-0 w-[86%] max-w-xs overflow-y-auto border-r p-4"
            style={{ background: "var(--surface)", borderColor: "var(--line)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Menu</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-0.5" onClick={() => setOpen(false)}>
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link" data-active={isActive(item)}>
                  <span aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            {children ? <div className="mt-6">{children}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const isActive = useActive();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)", borderColor: "var(--line)" }}
      aria-label="Main navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 text-[0.68rem] font-medium",
                  active ? "text-[var(--ink)]" : "text-[var(--muted)]",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn("flex h-7 w-9 items-center justify-center rounded-lg", active && "bg-[var(--card-2)]")}
                  style={{ color: active ? "var(--accent)" : undefined }}
                  aria-hidden
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

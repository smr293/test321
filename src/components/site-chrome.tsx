import Link from "next/link";
import { ButtonLink } from "@/components/ui/primitives";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ background: "color-mix(in srgb, var(--bg) 80%, transparent)", borderColor: "var(--line)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            <span className="text-sm font-black">M</span>
          </span>
          MMA OS
        </Link>
        <nav className="hidden items-center gap-6 text-sm sm:flex" aria-label="Site">
          <Link href="/features" style={{ color: "var(--muted)" }} className="hover:text-[var(--ink)]">Features</Link>
          <Link href="/pricing" style={{ color: "var(--muted)" }} className="hover:text-[var(--ink)]">Pricing</Link>
          <Link href="/login" style={{ color: "var(--muted)" }} className="hover:text-[var(--ink)]">Sign in</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">Sign in</ButtonLink>
          <ButtonLink href="/register" size="sm">Get started</ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ color: "var(--muted)" }}>
        <p>© {new Date().getFullYear()} MMA OS · Train. Fight. Improve.</p>
        <div className="flex flex-wrap gap-5">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/admin/login">Admin</Link>
        </div>
      </div>
    </footer>
  );
}

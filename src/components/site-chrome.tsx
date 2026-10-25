import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

function Wordmark() {
  return (
    <span className="display text-[1.45rem] leading-none tracking-[0.02em]">
      MMA<span style={{ color: "var(--accent)" }}>OS</span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        borderColor: "var(--line)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-5 py-3">
        <Link href="/" className="flex items-baseline gap-3" aria-label="MMA OS — home">
          <Wordmark />
          <span className="eyebrow hidden md:block">gym + fighter platform</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-6 sm:flex" aria-label="Site">
          <Link href="/features" className="eyebrow link-quiet">
            Features
          </Link>
          <Link href="/pricing" className="eyebrow link-quiet">
            Pricing
          </Link>
          <Link href="/login" className="eyebrow link-quiet">
            Sign in
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-4 sm:ml-6">
          <Link href="/register" className="eyebrow link-quiet hidden sm:block">
            Start
          </Link>
          <Link href="/login" className="arrow-link text-xs">
            Open demo
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-[22ch] text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            Software for MMA gyms, their coaches and the fighters on their mats.
          </p>
        </div>
        <div>
          <p className="eyebrow">Product</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/features" className="link-quiet">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="link-quiet">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/register" className="link-quiet">
                Start a gym
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Sign in</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/login" className="link-quiet">
                Gym, coach, athlete
              </Link>
            </li>
            <li>
              <Link href="/admin/login" className="link-quiet">
                Platform admin
              </Link>
            </li>
            <li>
              <Link href="/forgot-password" className="link-quiet">
                Reset password
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Status</p>
          <ul className="mono mt-3 space-y-2 text-[0.7rem]" style={{ color: "var(--muted)" }}>
            <li>all systems normal</li>
            <li>
              <Link href="/api/health" className="link-quiet">
                /api/health
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mono mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-5 py-4 text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
          <span>© {new Date().getFullYear()} MMA OS</span>
          <span>Built for people who show up</span>
        </div>
      </div>
    </footer>
  );
}

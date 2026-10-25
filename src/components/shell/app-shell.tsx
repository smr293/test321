import Link from "next/link";
import { Bell, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, ButtonLink, Badge } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/client";
import { BottomNav, MobileSidebar, SidebarNav, type NavItem } from "./nav";
import { logoutAction } from "@/lib/actions/auth";
import { setActiveOrgAction } from "@/lib/actions/prefs";
import type { AuthState } from "@/lib/authz";

function Brand({ label = "MMA OS", accent }: { label?: string; accent?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: accent ?? "var(--accent)", color: "var(--accent-ink)" }}>
        <span className="text-sm font-black">M</span>
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function OrgSwitcher({ auth, current }: { auth: AuthState; current?: string | null }) {
  if (auth.memberships.length <= 1) return null;
  return (
    <form action={setActiveOrgAction} className="mt-3">
      <label className="sr-only" htmlFor="orgId">
        Active gym
      </label>
      <select
        id="orgId"
        name="orgId"
        defaultValue={current ?? undefined}
        className="select text-xs"
      >
        {auth.memberships.map((m) => (
          <option key={m.org.id} value={m.org.id}>
            {m.org.name} · {m.role}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-secondary btn-sm mt-2 w-full">
        Switch gym
      </button>
    </form>
  );
}

function UserFooter({ auth }: { auth: AuthState }) {
  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2.5 px-1 py-1">
        <Avatar name={auth.user.name} src={auth.user.avatarUrl} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{auth.user.name}</p>
          <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
            {auth.user.email}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <ButtonLink href="/settings/security" variant="ghost" size="sm" className="flex-1 justify-start">
          <Settings className="h-3.5 w-3.5" /> Security
        </ButtonLink>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-ghost btn-sm" aria-label="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function StaffShell({
  auth,
  nav,
  orgName,
  orgRole,
  unread,
  children,
  supportMode,
  contextLabel,
}: {
  auth: AuthState;
  nav: NavItem[];
  orgName?: string;
  orgRole?: string;
  unread: number;
  children: ReactNode;
  supportMode?: boolean;
  contextLabel: string;
}) {
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r p-4 lg:flex" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <Brand />
        {orgName ? (
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <p className="text-[0.68rem] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {contextLabel}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold">{orgName}</p>
            {orgRole ? <Badge className="mt-1.5">{orgRole}</Badge> : null}
            <OrgSwitcher auth={auth} current={auth.activeOrg?.org.id} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-1 flex-col overflow-y-auto">
          <SidebarNav items={nav} footer={<UserFooter auth={auth} />} />
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur sm:px-6"
          style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", borderColor: "var(--line)" }}
        >
          <div className="flex items-center gap-2">
            <span className="lg:hidden">
              <MobileSidebar items={nav}>
                <UserFooter auth={auth} />
              </MobileSidebar>
            </span>
            <div className="lg:hidden">
              <Brand label={orgName ?? "MMA OS"} />
            </div>
            <span className="hidden text-sm font-medium lg:inline" style={{ color: "var(--muted)" }}>
              {contextLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {supportMode ? <Badge tone="warn">Support mode</Badge> : null}
            <ThemeToggle initialTheme={auth.user.theme} />
            <Link
              href={contextLabel === "Platform admin" ? "/admin" : "/app"}
              className="btn btn-ghost btn-sm relative"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell className="h-4 w-4" />
              {unread ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                  {unread}
                </span>
              ) : null}
            </Link>
            <div className="hidden sm:block">
              <Avatar name={auth.user.name} src={auth.user.avatarUrl} size={30} />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}

export function FighterShell({
  auth,
  nav,
  unread,
  children,
}: {
  auth: AuthState;
  nav: NavItem[];
  unread: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Fighter sections">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="btn btn-ghost btn-sm">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle initialTheme={auth.user.theme} />
            <Link href="/app/notifications" className="btn btn-ghost btn-sm relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="h-4 w-4" />
              {unread ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
                  {unread}
                </span>
              ) : null}
            </Link>
            <Link href="/app/profile" aria-label="Your profile">
              <Avatar name={auth.user.name} src={auth.user.avatarUrl} size={30} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10">
        {children}
      </main>
      <BottomNav items={nav} />
    </div>
  );
}

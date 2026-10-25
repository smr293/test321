import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Swords,
  UserCog,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/primitives";
import { getAuth, getOrgContext, isStaffRole } from "@/lib/authz";
import { unreadCount } from "@/lib/notifications";
import { getEntitlements } from "@/lib/entitlements";

export const metadata = { title: "Gym" };

export default async function GymLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/gym");
  const ctx = await getOrgContext();
  if (!ctx) {
    if (auth.memberships.length === 0) redirect("/app/onboarding");
    redirect("/app");
  }

  // Members and fighters have no staff surface: send them to the athlete app.
  // Their role carries zero permissions, but the UI shell must not render at all.
  if (!isStaffRole(ctx.role)) redirect("/app");

  const unread = await unreadCount(auth.user.id);
  const ent = await getEntitlements(ctx.org.id);
  const role = ctx.role;

  const nav = [
    { href: "/gym", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
    { href: "/gym/members", label: "Members", icon: <Users className="h-4 w-4" /> },
    { href: "/gym/memberships", label: "Memberships", icon: <CreditCard className="h-4 w-4" /> },
    { href: "/gym/calendar", label: "Calendar", icon: <CalendarDays className="h-4 w-4" /> },
    { href: "/gym/classes", label: "Classes", icon: <Dumbbell className="h-4 w-4" /> },
    { href: "/gym/attendance", label: "Attendance", icon: <CheckSquare className="h-4 w-4" /> },
    ...(role === "coach"
      ? []
      : [
          { href: "/gym/coaches", label: "Coaches", icon: <UserCog className="h-4 w-4" /> },
          { href: "/gym/fighters", label: "Fighters", icon: <Swords className="h-4 w-4" /> },
        ]),
    { href: "/gym/fight-camps", label: "Fight camps", icon: <Swords className="h-4 w-4" /> },
    ...(role === "coach"
      ? []
      : [
          { href: "/gym/payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
          { href: "/gym/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
        ]),
    { href: "/gym/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
    ...(role === "owner" || role === "manager"
      ? [{ href: "/gym/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> }]
      : []),
  ];

  if (ctx.org.status === "suspended") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="max-w-lg">
          <h1 className="text-lg font-semibold">This gym is suspended</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            {ctx.org.suspendedReason ?? "Contact MMA OS support to restore access."}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <StaffShell
      auth={auth}
      nav={nav}
      orgName={ctx.org.name}
      orgRole={role}
      unread={unread}
      supportMode={ctx.supportMode}
      contextLabel="Gym workspace"
    >
      {ent.status === "past_due" ? (
        <div className="mb-4">
          <Card className="border-[color-mix(in_srgb,var(--danger)_35%,transparent)] py-3">
            <p className="text-sm">
              <strong>Your MMA OS subscription payment failed.</strong>{" "}
              <span style={{ color: "var(--muted)" }}>Update billing in Settings → Subscription to avoid interruption.</span>
            </p>
          </Card>
        </div>
      ) : null}
      {children}
    </StaffShell>
  );
}

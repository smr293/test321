import {
  BarChart3,
  CreditCard,
  Flag,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Building2,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/shell/app-shell";
import { Badge, Callout } from "@/components/ui/primitives";
import { getAuth } from "@/lib/authz";
import { exitSupportModeAction } from "@/lib/actions/superadmin";
import { SubmitButton } from "@/components/ui/client";
import { unreadCount } from "@/lib/notifications";

export const metadata = { title: "Platform admin" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/admin/login?next=/admin");
  if (!auth.isSuperAdmin) redirect("/app");
  const unread = await unreadCount(auth.user.id);

  const nav = [
    { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
    { href: "/admin/orgs", label: "Gyms", icon: <Building2 className="h-4 w-4" /> },
    { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { href: "/admin/plans", label: "SaaS plans", icon: <CreditCard className="h-4 w-4" /> },
    { href: "/admin/revenue", label: "Revenue", icon: <BarChart3 className="h-4 w-4" /> },
    { href: "/admin/tickets", label: "Support", icon: <LifeBuoy className="h-4 w-4" /> },
    { href: "/admin/data-requests", label: "Data requests", icon: <Inbox className="h-4 w-4" /> },
    { href: "/admin/flags", label: "Feature flags", icon: <Flag className="h-4 w-4" /> },
    { href: "/admin/email", label: "Email outbox", icon: <Mail className="h-4 w-4" /> },
    { href: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
    { href: "/admin/settings", label: "Platform settings", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <StaffShell auth={auth} nav={nav} unread={unread} contextLabel="Platform admin" orgName="MMA OS" orgRole="super admin">
      {auth.supportMode ? (
        <div className="mb-4">
          <Callout tone="warn" title="Support mode">
            You are viewing <strong>{auth.superAdminOrg?.name}</strong> as platform staff. Gym data is read-only in this mode.
            <form action={exitSupportModeAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="next" value="/admin/orgs" />
              <SubmitButton variant="secondary" size="sm">Exit support mode</SubmitButton>
              <Badge tone="warn">Read-only · audited</Badge>
            </form>
          </Callout>
        </div>
      ) : null}
      {children}
      <p className="mt-8 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
        <ShieldCheck className="h-3.5 w-3.5" /> Every platform action is written to the hash-chained audit log.
      </p>
    </StaffShell>
  );
}

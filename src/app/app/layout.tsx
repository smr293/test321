import { CalendarDays, Home, LineChart, Swords, User } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FighterShell } from "@/components/shell/app-shell";
import { getAuth, getOrgContext } from "@/lib/authz";
import { unreadCount } from "@/lib/notifications";

export const metadata = { title: "My training" };

export default async function FighterAppLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app");
  const ctx = await getOrgContext();
  const unread = await unreadCount(auth.user.id);

  if (!ctx || !ctx.membership) {
    return <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">{children}</div>;
  }

  // The portal is for athletes. Staff use the gym workspace (support mode excepted).
  if (ctx.role !== "fighter" && !ctx.supportMode) redirect("/gym");

  const nav = [
    { href: "/app", label: "Home", icon: <Home className="h-5 w-5" />, exact: true },
    { href: "/app/schedule", label: "Schedule", icon: <CalendarDays className="h-5 w-5" /> },
    { href: "/app/progress", label: "Progress", icon: <LineChart className="h-5 w-5" /> },
    { href: "/app/fights", label: "Fights", icon: <Swords className="h-5 w-5" /> },
    { href: "/app/profile", label: "Profile", icon: <User className="h-5 w-5" /> },
  ];

  return (
    <FighterShell auth={auth} nav={nav} unread={unread}>
      {children}
    </FighterShell>
  );
}

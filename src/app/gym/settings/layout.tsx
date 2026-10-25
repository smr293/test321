import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrgPage } from "@/lib/authz";
import { PageHeader } from "@/components/ui/primitives";

const tabs = [
  { href: "/gym/settings", label: "Gym profile" },
  { href: "/gym/settings/locations", label: "Locations" },
  { href: "/gym/settings/team", label: "Team & permissions" },
  { href: "/gym/settings/billing", label: "Subscription" },
];

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireOrgPage();
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Gym profile, locations, team permissions and your MMA OS subscription." />
      <div className="flex gap-1 overflow-x-auto border-b pb-px" style={{ borderColor: "var(--line)" }}>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium hover:bg-[var(--card-2)]"
            style={{ color: "var(--muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}

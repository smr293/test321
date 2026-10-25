import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { KeyRound, Lock, Smartphone } from "lucide-react";
import { db } from "@/db/client";
import { securityEvents, sessions } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, CardHeader, KeyValue, PageHeader } from "@/components/ui/primitives";
import { getAuth } from "@/lib/authz";
import { ChangePasswordForm, MfaSetup } from "@/components/settings/security-forms";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";
import { formatDateTime } from "@/lib/utils";
import { revokeAllSessions } from "@/lib/session";

export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/settings/security");
  const [events, activeSessions] = await Promise.all([
    db.select().from(securityEvents).where(eq(securityEvents.userId, auth.user.id)).orderBy(desc(securityEvents.createdAt)).limit(8),
    db.select().from(sessions).where(eq(sessions.userId, auth.user.id)).orderBy(desc(sessions.createdAt)).limit(5),
  ]);
  const secret = auth.user.mfaSecret ?? generateTotpSecret();
  const otpauth = otpauthUrl(secret, auth.user.email);
  const active = activeSessions.filter((s) => !s.revokedAt && s.expiresAt > new Date());

  return (
    <main className="mx-auto max-w-2xl px-4 py-8" id="main">
      <PageHeader
        title="Security"
        description="Passwords, two-factor authentication and active sessions."
        actions={<ButtonLink href={auth.isSuperAdmin ? "/admin" : "/app/profile"} variant="ghost" size="sm">← Back</ButtonLink>}
      />

      <div className="mt-5 space-y-4">
        <Card>
          <CardHeader title="Password" description="Argon2id hashed. We never store plaintext passwords." />
          <ChangePasswordForm />
        </Card>

        <Card>
          <CardHeader
            title="Two-factor authentication"
            description="Required for platform administrators in production."
            action={<Badge tone={auth.user.mfaEnabled ? "accent" : "neutral"}>{auth.user.mfaEnabled ? "on" : "off"}</Badge>}
          />
          <MfaSetup secret={secret} otpauth={otpauth} enabled={auth.user.mfaEnabled} />
        </Card>

        <Card>
          <CardHeader title="Active sessions" action={<Badge>{active.length}</Badge>} />
          <div className="mt-2 space-y-2 text-sm">
            {active.map((s) => (
              <div key={s.id} className="subtle flex items-center justify-between gap-2 p-2.5">
                <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> {s.userAgent?.slice(0, 42) ?? "Unknown device"}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(s.lastSeenAt)}</span>
              </div>
            ))}
          </div>
          <form
            action={async () => {
              "use server";
              await revokeAllSessions((await getAuth())?.user.id ?? "", (await getAuth())?.session.sessionId);
            }}
            className="mt-3"
          >
            <button type="submit" className="btn btn-secondary btn-sm"><Lock className="h-3.5 w-3.5" /> Sign out other sessions</button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Recent security activity" action={<KeyRound className="h-4 w-4 opacity-50" />} />
          <ul className="mt-2 space-y-1.5 text-sm">
            {events.length ? (
              events.map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b py-1.5" style={{ borderColor: "var(--line)" }}>
                  <span>{e.type.replace(/\./g, " ")}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(e.createdAt)}</span>
                </li>
              ))
            ) : (
              <li style={{ color: "var(--muted)" }}>No events yet.</li>
            )}
          </ul>
        </Card>

        <Callout tone="info" title="Account recovery">
          Use <Link href="/forgot-password" className="underline">forgot password</Link> to reset access. Administrators should also keep 2FA recovery codes with their security team.
        </Callout>
      </div>
    </main>
  );
}

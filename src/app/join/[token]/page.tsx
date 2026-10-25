import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { invitations, organizations } from "@/db/schema";
import { Avatar, Callout, Card, ButtonLink } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAuth } from "@/lib/authz";
import { acceptInviteAction } from "@/lib/actions/gym";

export const metadata = { title: "Join gym" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const auth = await getAuth();
  const invite = (
    await db
      .select({ invite: invitations, org: organizations })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.orgId))
      .where(and(eq(invitations.token, token), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .limit(1)
  )[0];

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        {invite ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={invite.org.name} size={44} />
              <div>
                <h1 className="text-lg font-semibold">{invite.org.name}</h1>
                <p className="text-sm" style={{ color: "var(--muted)" }}>Invitation for {invite.invite.email} · {invite.invite.role}</p>
              </div>
            </div>
            {auth ? (
              <form action={acceptInviteAction} className="mt-5">
                <input type="hidden" name="token" value={token} />
                <p className="text-sm" style={{ color: "var(--muted)" }}>Signed in as {auth.user.email}.</p>
                <SubmitButton className="mt-3 w-full">Accept invitation</SubmitButton>
              </form>
            ) : (
              <div className="mt-5 space-y-3">
                <Callout tone="info">Sign in or create an account with <strong>{invite.invite.email}</strong>, then open this link again.</Callout>
                <ButtonLink href={`/login?next=/join/${token}`} className="w-full">Sign in</ButtonLink>
                <ButtonLink href="/register" variant="secondary" className="w-full">Create account</ButtonLink>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>This link may have expired or been revoked. Ask your gym for a new invitation.</p>
            <Link href="/app/onboarding" className="btn btn-secondary mt-4">Join with a gym code</Link>
          </div>
        )}
        <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>MMA OS · Train. Fight. Improve.</p>
      </Card>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, or } from "drizzle-orm";
import { MessageSquare, Send } from "lucide-react";
import { db } from "@/db/client";
import { messages, orgMembers, users } from "@/db/schema";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { getAuth, getOrgContext } from "@/lib/authz";
import { sendMessageAction } from "@/lib/actions/gym";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function FighterMessagesPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login?next=/app/messages");
  const ctx = await getOrgContext();
  const params = await searchParams;
  if (!ctx) {
    return (
      <Card><EmptyState icon={<MessageSquare className="h-5 w-5" />} title="Join a gym to message coaches" description="Your gym's staff will appear here." /></Card>
    );
  }
  const coaches = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, ctx.org.id), or(eq(orgMembers.role, "coach"), eq(orgMembers.role, "owner"))));
  const active = params.with ? coaches.find((c) => c.user.id === params.with) : coaches[0];
  const thread = active
    ? await db
        .select({ msg: messages, sender: users })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(
          and(
            eq(messages.orgId, ctx.org.id),
            or(
              and(eq(messages.senderId, auth.user.id), eq(messages.recipientId, active.user.id)),
              and(eq(messages.recipientId, auth.user.id), eq(messages.senderId, active.user.id)),
            ),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(50)
    : [];

  return (
    <div className="space-y-4">
      <PageHeader title="Messages" description="Ask your coach about technique, camps or your plan." />
      <Card>
        <CardHeader title="Choose a coach" />
        <div className="mt-2 flex flex-wrap gap-2">
          {coaches.map((c) => (
            <Link
              key={c.user.id}
              href={`/app/messages?with=${c.user.id}`}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: active?.user.id === c.user.id ? "var(--accent)" : "var(--line)", background: "var(--card-2)" }}
            >
              <Avatar name={c.user.name} size={24} /> {c.user.name}
              <Badge>{c.member.role}</Badge>
            </Link>
          ))}
          {!coaches.length ? <p className="text-sm" style={{ color: "var(--muted)" }}>No coaches at this gym yet.</p> : null}
        </div>
      </Card>

      {active ? (
        <Card>
          <CardHeader title={active.user.name} description={active.member.title ?? "Coach"} />
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {thread.length ? (
              [...thread].reverse().map((t) => (
                <div
                  key={t.msg.id}
                  className={`max-w-[85%] rounded-xl border p-2.5 text-sm ${t.msg.senderId === auth.user.id ? "ml-auto" : ""}`}
                  style={{ borderColor: "var(--line)", background: t.msg.senderId === auth.user.id ? "var(--card-2)" : "var(--surface)" }}
                >
                  <p>{t.msg.body}</p>
                  <p className="mt-1 text-[0.65rem]" style={{ color: "var(--muted)" }}>{t.sender.name} · {formatDateTime(t.msg.createdAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No messages yet. Say hello.</p>
            )}
          </div>
          <form action={sendMessageAction} className="mt-3 space-y-2">
            <input type="hidden" name="orgId" value={ctx.org.id} />
            <input type="hidden" name="recipientId" value={active.member.id} />
            <input type="hidden" name="returnTo" value={`/app/messages?with=${active.user.id}`} />
            <Textarea name="body" required placeholder={`Message ${active.user.name.split(" ")[0]}…`} />
            <SubmitButton size="sm"><Send className="h-3.5 w-3.5" /> Send</SubmitButton>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

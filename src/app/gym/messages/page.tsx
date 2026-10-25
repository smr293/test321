import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Megaphone, MessageSquare, Send } from "lucide-react";
import { db } from "@/db/client";
import { announcements, messages, orgMembers, users } from "@/db/schema";
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Textarea, Callout } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { sendAnnouncementAction, sendMessageAction } from "@/lib/actions/gym";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const { with: withMember } = await searchParams;

  const [announcementRows, memberList, thread, sent] = await Promise.all([
    db
      .select({ ann: announcements, author: users })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.authorId))
      .where(eq(announcements.orgId, orgId))
      .orderBy(desc(announcements.createdAt))
      .limit(20),
    db
      .select({ member: orgMembers, user: users })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), isNull(orgMembers.archivedAt)))
      .orderBy(users.name),
    withMember
      ? db
          .select({ msg: messages, sender: users })
          .from(messages)
          .innerJoin(users, eq(users.id, messages.senderId))
          .where(
            and(
              eq(messages.orgId, orgId),
              or(
                and(eq(messages.senderId, ctx.user.id), eq(messages.recipientId, withMember)),
                and(eq(messages.recipientId, ctx.user.id), eq(messages.senderId, withMember)),
              ),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(50)
      : Promise.resolve([]),
    db
      .select({ msg: messages, sender: users, recipient: users })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(and(eq(messages.orgId, orgId), eq(messages.senderId, ctx.user.id)))
      .orderBy(desc(messages.createdAt))
      .limit(20),
  ]);

  const canAnnounce = ctx.permissions.has("announcements:send");
  const canMessage = ctx.permissions.has("messages:send");
  const counterpart = withMember ? memberList.find((m) => m.member.userId === withMember) : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Messages" description="Announcements for everyone, direct messages for individuals." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Send an announcement" description="In-app + email to the selected audience" />
          {canAnnounce ? (
            <form action={sendAnnouncementAction} className="mt-3 space-y-3">
              <input type="hidden" name="orgId" value={orgId} />
              <Field label="Title"><Input name="title" required placeholder="New morning BJJ classes" /></Field>
              <Field label="Message"><Textarea name="body" required placeholder="Starting Monday, BJJ runs Mon/Wed/Fri at 07:00 in Kista." /></Field>
              <Field label="Audience">
                <Select name="audience" defaultValue="all">
                  <option value="all">Everyone</option>
                  <option value="fighters">Members only</option>
                  <option value="coaches">Coaches only</option>
                  <option value="staff">Staff only</option>
                </Select>
              </Field>
              <SubmitButton><Send className="h-4 w-4" /> Send announcement</SubmitButton>
            </form>
          ) : (
            <Callout tone="warn">You do not have permission to send announcements.</Callout>
          )}
        </Card>

        <Card>
          <CardHeader title="Direct message" description="Start a conversation with a member or coach" />
          <form method="get" className="mt-3 flex gap-2">
            <Select name="with" defaultValue={withMember ?? ""} aria-label="Choose person">
              <option value="">Choose a person</option>
              {memberList.filter((m) => m.member.userId !== ctx.user.id).map((m) => (
                <option key={m.member.userId} value={m.member.userId}>{m.user.name} · {m.member.role}</option>
              ))}
            </Select>
            <button type="submit" className="btn btn-secondary btn-sm">Open</button>
          </form>
          {counterpart ? (
            <div className="mt-3">
              <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                <Avatar name={counterpart.user.name} size={28} />
                <p className="text-sm font-medium">{counterpart.user.name}</p>
              </div>
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                {thread.length ? (
                  [...thread].reverse().map((t) => (
                    <div key={t.msg.id} className={`rounded-lg p-2.5 text-sm ${t.msg.senderId === ctx.user.id ? "ml-6" : "mr-6"}`} style={{ background: t.msg.senderId === ctx.user.id ? "var(--card-2)" : "var(--surface)", border: "1px solid var(--line)" }}>
                      <p>{t.msg.body}</p>
                      <p className="mt-1 text-[0.65rem]" style={{ color: "var(--muted)" }}>{formatDateTime(t.msg.createdAt)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No messages yet.</p>
                )}
              </div>
              {canMessage ? (
                <form action={sendMessageAction} className="mt-2 space-y-2">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="recipientId" value={counterpart.member.id} />
                  <input type="hidden" name="returnTo" value={`/gym/messages?with=${counterpart.member.userId}`} />
                  <Textarea name="body" required placeholder={`Message ${counterpart.user.name.split(" ")[0]}…`} />
                  <SubmitButton size="sm"><Send className="h-3.5 w-3.5" /> Send</SubmitButton>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="mt-3"><EmptyState icon={<MessageSquare className="h-5 w-5" />} title="Pick a person" description="Conversations are private between you and the recipient." /></div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Announcement history" action={<Badge>{announcementRows.length}</Badge>} />
          <div className="mt-2 space-y-2">
            {announcementRows.length ? (
              announcementRows.map((a) => (
                <div key={a.ann.id} className="subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{a.ann.title}</p>
                    <Badge>{a.ann.audience}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--muted)" }}>{a.ann.body}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{a.author.name} · {formatDateTime(a.ann.createdAt)}</p>
                </div>
              ))
            ) : (
              <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements yet" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recently sent" description="Your direct messages" />
          <div className="mt-2 space-y-2">
            {sent.length ? (
              sent.map((s) => (
                <div key={s.msg.id} className="subtle p-2.5 text-sm">
                  <p className="line-clamp-2">{s.msg.body}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{formatDateTime(s.msg.createdAt)}</p>
                </div>
              ))
            ) : (
              <EmptyState title="No direct messages" description="Open a conversation above." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

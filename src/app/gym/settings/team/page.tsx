import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, orgMembers, users } from "@/db/schema";
import { Avatar, Badge, Callout, Card, CardHeader, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmSubmit, Modal, SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { inviteMemberAction, revokeInvitationAction, setMemberRoleAction, updateStaffPermissionsAction } from "@/lib/actions/gym";
import { PERMISSIONS } from "@/lib/authz";
import { formatDate, parseJson } from "@/lib/utils";

export const metadata = { title: "Team & permissions" };

export default async function TeamPage() {
  const ctx = await requireOrgPage();
  const canManage = ctx.permissions.has("staff:manage");
  const staff = await db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, ctx.org.id), isNull(orgMembers.archivedAt)))
    .orderBy(orgMembers.role);
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.orgId, ctx.org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Team"
          description="Owners have full access. Managers can be limited to specific tools. Coaches only see their athletes and classes."
          action={canManage ? (
            <Modal trigger={<>Invite teammate</>} title="Invite a teammate" triggerSize="sm">
              <form action={inviteMemberAction} className="space-y-3">
                <input type="hidden" name="orgId" value={ctx.org.id} />
                <Field label="Email"><Input name="email" type="email" required /></Field>
                <Field label="Role">
                  <Select name="role" defaultValue="coach">
                    <option value="coach">Coach</option>
                    <option value="manager">Manager</option>
                    <option value="fighter">Member</option>
                  </Select>
                </Field>
                <SubmitButton>Send invitation</SubmitButton>
              </form>
            </Modal>
          ) : null}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Joined</th><th className="text-right">Permissions</th></tr></thead>
            <tbody>
              {staff.map(({ member, user }) => (
                <tr key={member.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={user.name} size={28} />
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canManage && member.role !== "owner" ? (
                      <form action={setMemberRoleAction} className="flex items-center gap-1">
                        <input type="hidden" name="orgId" value={ctx.org.id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <Select name="role" defaultValue={member.role} className="h-8 py-0 text-xs" aria-label={`Role for ${user.name}`}>
                          <option value="fighter">Member</option>
                          <option value="coach">Coach</option>
                          <option value="manager">Manager</option>
                        </Select>
                        <SubmitButton size="sm" variant="ghost">Save</SubmitButton>
                      </form>
                    ) : (
                      <Badge tone={member.role === "owner" ? "accent" : "neutral"}>{member.role}</Badge>
                    )}
                  </td>
                  <td><Badge>{member.status}</Badge></td>
                  <td className="text-sm">{formatDate(member.joinedAt ?? member.createdAt)}</td>
                  <td className="text-right">
                    {canManage && member.role === "manager" ? (
                      <Modal trigger={<>Edit</>} title={`Permissions for ${user.name}`} triggerVariant="secondary" triggerSize="sm" wide>
                        <form action={updateStaffPermissionsAction} className="space-y-3">
                          <input type="hidden" name="orgId" value={ctx.org.id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <div className="grid gap-1 sm:grid-cols-2">
                            {PERMISSIONS.filter((p) => !["org:manage", "staff:manage"].includes(p)).map((permission) => {
                              const current = parseJson<string[]>(member.permissions, []);
                              return (
                                <label key={permission} className="flex items-center gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: "var(--line)" }}>
                                  <input type="checkbox" name="permissions" value={permission} defaultChecked={current.includes(permission)} className="h-4 w-4 accent-[var(--accent)]" />
                                  {permission.replace(":", " · ")}
                                </label>
                              );
                            })}
                          </div>
                          <SubmitButton>Save permissions</SubmitButton>
                        </form>
                      </Modal>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pending invitations" action={<Badge>{pending.length}</Badge>} />
        <div className="mt-2 space-y-2">
          {pending.length ? (
            pending.map((invite) => (
              <div key={invite.id} className="subtle flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{invite.role} · expires {formatDate(invite.expiresAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Badge>{invite.role}</Badge>
                  {canManage ? (
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="orgId" value={ctx.org.id} />
                      <input type="hidden" name="invitationId" value={invite.id} />
                      <ConfirmSubmit message="Revoke this invitation?" variant="ghost">Revoke</ConfirmSubmit>
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No pending invitations" />
          )}
        </div>
      </Card>

      <Callout tone="info" title="How permissions work">
        Permissions are enforced on the server for every action. Coaches can manage classes and attendance but never
        billing or staff. Managers only get the permissions you tick above.
      </Callout>
    </div>
  );
}

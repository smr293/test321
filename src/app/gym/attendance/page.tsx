import Link from "next/link";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { CheckSquare, QrCode, Search, UserCheck } from "lucide-react";
import { db } from "@/db/client";
import { attendance, bookings, classSessions, classes, orgMembers, users } from "@/db/schema";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
} from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { requireOrgPage } from "@/lib/authz";
import { markAttendanceAction, qrCheckInAction, staffCheckInAction } from "@/lib/actions/gym";
import { formatTime, startOfDay, endOfDay, formatDate } from "@/lib/utils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrgPage();
  const orgId = ctx.org.id;
  const { q } = await searchParams;
  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

  const [todaysSessions, recent, searchResults, noShows, weekCount] = await Promise.all([
    db
      .select({
        session: classSessions,
        cls: classes,
        attended: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status = 'attended')`,
        booked: sql<number>`(select count(*) from bookings b where b.session_id = ${classSessions.id} and b.status in ('booked','attended'))`,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(classSessions.orgId, orgId), gte(classSessions.startsAt, start), lte(classSessions.startsAt, end)))
      .orderBy(asc(classSessions.startsAt)),
    db
      .select({ att: attendance, member: orgMembers, user: users, cls: classes })
      .from(attendance)
      .innerJoin(orgMembers, eq(orgMembers.id, attendance.memberId))
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(classSessions, eq(classSessions.id, attendance.sessionId))
      .leftJoin(classes, eq(classes.id, classSessions.classId))
      .where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, start), lte(attendance.checkedInAt, end)))
      .orderBy(desc(attendance.checkedInAt))
      .limit(50),
    q
      ? db
          .select({ member: orgMembers, user: users })
          .from(orgMembers)
          .innerJoin(users, eq(users.id, orgMembers.userId))
          .where(and(eq(orgMembers.orgId, orgId), or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))))
          .limit(8)
      : Promise.resolve([]),
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "no_show"), gte(bookings.bookedAt, new Date(Date.now() - 30 * 86400000)))),
    db.select({ n: count() }).from(attendance).where(and(eq(attendance.orgId, orgId), gte(attendance.checkedInAt, new Date(Date.now() - 7 * 86400000)))),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description={`${formatDate(today)} · check members in, or let them scan the QR code at the door.`}
        actions={<ButtonLink href="/gym/calendar" variant="secondary" size="sm">Open calendar</ButtonLink>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Checked in today" value={recent.length} icon={<UserCheck className="h-4 w-4" />} tone="accent" />
        <Stat label="Last 7 days" value={Number(weekCount[0]?.n ?? 0)} icon={<CheckSquare className="h-4 w-4" />} />
        <Stat label="No-shows (30 days)" value={Number(noShows[0]?.n ?? 0)} tone={Number(noShows[0]?.n ?? 0) > 5 ? "warn" : "neutral"} />
      </div>


      <Card className="mt-4">
        <CardHeader title="QR check-in" description="Scan at the door. Codes rotate daily and each scan can only be used once." />
        <form action={qrCheckInAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
          <Input name="payload" required placeholder="MMAOS:org:member:2026-01-01.signature" aria-label="Scanned QR payload" />
          <Select name="sessionId" defaultValue="" aria-label="Class session (optional)">
            <option value="">No class (open gym)</option>
            {todaysSessions.map((s) => (
              <option key={s.session.id} value={s.session.id}>{formatTime(s.session.startsAt)} · {s.cls.name}</option>
            ))}
          </Select>
          <SubmitButton><QrCode className="h-4 w-4" /> Check in</SubmitButton>
        </form>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Quick check-in" description="Works without a booking — perfect for open gym." />
          <form method="get" className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <Input name="q" defaultValue={q} placeholder="Search a member by name or email" className="pl-9" aria-label="Search member to check in" />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Search</button>
          </form>
          {q ? (
            <div className="mt-3 space-y-2">
              {searchResults.length ? (
                searchResults.map((r) => (
                  <div key={r.member.id} className="subtle flex items-center gap-2 p-2.5">
                    <Avatar name={r.user.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.user.name}</p>
                      <p className="truncate text-xs" style={{ color: "var(--muted)" }}>{r.user.email}</p>
                    </div>
                    <form action={staffCheckInAction}>
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="memberId" value={r.member.id} />
                      <SubmitButton size="sm">Check in</SubmitButton>
                    </form>
                  </div>
                ))
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No member found for “{q}”.</p>
              )}
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
              <QrCode className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
              <span>
                Members show a personal QR code in the app while the class check-in window is open. Duplicate and
                replayed scans are rejected by the database.
              </span>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Today's classes" description="Check in members from the roster." />
          <div className="mt-3 space-y-2">
            {todaysSessions.length ? (
              todaysSessions.map((s) => (
                <Link key={s.session.id} href={`/gym/calendar?session=${s.session.id}`} className="subtle flex items-center justify-between gap-2 p-3 hover:border-[var(--line-strong)]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.cls.name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{formatTime(s.session.startsAt)} · capacity {s.session.capacity}</p>
                  </div>
                  <Badge tone={Number(s.attended) >= Number(s.booked) && Number(s.booked) > 0 ? "accent" : "neutral"}>
                    {Number(s.attended)}/{Number(s.booked)} in
                  </Badge>
                </Link>
              ))
            ) : (
              <EmptyState title="No classes today" description="Use quick check-in for open gym." />
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0"><CardHeader title="Check-ins today" description={`${recent.length} members on the mats`} /></div>
        {recent.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Member</th><th>Time</th><th>Class</th><th>Method</th><th className="text-right">Mark</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.att.id}>
                    <td>
                      <Link href={`/gym/members/${r.member.id}`} className="flex items-center gap-2 font-medium">
                        <Avatar name={r.user.name} size={26} /> {r.user.name}
                      </Link>
                    </td>
                    <td className="stat-value text-sm">{formatTime(r.att.checkedInAt)}</td>
                    <td className="text-sm">{r.cls?.name ?? "Open gym"}</td>
                    <td><Badge tone={r.att.method === "qr" ? "info" : "neutral"}>{r.att.method}</Badge></td>
                    <td className="text-right" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={<UserCheck className="h-5 w-5" />} title="No check-ins yet today" description="Check someone in above and it appears here instantly." /></div>
        )}
      </Card>
    </div>
  );
}

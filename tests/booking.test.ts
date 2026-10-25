import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attendance, bookings, classSessions } from "@/db/schema";
import { BookingError, bookSession, cancelBooking, checkIn, qrToken, verifyQrToken } from "@/lib/booking";
import { createMembership } from "@/lib/membership";
import { makeClassWithSession, makeMember, makeOrg, makePlan } from "./helpers";

async function gymWithMembers(count: number, capacity = 2) {
  const { org } = await makeOrg();
  const plan = await makePlan(org.id);
  const fighters = [];
  for (let i = 0; i < count; i++) {
    const { member } = await makeMember(org.id, "fighter");
    await createMembership({ orgId: org.id, memberId: member.id, planId: plan.id, trial: false });
    fighters.push(member);
  }
  const { cls, session } = await makeClassWithSession(org.id, { capacity });
  return { org, plan, fighters, cls, session };
}

describe("class booking", () => {
  it("books a seat and prevents duplicate bookings", async () => {
    const { org, fighters, session } = await gymWithMembers(1);
    const result = await bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id });
    expect(result.status).toBe("booked");
    await expect(bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id })).rejects.toMatchObject({ code: "duplicate" });
  });

  it("waitlists when capacity is reached and promotes on cancellation", async () => {
    const { org, fighters, session } = await gymWithMembers(3, 2);
    const first = await bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id });
    await bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[1].id });
    const third = await bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[2].id });
    expect(third.status).toBe("waitlisted");
    expect(third.position).toBe(1);

    await cancelBooking({ orgId: org.id, bookingId: first.bookingId, actor: { id: fighters[0].id, name: "Member" } });

    const promoted = (
      await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.sessionId, session.id), eq(bookings.memberId, fighters[2].id)))
        .limit(1)
    )[0];
    expect(promoted.status).toBe("booked");
  });

  it("refuses bookings without an active membership", async () => {
    const { org } = await makeOrg();
    const { member } = await makeMember(org.id, "fighter");
    const { session } = await makeClassWithSession(org.id);
    await expect(bookSession({ orgId: org.id, sessionId: session.id, memberId: member.id })).rejects.toMatchObject({ code: "membership" });
  });

  it("refuses bookings for a started class", async () => {
    const { org, fighters, session } = await gymWithMembers(1);
    await db.update(classSessions).set({ startsAt: new Date(Date.now() - 3600000) }).where(eq(classSessions.id, session.id));
    await expect(bookSession({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id })).rejects.toMatchObject({ code: "started" });
  });

  it("refuses a session that does not belong to the org", async () => {
    const { org, fighters, session } = await gymWithMembers(1);
    const { org: other } = await makeOrg();
    await expect(bookSession({ orgId: other.id, sessionId: session.id, memberId: fighters[0].id })).rejects.toBeInstanceOf(BookingError);
  });
});

describe("QR check-in security", () => {
  it("only accepts a code minted for the same gym and member", () => {
    const orgId = "org-1";
    const memberId = "member-1";
    const token = qrToken(orgId, memberId);
    expect(verifyQrToken(orgId, memberId, token)).toBe(true);
    expect(verifyQrToken("org-2", memberId, token)).toBe(false);
    expect(verifyQrToken(orgId, "member-2", token)).toBe(false);
    expect(verifyQrToken(orgId, memberId, `${token.slice(0, -1)}x`)).toBe(false);
    expect(verifyQrToken(orgId, memberId, "not-a-token")).toBe(false);
  });

  it("blocks replay of the same scan nonce", async () => {
    const { org, fighters } = await gymWithMembers(1);
    const { session } = await makeClassWithSession(org.id, { startsInHours: 0 });
    const nonce = `qr:${qrToken(org.id, fighters[0].id)}:${fighters[0].id}`;
    await db.delete(attendance);
    await checkIn({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id, method: "qr", nonce });
    await expect(
      checkIn({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id, method: "qr", nonce }),
    ).rejects.toMatchObject({ code: "replay" });
  });

  it("does not allow self check-in outside the class window", async () => {
    const { org, fighters } = await gymWithMembers(1);
    const { session } = await makeClassWithSession(org.id, { startsInHours: 5 });
    await expect(
      checkIn({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id, method: "self" }),
    ).rejects.toMatchObject({ code: "window" });
  });

  it("rejects a second check-in for the same class", async () => {
    const { org, fighters } = await gymWithMembers(1);
    const { session } = await makeClassWithSession(org.id, { startsInHours: 0 });
    await checkIn({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id, method: "staff" });
    await expect(
      checkIn({ orgId: org.id, sessionId: session.id, memberId: fighters[0].id, method: "staff" }),
    ).rejects.toBeInstanceOf(BookingError);
  });
});

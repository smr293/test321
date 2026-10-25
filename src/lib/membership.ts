import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  invoices,
  membershipCredits,
  membershipEvents,
  membershipPauses,
  membershipPlanChanges,
  membershipPlans,
  orgMembers,
  payments,
  subscriptions,
  users,
  type MembershipPlan,
  type Subscription,
} from "@/db/schema";
import { audit } from "./audit";
import { notify } from "./notifications";
import { addDays, addMonths, parseJson } from "./utils";

/* ------------------------------------------------------------------ */
/* Plan helpers                                                        */
/* ------------------------------------------------------------------ */

export function planDisciplines(plan: MembershipPlan): string[] | null {
  return parseJson<string[] | null>(plan.allowedDisciplines, null);
}

export function planLocations(plan: MembershipPlan): string[] | null {
  return parseJson<string[] | null>(plan.locationIds, null);
}

export function planCoversDiscipline(plan: MembershipPlan, discipline: string) {
  const list = planDisciplines(plan);
  if (!list || !list.length) return true;
  return list.some((d) => d.toLowerCase() === discipline.toLowerCase());
}

export function planCoversLocation(plan: MembershipPlan, locationId: string | null) {
  const list = planLocations(plan);
  if (!list || !list.length || !locationId) return true;
  return list.includes(locationId);
}

/** Effective price after discount + intro offer, in minor units. */
export function effectivePriceCents(plan: MembershipPlan, opts?: { discountBps?: number; isFirstPeriod?: boolean }) {
  let price = plan.priceCents;
  const discount = opts?.discountBps ?? 0;
  if (discount > 0) price = Math.round(price * (1 - Math.min(discount, 10000) / 10000));
  if (opts?.isFirstPeriod && plan.introOfferCents != null) price = plan.introOfferCents;
  return Math.max(0, price);
}

export function taxFor(plan: MembershipPlan, amountCents: number, fallbackBps = 2500) {
  const bps = plan.taxRateBps ?? fallbackBps;
  return Math.round((amountCents * bps) / 10000);
}

export function planIntervalLabel(plan: MembershipPlan) {
  if (plan.interval === "one_time") return "one-time";
  if (plan.interval === "year") return "per year";
  if (plan.interval === "week") return "per week";
  return "per month";
}

export function planPriceLabel(plan: MembershipPlan) {
  return `${(plan.priceCents / 100).toFixed(plan.priceCents % 100 === 0 ? 0 : 2)} ${plan.currency}`;
}

/* ------------------------------------------------------------------ */
/* Subscription lookups                                                */
/* ------------------------------------------------------------------ */

export const ACCESS_STATUSES = ["active", "trial", "cancel_scheduled"] as const;

export async function getMemberSubscription(orgId: string, memberId: string) {
  const rows = await db
    .select({ subscription: subscriptions, plan: membershipPlans })
    .from(subscriptions)
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.memberId, memberId)))
    .orderBy(desc(subscriptions.createdAt));
  const current = rows.find((r) =>
    ["active", "trial", "past_due", "paused", "cancel_scheduled", "pending"].includes(r.subscription.status),
  );
  return { current: current ?? null, history: rows };
}

export type AccessDecision = {
  allowed: boolean;
  reason?: string;
  plan?: MembershipPlan;
  subscription?: Subscription;
  weeklyLimit?: number | null;
  classesThisWeek?: number;
  creditsRemaining?: number | null;
};

/** Central entitlement check used by booking, check-in and the member app. */
export async function checkMembershipAccess(
  orgId: string,
  memberId: string,
  opts?: { discipline?: string; locationId?: string | null; now?: Date },
): Promise<AccessDecision> {
  const { current } = await getMemberSubscription(orgId, memberId);
  if (!current) {
    return { allowed: false, reason: "No membership on file. Ask your gym to add a plan." };
  }
  const { subscription, plan } = current;
  if (subscription.status === "paused") {
    return { allowed: false, reason: "Your membership is paused.", plan, subscription };
  }
  if (subscription.status === "past_due") {
    return { allowed: false, reason: "Your payment is overdue. Update payment to book classes.", plan, subscription };
  }
  if (["pending", "expired", "cancelled"].includes(subscription.status)) {
    return { allowed: false, reason: "Your membership is not active.", plan, subscription };
  }
  if (opts?.discipline && !planCoversDiscipline(plan, opts.discipline)) {
    return {
      allowed: false,
      reason: `Your plan (${plan.name}) does not include ${opts.discipline}.`,
      plan,
      subscription,
    };
  }
  if (opts?.locationId && !planCoversLocation(plan, opts.locationId)) {
    return { allowed: false, reason: `Your plan is not valid at this location.`, plan, subscription };
  }

  const now = opts?.now ?? new Date();
  const weekStart = new Date(now);
  const day = (weekStart.getDay() + 6) % 7; // Monday = 0
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  const weekCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`bookings`)
    .where(
      sql`bookings.member_id = ${memberId} and bookings.status in ('booked','attended') and bookings.created_at >= ${weekStart.getTime()}`,
    );

  const classesThisWeek = Number(weekCount[0]?.count ?? 0);
  if (plan.classLimitPerWeek != null && classesThisWeek >= plan.classLimitPerWeek) {
    return {
      allowed: false,
      reason: `You have used all ${plan.classLimitPerWeek} classes for this week.`,
      plan,
      subscription,
      weeklyLimit: plan.classLimitPerWeek,
      classesThisWeek,
    };
  }
  if (subscription.creditsRemaining != null && subscription.creditsRemaining <= 0 && plan.creditCount != null) {
    return {
      allowed: false,
      reason: "You have no class credits left. Buy a new pass to continue.",
      plan,
      subscription,
      creditsRemaining: 0,
    };
  }

  return {
    allowed: true,
    plan,
    subscription,
    weeklyLimit: plan.classLimitPerWeek,
    classesThisWeek,
    creditsRemaining: subscription.creditsRemaining,
  };
}

/* ------------------------------------------------------------------ */
/* Subscription lifecycle                                              */
/* ------------------------------------------------------------------ */

export async function logMembershipEvent(input: {
  orgId: string;
  subscriptionId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: string | null;
  meta?: Record<string, unknown>;
}) {
  await db.insert(membershipEvents).values({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorId: input.actorId ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
  });
}

function periodFor(plan: MembershipPlan, from: Date) {
  if (plan.interval === "year") return { start: from, end: addMonths(from, 12) };
  if (plan.interval === "week") return { start: from, end: addDays(from, 7) };
  if (plan.interval === "one_time") return { start: from, end: addDays(from, 30) };
  return { start: from, end: addMonths(from, 1) };
}

export type CreateSubscriptionInput = {
  orgId: string;
  memberId: string;
  planId: string;
  startDate?: Date;
  discountBps?: number;
  provider?: "stripe" | "sandbox" | "manual" | "complimentary";
  trial?: boolean;
  createdById?: string;
  note?: string;
};

export async function createMembership(input: CreateSubscriptionInput) {
  const planRows = await db
    .select()
    .from(membershipPlans)
    .where(and(eq(membershipPlans.id, input.planId), eq(membershipPlans.orgId, input.orgId)))
    .limit(1);
  const plan = planRows[0];
  if (!plan) throw new Error("Membership plan not found");
  const member = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, input.memberId), eq(orgMembers.orgId, input.orgId)))
    .limit(1);
  if (!member[0]) throw new Error("Member not found in this gym");

  const start = input.startDate ?? new Date();
  const trial = input.trial ?? plan.trialDays > 0;
  const period = periodFor(plan, trial ? addDays(start, plan.trialDays) : start);
  const credits = plan.creditCount ?? null;
  const price = effectivePriceCents(plan, { discountBps: input.discountBps, isFirstPeriod: true });

  // Idempotency: an existing pending/active subscription for the same plan is reused.
  const existing = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.orgId, input.orgId),
        eq(subscriptions.memberId, input.memberId),
        inArray(subscriptions.status, ["active", "trial", "pending", "past_due", "cancel_scheduled"]),
      ),
    );
  if (existing[0]) {
    return { subscription: existing[0], plan, created: false };
  }

  const inserted = await db
    .insert(subscriptions)
    .values({
      orgId: input.orgId,
      memberId: input.memberId,
      planId: plan.id,
      status: trial ? "trial" : "active",
      priceCents: price,
      currency: plan.currency,
      discountBps: input.discountBps ?? 0,
      startDate: start,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      creditsRemaining: credits,
      provider: input.provider ?? "sandbox",
      autoRenew: plan.autoRenew,
      createdById: input.createdById ?? null,
      statusReason: input.note ?? null,
    })
    .returning();
  const subscription = inserted[0];

  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: subscription.id,
    action: trial ? "created_trial" : "created",
    toStatus: subscription.status,
    actorId: input.createdById,
    meta: { planId: plan.id, priceCents: price },
  });
  await db
    .update(orgMembers)
    .set({ status: "active", joinedAt: member[0].joinedAt ?? new Date() })
    .where(eq(orgMembers.id, input.memberId));
  return { subscription, plan, created: true };
}

export async function setSubscriptionStatus(
  orgId: string,
  subscriptionId: string,
  status: Subscription["status"],
  actor: { id: string; name: string },
  opts?: { reason?: string; meta?: Record<string, unknown> },
) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.orgId, orgId)))
    .limit(1);
  const sub = rows[0];
  if (!sub) throw new Error("Subscription not found");
  const updated = await db
    .update(subscriptions)
    .set({ status, statusReason: opts?.reason ?? sub.statusReason, updatedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();
  await logMembershipEvent({
    orgId,
    subscriptionId,
    action: `status:${status}`,
    fromStatus: sub.status,
    toStatus: status,
    actorId: actor.id,
    meta: opts?.meta,
  });
  await audit({
    orgId,
    actor: { id: actor.id, name: actor.name, role: "staff" },
    action: `membership.${status}`,
    targetType: "subscription",
    targetId: subscriptionId,
    meta: { reason: opts?.reason },
  });
  return updated[0];
}

export async function pauseMembership(input: {
  orgId: string;
  subscriptionId: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
  actor: { id: string; name: string };
}) {
  const rows = await db
    .select({ sub: subscriptions, plan: membershipPlans, member: orgMembers })
    .from(subscriptions)
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
    .innerJoin(orgMembers, eq(orgMembers.id, subscriptions.memberId))
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Subscription not found");
  if (!row.plan.freezeAllowed) throw new Error("This plan does not allow pausing");
  const days = Math.ceil((input.endDate.getTime() - input.startDate.getTime()) / 86400000);
  if (days > row.plan.freezeMaxDays) {
    throw new Error(`Pauses are limited to ${row.plan.freezeMaxDays} days for this plan`);
  }
  await db.insert(membershipPauses).values({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason ?? null,
    createdById: input.actor.id,
  });
  // Extend the paid period by the paused duration so members get what they paid for.
  const newEnd = addDays(row.sub.currentPeriodEnd, days);
  await db
    .update(subscriptions)
    .set({ status: "paused", pausedAt: new Date(), resumeAt: input.endDate, currentPeriodEnd: newEnd })
    .where(eq(subscriptions.id, input.subscriptionId));
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: "paused",
    fromStatus: row.sub.status,
    toStatus: "paused",
    actorId: input.actor.id,
    meta: { startDate: input.startDate.toISOString(), endDate: input.endDate.toISOString(), days },
  });
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: "membership.paused",
    targetType: "subscription",
    targetId: input.subscriptionId,
    meta: { days, reason: input.reason },
  });
  await notify({
    userId: row.member.userId,
    orgId: input.orgId,
    type: "membership",
    title: "Membership paused",
    body: `Your membership is paused until ${input.endDate.toLocaleDateString("en-GB")}.`,
    link: "/app/membership",
    dedupeKey: `pause-${input.subscriptionId}-${input.startDate.toISOString()}`,
  });
}

export async function resumeMembership(input: {
  orgId: string;
  subscriptionId: string;
  actor: { id: string; name: string };
}) {
  const rows = await db
    .select({ sub: subscriptions, member: orgMembers })
    .from(subscriptions)
    .innerJoin(orgMembers, eq(orgMembers.id, subscriptions.memberId))
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Subscription not found");
  await db
    .update(subscriptions)
    .set({ status: "active", pausedAt: null, resumeAt: null })
    .where(eq(subscriptions.id, input.subscriptionId));
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: "resumed",
    fromStatus: row.sub.status,
    toStatus: "active",
    actorId: input.actor.id,
  });
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: "membership.resumed",
    targetType: "subscription",
    targetId: input.subscriptionId,
  });
  await notify({
    userId: row.member.userId,
    orgId: input.orgId,
    type: "membership",
    title: "Membership resumed",
    body: "You can book classes again. Welcome back!",
    link: "/app/schedule",
    dedupeKey: `resume-${input.subscriptionId}-${Date.now()}`,
  });
}

export async function cancelMembership(input: {
  orgId: string;
  subscriptionId: string;
  immediate?: boolean;
  reason?: string;
  actor: { id: string; name: string };
}) {
  const rows = await db
    .select({ sub: subscriptions, member: orgMembers, plan: membershipPlans })
    .from(subscriptions)
    .innerJoin(orgMembers, eq(orgMembers.id, subscriptions.memberId))
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Subscription not found");
  const immediate = input.immediate ?? false;
  if (immediate) {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date(), endedAt: new Date(), autoRenew: false })
      .where(eq(subscriptions.id, input.subscriptionId));
  } else {
    const noticeEnd = addDays(new Date(), row.plan.noticePeriodDays);
    const effectiveEnd = noticeEnd > row.sub.currentPeriodEnd ? noticeEnd : row.sub.currentPeriodEnd;
    await db
      .update(subscriptions)
      .set({
        status: "cancel_scheduled",
        cancelAtPeriodEnd: true,
        cancelRequestedAt: new Date(),
        currentPeriodEnd: effectiveEnd,
        autoRenew: false,
      })
      .where(eq(subscriptions.id, input.subscriptionId));
  }
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: immediate ? "cancelled_immediately" : "cancellation_scheduled",
    fromStatus: row.sub.status,
    toStatus: immediate ? "cancelled" : "cancel_scheduled",
    actorId: input.actor.id,
    meta: { reason: input.reason },
  });
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: immediate ? "membership.cancelled" : "membership.cancel_scheduled",
    targetType: "subscription",
    targetId: input.subscriptionId,
    meta: { reason: input.reason },
  });
  await notify({
    userId: row.member.userId,
    orgId: input.orgId,
    type: "membership",
    title: immediate ? "Membership cancelled" : "Cancellation scheduled",
    body: immediate
      ? "Your membership has ended. You can still see your training history."
      : "Your membership stays active until the end of the current period.",
    link: "/app/membership",
    dedupeKey: `cancel-${input.subscriptionId}-${Date.now()}`,
  });
}

export async function addCredits(input: {
  orgId: string;
  subscriptionId: string;
  delta: number;
  reason?: string;
  actor: { id: string; name: string };
}) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
    .limit(1);
  if (!rows[0]) throw new Error("Subscription not found");
  const next = Math.max(0, (rows[0].creditsRemaining ?? 0) + input.delta);
  await db.update(subscriptions).set({ creditsRemaining: next }).where(eq(subscriptions.id, input.subscriptionId));
  await db.insert(membershipCredits).values({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    delta: input.delta,
    reason: input.reason ?? null,
    createdById: input.actor.id,
  });
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: "credits_adjusted",
    actorId: input.actor.id,
    meta: { delta: input.delta, next },
  });
  return next;
}

export async function extendMembership(input: {
  orgId: string;
  subscriptionId: string;
  days: number;
  actor: { id: string; name: string };
}) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
    .limit(1);
  const sub = rows[0];
  if (!sub) throw new Error("Subscription not found");
  const periodEnd = addDays(sub.currentPeriodEnd, input.days);
  await db.update(subscriptions).set({ currentPeriodEnd: periodEnd }).where(eq(subscriptions.id, input.subscriptionId));
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: "extended",
    actorId: input.actor.id,
    meta: { days: input.days, newPeriodEnd: periodEnd.toISOString() },
  });
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: "membership.extended",
    targetType: "subscription",
    targetId: input.subscriptionId,
    meta: { days: input.days },
  });
}

export async function schedulePlanChange(input: {
  orgId: string;
  subscriptionId: string;
  newPlanId: string;
  effectiveAt: Date;
  actor: { id: string; name: string };
  applyNow?: boolean;
}) {
  const plan = (
    await db
      .select()
      .from(membershipPlans)
      .where(and(eq(membershipPlans.id, input.newPlanId), eq(membershipPlans.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!plan) throw new Error("Plan not found");
  const sub = (
    await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!sub) throw new Error("Subscription not found");

  if (input.applyNow) {
    await db
      .update(subscriptions)
      .set({
        planId: plan.id,
        priceCents: plan.priceCents,
        currency: plan.currency,
        creditsRemaining: plan.creditCount ?? null,
        status: "active",
        statusReason: null,
      })
      .where(eq(subscriptions.id, input.subscriptionId));
    await db.insert(membershipPlanChanges).values({
      orgId: input.orgId,
      subscriptionId: input.subscriptionId,
      fromPlanId: sub.planId,
      toPlanId: plan.id,
      effectiveAt: input.effectiveAt,
      status: "applied",
      createdById: input.actor.id,
    });
  } else {
    await db.insert(membershipPlanChanges).values({
      orgId: input.orgId,
      subscriptionId: input.subscriptionId,
      fromPlanId: sub.planId,
      toPlanId: plan.id,
      effectiveAt: input.effectiveAt,
      status: "scheduled",
      createdById: input.actor.id,
    });
  }
  await logMembershipEvent({
    orgId: input.orgId,
    subscriptionId: input.subscriptionId,
    action: input.applyNow ? "plan_changed" : "plan_change_scheduled",
    actorId: input.actor.id,
    meta: { fromPlanId: sub.planId, toPlanId: plan.id, effectiveAt: input.effectiveAt.toISOString() },
  });
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: input.applyNow ? "membership.plan_changed" : "membership.plan_change_scheduled",
    targetType: "subscription",
    targetId: input.subscriptionId,
    meta: { toPlanId: plan.id, effectiveAt: input.effectiveAt.toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

/**
 * Invoice numbers are globally unique (unique index on invoices.number).
 * Sequence restarts each calendar year, so we count only this year's invoices.
 */
export async function nextInvoiceNumber(_orgId?: string) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(sql`${invoices.number} like ${`${prefix}%`}`);
  const max = rows.reduce((highest, row) => {
    const seq = Number.parseInt(row.number.slice(prefix.length), 10);
    return Number.isFinite(seq) && seq > highest ? seq : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export async function createInvoiceForSubscription(input: {
  orgId: string;
  subscriptionId: string;
  amountCents?: number;
  description?: string;
  periodStart?: Date;
  periodEnd?: Date;
  dueInDays?: number;
}) {
  const row = (
    await db
      .select({ sub: subscriptions, plan: membershipPlans, member: orgMembers })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
      .innerJoin(orgMembers, eq(orgMembers.id, subscriptions.memberId))
      .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!row) throw new Error("Subscription not found");

  const amount = input.amountCents ?? effectivePriceCents(row.plan, { discountBps: row.sub.discountBps });
  const taxCents = taxFor(row.plan, amount);
  const number = await nextInvoiceNumber(input.orgId);
  const inserted = await db
    .insert(invoices)
    .values({
      orgId: input.orgId,
      subscriptionId: input.subscriptionId,
      memberId: row.sub.memberId,
      number,
      amountCents: amount,
      taxCents,
      currency: row.sub.currency,
      status: "open",
      periodStart: input.periodStart ?? row.sub.currentPeriodStart,
      periodEnd: input.periodEnd ?? row.sub.currentPeriodEnd,
      dueDate: addDays(new Date(), input.dueInDays ?? 7),
      description: input.description ?? `${row.plan.name} membership`,
      provider: row.sub.provider,
    })
    .returning();
  return inserted[0];
}

/**
 * Records a provider-confirmed payment. Never call this from a client-side
 * "success" screen — only from verified provider events or staff of the gym.
 */
export async function recordPayment(input: {
  orgId: string;
  invoiceId: string;
  amountCents: number;
  provider: "stripe" | "sandbox" | "manual";
  providerPaymentId?: string;
  method?: string;
  processedAt?: Date;
}) {
  const invoice = (
    await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!invoice) throw new Error("Invoice not found");
  const wasPaid = invoice.status === "paid";
  if (wasPaid) return { payment: null, alreadyPaid: true };
  if (input.providerPaymentId) {
    const dup = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, input.provider), eq(payments.providerPaymentId, input.providerPaymentId)))
      .limit(1);
    if (dup[0]) return { payment: dup[0], alreadyPaid: wasPaid };
  }
  const payment = (
    await db
      .insert(payments)
      .values({
        orgId: input.orgId,
        invoiceId: invoice.id,
        memberId: invoice.memberId,
        amountCents: input.amountCents,
        currency: invoice.currency,
        status: "succeeded",
        provider: input.provider,
        providerPaymentId: input.providerPaymentId ?? null,
        method: input.method ?? null,
        processedAt: input.processedAt ?? new Date(),
      })
      .returning()
  )[0];
  const paidAt = input.processedAt ?? new Date();
  await db.update(invoices).set({ status: "paid", paidAt }).where(eq(invoices.id, invoice.id));

  if (invoice.subscriptionId) {
    const sub = (
      await db.select().from(subscriptions).where(eq(subscriptions.id, invoice.subscriptionId)).limit(1)
    )[0];
    if (sub) {
      const plan = (
        await db.select().from(membershipPlans).where(eq(membershipPlans.id, sub.planId)).limit(1)
      )[0];
      // Advance the billing period and reactivate when a payment lands.
      const nextStart = sub.currentPeriodEnd > paidAt ? sub.currentPeriodEnd : paidAt;
      const nextEnd =
        plan?.interval === "year"
          ? addMonths(nextStart, 12)
          : plan?.interval === "one_time"
            ? addDays(nextStart, 30)
            : addMonths(nextStart, 1);
      await db
        .update(subscriptions)
        .set({
          status: "active",
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
          creditsRemaining: plan?.creditCount ?? sub.creditsRemaining,
          endedAt: null,
          statusReason: null,
        })
        .where(eq(subscriptions.id, sub.id));
      await logMembershipEvent({
        orgId: input.orgId,
        subscriptionId: sub.id,
        action: "payment_received",
        fromStatus: sub.status,
        toStatus: "active",
        meta: { invoiceId: invoice.id, amountCents: input.amountCents },
      });
      const member = (await db.select().from(orgMembers).where(eq(orgMembers.id, sub.memberId)).limit(1))[0];
      if (member) {
        await notify({
          userId: member.userId,
          orgId: input.orgId,
          type: "billing",
          title: "Payment received",
          body: `We received ${(input.amountCents / 100).toFixed(2)} ${invoice.currency} for ${invoice.number}.`,
          link: "/app/billing",
          dedupeKey: `payment-${payment.id}`,
        });
      }
    }
  }
  return { payment, alreadyPaid: false };
}

export async function refundPayment(input: {
  orgId: string;
  paymentId: string;
  amountCents?: number;
  reason?: string;
  actor: { id: string; name: string };
}) {
  const payment = (
    await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, input.paymentId), eq(payments.orgId, input.orgId)))
      .limit(1)
  )[0];
  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "succeeded") throw new Error("Only successful payments can be refunded");
  const amount = Math.min(input.amountCents ?? payment.amountCents, payment.amountCents);
  const { refunds } = await import("@/db/schema");
  const refund = (
    await db
      .insert(refunds)
      .values({
        orgId: input.orgId,
        paymentId: payment.id,
        amountCents: amount,
        reason: input.reason ?? null,
        createdById: input.actor.id,
      })
      .returning()
  )[0];
  const fullyRefunded = amount >= payment.amountCents;
  await db
    .update(payments)
    .set({ status: fullyRefunded ? "refunded" : "succeeded" })
    .where(eq(payments.id, payment.id));
  if (payment.invoiceId) {
    await db
      .update(invoices)
      .set({ status: fullyRefunded ? "refunded" : "paid" })
      .where(eq(invoices.id, payment.invoiceId));
  }
  await audit({
    orgId: input.orgId,
    actor: { id: input.actor.id, name: input.actor.name },
    action: "payment.refunded",
    targetType: "payment",
    targetId: payment.id,
    meta: { amount, reason: input.reason },
  });
  return refund;
}

/** Marks overdue invoices and reflects the state on the subscription. */
export async function markOverdueMemberships(now = new Date()) {
  const overdue = await db
    .select({ invoice: invoices, sub: subscriptions })
    .from(invoices)
    .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
    .where(and(eq(invoices.status, "open"), lte(invoices.dueDate, now), eq(subscriptions.status, "active")))
    .limit(200);
  for (const row of overdue) {
    await db.update(subscriptions).set({ status: "past_due", statusReason: "invoice_overdue" }).where(eq(subscriptions.id, row.sub.id));
    await logMembershipEvent({
      orgId: row.invoice.orgId,
      subscriptionId: row.sub.id,
      action: "marked_overdue",
      fromStatus: row.sub.status,
      toStatus: "past_due",
      meta: { invoiceId: row.invoice.id },
    });
  }
  return overdue.length;
}

/** Applies scheduled cancellations / plan changes once their date passes. */
export async function applyScheduledMembershipChanges(now = new Date()) {
  let applied = 0;
  const toCancel = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "cancel_scheduled"), lte(subscriptions.currentPeriodEnd, now)));
  for (const sub of toCancel) {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, endedAt: now })
      .where(eq(subscriptions.id, sub.id));
    await logMembershipEvent({
      orgId: sub.orgId,
      subscriptionId: sub.id,
      action: "cancellation_applied",
      fromStatus: sub.status,
      toStatus: "cancelled",
    });
    applied++;
  }
  const toResume = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "paused"), lte(subscriptions.resumeAt, now)));
  for (const sub of toResume) {
    await db.update(subscriptions).set({ status: "active", pausedAt: null, resumeAt: null }).where(eq(subscriptions.id, sub.id));
    await logMembershipEvent({
      orgId: sub.orgId,
      subscriptionId: sub.id,
      action: "auto_resumed",
      fromStatus: sub.status,
      toStatus: "active",
    });
    applied++;
  }
  const changes = await db
    .select()
    .from(membershipPlanChanges)
    .where(and(eq(membershipPlanChanges.status, "scheduled"), lte(membershipPlanChanges.effectiveAt, now)));
  for (const change of changes) {
    const plan = (await db.select().from(membershipPlans).where(eq(membershipPlans.id, change.toPlanId)).limit(1))[0];
    if (!plan) continue;
    await db
      .update(subscriptions)
      .set({ planId: plan.id, priceCents: plan.priceCents, currency: plan.currency, creditsRemaining: plan.creditCount ?? null })
      .where(eq(subscriptions.id, change.subscriptionId));
    await db.update(membershipPlanChanges).set({ status: "applied" }).where(eq(membershipPlanChanges.id, change.id));
    applied++;
  }
  return applied;
}

/** Member-facing summary used across the app shell. */
export async function membershipSummary(orgId: string, memberId: string) {
  const { current, history } = await getMemberSubscription(orgId, memberId);
  const openInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.memberId, memberId), inArray(invoices.status, ["open", "draft"])))
    .orderBy(desc(invoices.createdAt));
  return { current, history, openInvoices, balanceCents: openInvoices.reduce((s, i) => s + i.amountCents, 0) };
}

export async function listMembersWithMembership(orgId: string) {
  return db
    .select({ member: orgMembers, user: users, sub: subscriptions, plan: membershipPlans })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.memberId, orgMembers.id),
        eq(subscriptions.orgId, orgId),
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "trial"),
          eq(subscriptions.status, "past_due"),
          eq(subscriptions.status, "paused"),
          eq(subscriptions.status, "cancel_scheduled"),
          eq(subscriptions.status, "pending"),
        ),
      ),
    )
    .leftJoin(membershipPlans, eq(membershipPlans.id, subscriptions.planId))
    .where(and(eq(orgMembers.orgId, orgId), isNull(orgMembers.archivedAt)))
    .orderBy(orgMembers.createdAt);
}

export async function revenueThisMonth(orgId: string, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "succeeded"), gte(payments.createdAt, start)));
  return Number(rows[0]?.total ?? 0);
}

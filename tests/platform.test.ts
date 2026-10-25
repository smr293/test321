import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dataRequests, emailOutbox, featureFlags, orgMembers, platformSettings, supportTickets } from "@/db/schema";
import {
  getPlatformSettings,
  listDataRequests,
  listEmailOutbox,
  listFlags,
  listOrganizations,
  listPlatformUsers,
  listSaasPlans,
  listTickets,
  platformOverview,
  platformRevenueSeries,
  platformTotals,
} from "@/lib/saas";
import { getEntitlements } from "@/lib/entitlements";
import { assignPlan, makeMember, makeOrg, saasPlanBySlug } from "./helpers";
import { AUDIT_HEAD_KEY } from "@/lib/audit";

describe("platform admin data", () => {
  it("reports cross-tenant metrics", async () => {
    const overview = await platformOverview();
    expect(overview.orgs.total).toBeGreaterThanOrEqual(2);
    expect(overview.orgs.active).toBeGreaterThanOrEqual(2);
    expect(overview.users.total).toBeGreaterThan(overview.fighters);
    expect(overview.mrrCents).toBeGreaterThanOrEqual(0);
    expect(overview.mrrByPlan.every((p) => p.mrr >= 0 && p.orgs > 0)).toBe(true);
    expect(overview.tickets.open + overview.tickets.pending + overview.tickets.resolved + overview.tickets.closed)
      .toBe(await db.select().from(supportTickets).then((r) => r.length));
  });

  it("filters gyms and never mixes tenants", async () => {
    const all = await listOrganizations();
    const suspended = await listOrganizations({ status: "suspended" });
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(suspended.every((o) => o.org.status === "suspended")).toBe(true);
    const search = await listOrganizations({ q: "Nordic" });
    expect(search.some((o) => o.org.name === "Nordic Fight Lab")).toBe(true);
    expect(search.every((o) => o.org.name.toLowerCase().includes("nordic") || o.org.slug.includes("nordic"))).toBe(true);
    const row = all.find((o) => o.org.name === "Nordic Fight Lab");
    expect(row?.members).toBeGreaterThan(0);
    expect(row?.fighters).toBeGreaterThan(0);
  });

  it("returns SaaS catalog and per-plan gym counts", async () => {
    const plans = await listSaasPlans();
    expect(plans.length).toBeGreaterThanOrEqual(3);
    expect(plans.map((p) => p.slug)).toEqual(expect.arrayContaining(["starter", "pro", "elite"]));
    expect(plans.every((p) => Array.isArray(p.features))).toBe(true);
  });

  it("returns users, flags, tickets, data requests and email", async () => {
    const users = await listPlatformUsers("fighter@demo.mma");
    expect(users.length).toBeGreaterThan(0);
    expect(users[0].user.email).toBe("fighter@demo.mma");
    expect((await listFlags()).length).toBeGreaterThanOrEqual(4);
    expect((await listTickets()).length).toBeGreaterThanOrEqual(3);
    expect((await listDataRequests()).length).toBeGreaterThanOrEqual(2);
    expect((await listEmailOutbox()).length).toBeGreaterThanOrEqual(4);
    expect((await listEmailOutbox("failed")).every((m) => m.status === "failed")).toBe(true);
  });

  it("has platform settings with safe defaults", async () => {
    const settings = await getPlatformSettings();
    expect(settings.platformName).toBeTruthy();
    expect(settings.supportEmail).toContain("@");
    expect(["true", "false"]).toContain(settings.allowSignups);
    expect(["true", "false"]).toContain(settings.maintenanceMode);
    const head = await db.select().from(platformSettings).where(eq(platformSettings.key, AUDIT_HEAD_KEY));
    expect(head.length).toBe(1);
  });

  it("summarises invoices and payment series", async () => {
    const totals = await platformTotals();
    expect(totals.billedCents).toBeGreaterThanOrEqual(0);
    expect(totals.outstandingCents).toBeGreaterThanOrEqual(0);
    const series = await platformRevenueSeries(6);
    expect(Array.isArray(series)).toBe(true);
    expect(series.every((s) => /^\d{4}-\d{2}$/.test(s.month))).toBe(true);
  });

  it("does not expose password hashes through admin user lists", async () => {
    const users = await listPlatformUsers();
    expect(users.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(users);
    expect(serialized).not.toContain("$argon2");
    expect(serialized).not.toContain("passwordHash");
  });
});

describe("SaaS entitlements", () => {
  it("applies plan limits to member and location creation", async () => {
    const { org } = await makeOrg("entitlements");
    const starter = await saasPlanBySlug("starter");
    await assignPlan(org.id, starter.id, 1, "active");
    for (let i = 0; i < 3; i++) await makeMember(org.id, "fighter");
    const ent = await getEntitlements(org.id);
    expect(ent.planSlug).toBe("starter");
    expect(ent.maxActiveMembers).toBe(starter.maxActiveMembers);
    expect(ent.usage.activeMembers).toBeGreaterThanOrEqual(3);
    expect(ent.canAddMember).toBe(true);
    const coach = await makeMember(org.id, "coach");
    expect(coach.member.role).toBe("coach");
  });

  it("reports past_due subscriptions", async () => {
    const { org } = await makeOrg("pastdue");
    const pro = await saasPlanBySlug("pro");
    await assignPlan(org.id, pro.id, 2, "past_due");
    const ent = await getEntitlements(org.id);
    expect(ent.status).toBe("past_due");
  });

  it("falls back to a safe free tier when no subscription exists", async () => {
    const { org } = await makeOrg("noplan");
    const ent = await getEntitlements(org.id);
    expect(ent.status).toBe("none");
    expect(ent.maxActiveMembers).toBeGreaterThan(0);
    expect(ent.canAddMember).toBe(true);
  });
});

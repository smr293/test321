/**
 * Demo data generator.
 *
 * Usage: npm run db:seed        (idempotent — re-running tops up missing data)
 *
 * The seed creates a realistic two-gym dataset so every screen has meaningful,
 * internally consistent data. All payments are marked as sandbox/manual and
 * are clearly test data.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import {
  announcements,
  attendance,
  auditLogs,
  bookings,
  classSessions,
  classes,
  coachAssignments,
  coachNotes,
  consents,
  dataRequests,
  emailOutbox,
  featureFlags,
  fighterGoals,
  fighterProfiles,
  fightCamps,
  fightRecords,
  gymLocations,
  invoices,
  membershipPlans,
  notifications,
  orgMembers,
  organizations,
  platformSettings,
  programAssignments,
  readinessCheckins,
  saasPlans,
  saasSubscriptions,
  supportTickets,
  subscriptions,
  trainingPrograms,
  trainingSessions,
  users,
} from "./schema";
import { generateAllSessions } from "../lib/booking";
import { audit } from "../lib/audit";
import { hashPassword } from "../lib/password";

const DAY = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const setTime = (d: Date, h: number, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};

const PASSWORD = "demo1234";

async function ensureUser(input: {
  email: string;
  name: string;
  isSuperAdmin?: boolean;
  phone?: string;
  dateOfBirth?: Date;
}) {
  const existing = (await db.select().from(users).where(eq(users.email, input.email)).limit(1))[0];
  if (existing) return existing;
  const passwordHash = await hashPassword(PASSWORD);
  return (
    await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
        isSuperAdmin: input.isSuperAdmin ?? false,
        phone: input.phone ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        termsAcceptedAt: new Date(),
        lastLoginAt: null,
      })
      .returning()
  )[0];
}

export async function seedDemo() {
  /* ---------------- platform plans & settings ---------------- */
  const planDefs = [
    {
      slug: "starter",
      name: "Starter",
      description: "One location, membership management and class scheduling.",
      priceMonthlyCents: 49000,
      priceAnnualCents: 490000,
      maxLocations: 1,
      maxActiveMembers: 75,
      maxCoaches: 3,
      features: JSON.stringify(["members", "plans", "classes", "bookings", "attendance"]),
      sortOrder: 0,
    },
    {
      slug: "pro",
      name: "Pro",
      description: "Multiple coaches, fighter tracking, payments and analytics.",
      priceMonthlyCents: 99000,
      priceAnnualCents: 990000,
      maxLocations: 3,
      maxActiveMembers: 400,
      maxCoaches: 15,
      features: JSON.stringify([
        "members",
        "plans",
        "classes",
        "bookings",
        "attendance",
        "fighters",
        "fightcamps",
        "billing",
        "analytics",
        "messages",
      ]),
      sortOrder: 1,
    },
    {
      slug: "elite",
      name: "Elite",
      description: "Unlimited locations, fight camp tooling and advanced reporting.",
      priceMonthlyCents: 199000,
      priceAnnualCents: 1990000,
      maxLocations: 25,
      maxActiveMembers: 5000,
      maxCoaches: 100,
      features: JSON.stringify([
        "members",
        "plans",
        "classes",
        "bookings",
        "attendance",
        "fighters",
        "fightcamps",
        "billing",
        "analytics",
        "messages",
        "advanced_reporting",
        "api",
      ]),
      sortOrder: 2,
    },
  ];
  for (const plan of planDefs) {
    await db.insert(saasPlans).values(plan).onConflictDoNothing();
  }
  const allSaasPlans = await db.select().from(saasPlans);
  const proPlan = allSaasPlans.find((p) => p.slug === "pro")!;
  const starterPlan = allSaasPlans.find((p) => p.slug === "starter")!;

  await db
    .insert(platformSettings)
    .values([
      { key: "product_name", value: "MMA OS" },
      { key: "tagline", value: "Train. Fight. Improve." },
      { key: "default_currency", value: "SEK" },
      { key: "support_email", value: "support@mmaos.local" },
      { key: "maintenance_mode", value: "false" },
      { key: "primary_color", value: "#B8F36B" },
      { key: "brand_name", value: "MMA OS" },
      { key: "signup_enabled", value: "true" },
    ])
    .onConflictDoNothing();

  await db
    .insert(featureFlags)
    .values([
      { key: "fight_camps", name: "Fight camps", description: "Camp planning and readiness", enabled: true },
      { key: "online_payments", name: "Online payments", description: "Stripe billing for member invoices", enabled: true },
      { key: "family_accounts", name: "Family accounts", description: "Guardian billing for youth members", enabled: true },
      { key: "public_profiles", name: "Public fighter profiles", description: "Consented public fight records", enabled: true },
    ])
    .onConflictDoNothing();

  /* ---------------- demo gym #1 ---------------- */
  let org = (await db.select().from(organizations).where(eq(organizations.slug, "nordic-fight-lab")).limit(1))[0];
  const owner = await ensureUser({ email: "owner@demo.mma", name: "Sara Lindqvist", phone: "+46 70 123 4567" });
  if (!org) {
    org = (
      await db
        .insert(organizations)
        .values({
          name: "Nordic Fight Lab",
          slug: "nordic-fight-lab",
          ownerId: owner.id,
          contactEmail: "hello@nordicfightlab.test",
          contactPhone: "+46 8 123 456",
          website: "https://nordicfightlab.test",
          description: "Stockholm's home for MMA, BJJ and Muay Thai.",
          currency: "SEK",
          country: "SE",
          onboardedAt: new Date(),
          onboardingStep: 4,
        })
        .returning()
    )[0];
  }

  const locations = await db.select().from(gymLocations).where(eq(gymLocations.orgId, org.id));
  let soder = locations.find((l) => l.name === "Södermalm");
  let kista = locations.find((l) => l.name === "Kista");
  if (!soder) {
    soder = (
      await db
        .insert(gymLocations)
        .values({ orgId: org.id, name: "Södermalm", address: "Hornsgatan 42", city: "Stockholm", isPrimary: true })
        .returning()
    )[0];
  }
  if (!kista) {
    kista = (
      await db
        .insert(gymLocations)
        .values({ orgId: org.id, name: "Kista", address: "Kistagången 12", city: "Stockholm" })
        .returning()
    )[0];
  }

  const existingMembers = await db.select().from(orgMembers).where(eq(orgMembers.orgId, org.id));
  async function ensureMember(userId: string, role: "owner" | "manager" | "coach" | "fighter", extra?: { locationId?: string; title?: string; status?: "active" | "inactive" }) {
    const found = existingMembers.find((m) => m.userId === userId);
    if (found) return found;
    const created = (
      await db
        .insert(orgMembers)
        .values({
          orgId: org!.id,
          userId,
          role,
          locationId: extra?.locationId ?? soder!.id,
          title: extra?.title ?? null,
          status: extra?.status ?? "active",
          joinedAt: addDays(new Date(), -120),
        })
        .returning()
    )[0];
    existingMembers.push(created);
    return created;
  }

  const ownerMember = await ensureMember(owner.id, "owner");
  const managerUser = await ensureUser({ email: "manager@demo.mma", name: "Johan Berg" });
  const managerMember = await ensureMember(managerUser.id, "manager", { title: "Gym manager" });

  const coachUser = await ensureUser({ email: "coach@demo.mma", name: "Marcus Silva", phone: "+46 70 555 1111" });
  const coachMember = await ensureMember(coachUser.id, "coach", { title: "Head coach · MMA" });
  const coachUser2 = await ensureUser({ email: "coach2@demo.mma", name: "Elin Dahl", phone: "+46 70 555 2222" });
  const coachMember2 = await ensureMember(coachUser2.id, "coach", { title: "BJJ coach", locationId: kista.id });

  const fighterUser = await ensureUser({
    email: "fighter@demo.mma",
    name: "Alex Nord",
    phone: "+46 70 777 8888",
    dateOfBirth: new Date("1997-04-12"),
  });
  const fighterMember = await ensureMember(fighterUser.id, "fighter");

  const fighterSeeds = [
    ["lina@demo.mma", "Lina Okoye", "competitor", "Pro", "Flyweight"],
    ["hugo@demo.mma", "Hugo Ek", "advanced", "MMA", "Welterweight"],
    ["amir@demo.mma", "Amir Haddad", "intermediate", "Muay Thai", "Lightweight"],
    ["nora@demo.mma", "Nora Strand", "intermediate", "BJJ", "Featherweight"],
    ["elias@demo.mma", "Elias Vik", "beginner", "MMA", "Middleweight"],
    ["zara@demo.mma", "Zara Ahmed", "advanced", "MMA", "Strawweight"],
    ["oskar@demo.mma", "Oskar Lund", "beginner", "Boxing", "Heavyweight"],
    ["maja@demo.mma", "Maja Holm", "intermediate", "Wrestling", "Bantamweight"],
    ["leo@demo.mma", "Leo Nyberg", "beginner", "MMA", "Lightweight"],
    ["saga@demo.mma", "Saga Ekström", "competitor", "MMA", "Flyweight"],
    ["yusuf@demo.mma", "Yusuf Demir", "intermediate", "MMA", "Welterweight"],
    ["ivy@demo.mma", "Ivy Karlsson", "beginner", "Kids MMA", "Kids"],
  ] as const;

  const fighterMembers: { member: typeof orgMembers.$inferSelect; user: typeof users.$inferSelect; level: string; discipline: string; weightClass: string }[] = [];
  for (const [email, name, level, discipline, weightClass] of fighterSeeds) {
    const user = await ensureUser({ email, name });
    const member = await ensureMember(user.id, "fighter");
    fighterMembers.push({ member, user, level, discipline, weightClass });
  }

  /* ---------------- plans ---------------- */
  const planDefs2 = [
    {
      name: "MMA Unlimited",
      description: "All classes, every day. Our most popular plan.",
      category: "unlimited" as const,
      priceCents: 99000,
      interval: "month" as const,
      classLimitPerWeek: null,
      creditCount: null,
      signupFeeCents: 29500,
      allowedDisciplines: null,
      sortOrder: 0,
      terms: "Rolling monthly. Cancel with 30 days notice.",
      cancellationPolicy: "30 days notice, no fee.",
      minCommitmentMonths: 1,
      noticePeriodDays: 30,
    },
    {
      name: "MMA 3x / week",
      description: "Three classes per week — ideal for a busy schedule.",
      category: "limited" as const,
      priceCents: 79000,
      interval: "month" as const,
      classLimitPerWeek: 3,
      signupFeeCents: 19500,
      sortOrder: 1,
      noticePeriodDays: 14,
    },
    {
      name: "BJJ Only",
      description: "Brazilian Jiu-Jitsu gi and no-gi classes.",
      category: "program" as const,
      priceCents: 69000,
      interval: "month" as const,
      allowedDisciplines: JSON.stringify(["Brazilian Jiu-Jitsu", "Open Mat"]),
      sortOrder: 2,
      noticePeriodDays: 14,
    },
    {
      name: "Muay Thai",
      description: "Striking, clinch and conditioning.",
      category: "program" as const,
      priceCents: 69000,
      interval: "month" as const,
      allowedDisciplines: JSON.stringify(["Muay Thai", "Boxing", "Open Mat"]),
      sortOrder: 3,
    },
    {
      name: "Kids MMA",
      description: "Ages 7–13. Guardian required at signup.",
      category: "kids" as const,
      priceCents: 49000,
      interval: "month" as const,
      allowedDisciplines: JSON.stringify(["Kids MMA"]),
      sortOrder: 4,
      familyDiscountBps: 1000,
    },
    {
      name: "Competition Team",
      description: "Invitation only. Coach approval required.",
      category: "team" as const,
      priceCents: 129000,
      interval: "month" as const,
      sortOrder: 5,
      minCommitmentMonths: 3,
      noticePeriodDays: 30,
    },
    {
      name: "10-Class Pass",
      description: "Ten classes, valid for six months.",
      category: "pass" as const,
      priceCents: 150000,
      interval: "one_time" as const,
      creditCount: 10,
      sortOrder: 6,
    },
    {
      name: "Intro Week",
      description: "Seven days of unlimited training for new members.",
      category: "trial" as const,
      priceCents: 0,
      interval: "one_time" as const,
      trialDays: 7,
      sortOrder: 7,
    },
  ];

  const existingPlans = await db.select().from(membershipPlans).where(eq(membershipPlans.orgId, org.id));
  const plans = [...existingPlans];
  for (const def of planDefs2) {
    if (plans.some((p) => p.name === def.name)) continue;
    const created = (
      await db
        .insert(membershipPlans)
        .values({
          orgId: org.id,
          name: def.name,
          description: def.description,
          category: def.category,
          priceCents: def.priceCents,
          currency: "SEK",
          interval: def.interval,
          classLimitPerWeek: def.classLimitPerWeek ?? null,
          creditCount: def.creditCount ?? null,
          allowedDisciplines: def.allowedDisciplines ?? null,
          signupFeeCents: def.signupFeeCents ?? 0,
          locationIds: null,
          minCommitmentMonths: def.minCommitmentMonths ?? 0,
          noticePeriodDays: def.noticePeriodDays ?? 0,
          familyDiscountBps: def.familyDiscountBps ?? 0,
          studentDiscountBps: 1000,
          freezeAllowed: true,
          freezeMaxDays: 60,
          autoRenew: true,
          taxRateBps: 2500,
          sortOrder: def.sortOrder,
          terms: def.terms ?? "Standard gym terms apply.",
          cancellationPolicy: def.cancellationPolicy ?? "Cancel any time with the notice period shown.",
        })
        .returning()
    )[0];
    plans.push(created);
  }
  const unlimited = plans.find((p) => p.name === "MMA Unlimited")!;
  const threePerWeek = plans.find((p) => p.name === "MMA 3x / week")!;
  const bjj = plans.find((p) => p.name === "BJJ Only")!;
  const kids = plans.find((p) => p.name === "Kids MMA")!;
  const pass = plans.find((p) => p.name === "10-Class Pass")!;
  const intro = plans.find((p) => p.name === "Intro Week")!;

  /* ---------------- classes ---------------- */
  const classDefs = [
    { name: "MMA Fundamentals", discipline: "MMA", level: "beginner" as const, coach: coachMember.id, days: [1, 3], time: "18:00", duration: 60, capacity: 20 },
    { name: "MMA Advanced", discipline: "MMA", level: "advanced" as const, coach: coachMember.id, days: [2, 4], time: "19:30", duration: 75, capacity: 16 },
    { name: "Brazilian Jiu-Jitsu", discipline: "Brazilian Jiu-Jitsu", level: "all" as const, coach: coachMember2.id, days: [1, 3, 5], time: "07:00", duration: 60, capacity: 24, location: kista.id },
    { name: "Muay Thai", discipline: "Muay Thai", level: "all" as const, coach: coachMember2.id, days: [2, 4], time: "18:00", duration: 60, capacity: 20 },
    { name: "Boxing", discipline: "Boxing", level: "beginner" as const, coach: coachMember.id, days: [6], time: "10:00", duration: 60, capacity: 18 },
    { name: "Wrestling", discipline: "Wrestling", level: "intermediate" as const, coach: coachMember.id, days: [5], time: "17:30", duration: 60, capacity: 16 },
    { name: "Sparring", discipline: "MMA", level: "advanced" as const, coach: coachMember.id, days: [6], time: "12:00", duration: 90, capacity: 14 },
    { name: "Strength & Conditioning", discipline: "Strength", level: "all" as const, coach: coachMember2.id, days: [3], time: "12:00", duration: 45, capacity: 20 },
    { name: "Open Mat", discipline: "Open Mat", level: "all" as const, coach: coachMember2.id, days: [0], time: "11:00", duration: 120, capacity: 40, location: kista.id },
    { name: "Kids MMA", discipline: "Kids MMA", level: "kids" as const, coach: coachMember2.id, days: [1, 3], time: "16:30", duration: 45, capacity: 16 },
    { name: "Competition Team", discipline: "MMA", level: "advanced" as const, coach: coachMember.id, days: [2, 5], time: "20:00", duration: 90, capacity: 12 },
  ];

  const existingClasses = await db.select().from(classes).where(eq(classes.orgId, org.id));
  for (const def of classDefs) {
    if (existingClasses.some((c) => c.name === def.name)) continue;
    await db.insert(classes).values({
      orgId: org.id,
      locationId: def.location ?? soder.id,
      name: def.name,
      discipline: def.discipline,
      description: `${def.name} at Nordic Fight Lab`,
      coachMemberId: def.coach,
      capacity: def.capacity,
      durationMinutes: def.duration,
      level: def.level,
      bookingWindowDays: 14,
      cancellationWindowHours: 4,
      recurrence: JSON.stringify({ days: def.days, time: def.time }),
      color: def.discipline.includes("Jiu") ? "#60A5FA" : def.discipline.includes("Muay") ? "#F59E0B" : "#B8F36B",
    });
  }
  await generateAllSessions(org.id, 6);

  /* ---------------- memberships ---------------- */
  const allSessions = await db.select().from(classSessions).where(eq(classSessions.orgId, org.id));
  const now = new Date();

  // Invoice numbers are globally unique; derive a deterministic sequence instead
  // of random values (random numbers collide under the birthday paradox).
  let invoiceSeq = Number(
    (await db.select({ n: sql<number>`count(*)` }).from(invoices))[0]?.n ?? 0,
  );
  const nextInvoiceNo = () => `INV-2025-${String(++invoiceSeq).padStart(5, "0")}`;

  const existingSubs = await db.select().from(subscriptions).where(eq(subscriptions.orgId, org.id));
  const planRotation = [unlimited, threePerWeek, bjj, unlimited, threePerWeek, unlimited, kids, bjj, unlimited, unlimited, threePerWeek, intro];
  const statusRotation = ["active", "active", "active", "past_due", "active", "active", "active", "paused", "active", "cancel_scheduled", "trial", "active"];

  const ensureSub = async (memberId: string, planId: string, status: (typeof subscriptions.$inferInsert)["status"], idx: number) => {
    if (existingSubs.some((s) => s.memberId === memberId)) return;
    const plan = plans.find((p) => p.id === planId)!;
    const start = addDays(now, -(20 + idx * 5));
    const inserted = (
      await db
        .insert(subscriptions)
        .values({
          orgId: org.id,
          memberId,
          planId,
          status,
          priceCents: plan.priceCents,
          currency: "SEK",
          startDate: start,
          currentPeriodStart: start,
          currentPeriodEnd: addDays(start, 30),
          creditsRemaining: plan.creditCount ?? null,
          provider: "sandbox",
          autoRenew: plan.autoRenew,
          paymentMethodLabel: "Visa •••• 4242 (sandbox)",
        })
        .returning()
    )[0];
    existingSubs.push(inserted);

    // Historical invoices: two paid, sometimes an overdue one.
    for (let k = 0; k < 2; k++) {
      const periodStart = addDays(start, k * 30);
      const paid = !(status === "past_due" && k === 1);
      const invoice = (
        await db
          .insert(invoices)
          .values({
            orgId: org.id,
            subscriptionId: inserted.id,
            memberId,
            number: nextInvoiceNo(),
            amountCents: plan.priceCents,
            taxCents: Math.round(plan.priceCents * 0.25),
            currency: "SEK",
            status: paid ? "paid" : "open",
            periodStart,
            periodEnd: addDays(periodStart, 30),
            dueDate: addDays(periodStart, 7),
            paidAt: paid ? addDays(periodStart, 1) : null,
            provider: "sandbox",
            description: `${plan.name} membership`,
          })
          .returning()
      )[0];
      if (paid) {
        const { payments } = await import("./schema");
        await db.insert(payments).values({
          orgId: org.id,
          invoiceId: invoice.id,
          memberId,
          amountCents: plan.priceCents,
          currency: "SEK",
          status: "succeeded",
          provider: "sandbox",
          providerPaymentId: `sandbox_${invoice.id}`,
          method: "card",
          processedAt: addDays(periodStart, 1),
          createdAt: addDays(periodStart, 1),
        });
      }
    }
  };

  await ensureSub(fighterMember.id, unlimited.id, "active", 0);
  for (let i = 0; i < fighterMembers.length; i++) {
    const f = fighterMembers[i];
    await ensureSub(f.member.id, planRotation[i % planRotation.length].id, statusRotation[i % statusRotation.length] as never, i + 1);
  }

  /* ---------------- fighter profiles, coach links ---------------- */
  const allProfiles = await db.select().from(fighterProfiles).where(eq(fighterProfiles.orgId, org.id));
  const allAssignments = await db.select().from(coachAssignments).where(eq(coachAssignments.orgId, org.id));
  const profileFor = async (memberId: string, name: string, level: string, discipline: string, weightClass: string, opts?: { minor?: boolean }) => {
    if (!allProfiles.some((p) => p.memberId === memberId)) {
      const created = (
        await db
          .insert(fighterProfiles)
          .values({
            orgId: org.id,
            memberId,
            level: level as never,
            discipline,
            weightClass,
            currentWeightKg: 70 + Math.random() * 20,
            heightCm: 165 + Math.floor(Math.random() * 20),
            stance: Math.random() > 0.7 ? "Southpaw" : "Orthodox",
            goals: "Compete in 2026",
            isMinor: opts?.minor ?? false,
            guardianName: opts?.minor ? "Parent of " + name : null,
            publicProfile: false,
          })
          .returning()
      )[0];
      allProfiles.push(created);
    }
    const coachMemberId = discipline === "Brazilian Jiu-Jitsu" ? coachMember2.id : coachMember.id;
    if (!allAssignments.some((a) => a.fighterMemberId === memberId)) {
      const created = (
        await db
          .insert(coachAssignments)
          .values({
            orgId: org.id,
            coachMemberId,
            fighterMemberId: memberId,
            isPrimary: true,
            focus: discipline,
            assignedById: owner.id,
          })
          .returning()
      )[0];
      allAssignments.push(created);
    }
  };

  await profileFor(fighterMember.id, "Alex Nord", "intermediate", "MMA", "Lightweight");
  for (const f of fighterMembers) {
    await profileFor(f.member.id, f.user.name, f.level, f.discipline, f.weightClass, {
      minor: f.discipline === "Kids MMA",
    });
  }

  /* ---------------- bookings + attendance history ---------------- */
  const existingBookings = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.orgId, org.id)).limit(1);
  if (!existingBookings.length) {
    const upcoming = allSessions.filter((s) => s.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const eligible = [fighterMember, ...fighterMembers.map((f) => f.member)];
    for (let i = 0; i < Math.min(upcoming.length, 26); i++) {
      const session = upcoming[i];
      const member = eligible[i % eligible.length];
      await db
        .insert(bookings)
        .values({
          orgId: org.id,
          sessionId: session.id,
          memberId: member.id,
          status: "booked",
          source: "app",
        })
        .onConflictDoNothing();
    }
    // Past attendance for the last 5 weeks (drives analytics + streaks)
    const past = allSessions.filter((s) => s.startsAt < now).slice(-40);
    for (let i = 0; i < past.length; i++) {
      const session = past[i];
      const member = eligible[i % eligible.length];
      const checkedInAt = new Date(session.startsAt.getTime() - 10 * 60000);
      await db
        .insert(attendance)
        .values({
          orgId: org.id,
          memberId: member.id,
          sessionId: session.id,
          method: i % 3 === 0 ? "qr" : i % 3 === 1 ? "staff" : "self",
          checkedInAt,
        })
        .onConflictDoNothing();
      await db
        .insert(bookings)
        .values({
          orgId: org.id,
          sessionId: session.id,
          memberId: member.id,
          status: "attended",
          checkedInAt,
          checkInMethod: "qr",
          bookedAt: addDays(checkedInAt, -2),
        })
        .onConflictDoNothing();
    }
    // Today's check-ins (5 more, so the dashboard is alive)
    const todaySessions = allSessions.filter(
      (s) => s.startsAt.toDateString() === now.toDateString() && s.startsAt <= now,
    );
    if (todaySessions[0]) {
      for (let i = 0; i < Math.min(5, eligible.length); i++) {
        await db
          .insert(attendance)
          .values({
            orgId: org.id,
            memberId: eligible[i].id,
            sessionId: i === 0 ? todaySessions[0].id : null,
            method: "staff",
            checkedInAt: new Date(now.getTime() - i * 20 * 60000),
          })
          .onConflictDoNothing();
      }
    }
  }

  /* ---------------- training logs, goals, programs ---------------- */
  const existingTraining = await db.select({ id: trainingSessions.id }).from(trainingSessions).where(eq(trainingSessions.orgId, org.id)).limit(1);
  if (!existingTraining.length) {
    const types = ["BJJ", "Muay Thai", "Strength", "Sparring", "Conditioning", "MMA", "Recovery"];
    const intensities = ["light", "moderate", "hard", "max"] as const;
    for (let i = 0; i < 24; i++) {
      await db.insert(trainingSessions).values({
        orgId: org.id,
        memberId: fighterMember.id,
        type: types[i % types.length],
        date: addDays(now, -i),
        durationMinutes: [45, 60, 75, 90][i % 4],
        intensity: intensities[i % intensities.length],
        rpe: 6 + (i % 4),
        notes: i % 5 === 0 ? "Felt strong. Worked on guard passing." : null,
      });
    }
    for (let i = 0; i < 8; i++) {
      await db.insert(trainingSessions).values({
        orgId: org.id,
        memberId: fighterMembers[i].member.id,
        type: ["MMA", "BJJ", "Boxing", "Wrestling"][i % 4],
        date: addDays(now, -i * 2),
        durationMinutes: 60 + i * 5,
        intensity: "moderate",
        rpe: 7,
      });
    }
    await db.insert(fighterGoals).values([
      { orgId: org.id, memberId: fighterMember.id, title: "Compete in 2026", target: "Book first amateur bout", progress: 40, dueDate: addDays(now, 90) },
      { orgId: org.id, memberId: fighterMember.id, title: "Train 5x per week", target: "20 sessions this month", progress: 65, dueDate: addDays(now, 20) },
      { orgId: org.id, memberId: fighterMember.id, title: "Hit 70 kg walking weight", target: "70 kg", progress: 80, dueDate: addDays(now, 60) },
    ]);
    const program = (
      await db
        .insert(trainingPrograms)
        .values({
          orgId: org.id,
          coachMemberId: coachMember.id,
          title: "8-week MMA base camp",
          description: "Build a gas tank and sharpen the fundamentals.",
          discipline: "MMA",
          weeks: 8,
          sessionsPerWeek: 4,
          plan: JSON.stringify([
            { week: 1, focus: "Base", sessions: ["MMA technique", "BJJ", "S&C", "Sparring"] },
            { week: 2, focus: "Volume", sessions: ["MMA technique", "BJJ", "S&C", "Sparring"] },
          ]),
        })
        .returning()
    )[0];
    await db.insert(programAssignments).values({
      orgId: org.id,
      programId: program.id,
      fighterMemberId: fighterMember.id,
      assignedById: coachUser.id,
      progressPct: 35,
      dueAt: addDays(now, 30),
    });
    await db.insert(coachNotes).values([
      {
        orgId: org.id,
        coachMemberId: coachMember.id,
        fighterMemberId: fighterMember.id,
        body: "Great improvement in the clinch. Keep working the underhook escapes.",
        visibility: "fighter",
      },
      {
        orgId: org.id,
        coachMemberId: coachMember.id,
        fighterMemberId: fighterMember.id,
        body: "Watch weight management — no drastic cuts, focus on consistency.",
        visibility: "staff",
      },
    ]);
  }

  /* ---------------- fight camp + records ---------------- */
  const existingCamps = await db.select({ id: fightCamps.id }).from(fightCamps).where(eq(fightCamps.orgId, org.id)).limit(1);
  if (!existingCamps.length) {
    const fightDate = addDays(now, 28);
    await db.insert(fightCamps).values({
      orgId: org.id,
      fighterMemberId: fighterMember.id,
      coachMemberId: coachMember.id,
      title: "Nordic Fight Night — Alex Nord",
      opponent: "T. Virtanen",
      eventName: "Nordic Fight Night 12",
      fightDate,
      weightClass: "Lightweight",
      campStart: addDays(now, -14),
      phases: JSON.stringify([
        { name: "Base", start: addDays(now, -14).toISOString(), end: addDays(now, 0).toISOString(), focus: "Volume + fundamentals" },
        { name: "Sharpen", start: addDays(now, 1).toISOString(), end: addDays(now, 14).toISOString(), focus: "Sparring + tactics" },
        { name: "Taper", start: addDays(now, 15).toISOString(), end: fightDate.toISOString(), focus: "Recovery + weight check" },
      ]),
      weeklyTargets: JSON.stringify({ sessions: 5, sparring: 2, strength: 2, recovery: 1 }),
      checklist: JSON.stringify([
        { label: "Medical check booked", done: true },
        { label: "Opponent tape reviewed", done: true },
        { label: "Weight check (7 days out)", done: false },
        { label: "Travel + corner team confirmed", done: false },
        { label: "Equipment check", done: false },
      ]),
      coachNotes: "Keep the weight cut gradual. We review readiness every Monday.",
    });
    for (let i = 0; i < 10; i++) {
      await db.insert(readinessCheckins).values({
        orgId: org.id,
        memberId: fighterMember.id,
        date: addDays(now, -i),
        sleep: 6 + (i % 3),
        soreness: 3 + (i % 4),
        energy: 6 + (i % 4),
        mood: 7,
        weightKg: 71.4 + (i % 3) * 0.3,
      });
    }
    await db.insert(fightRecords).values([
      {
        orgId: org.id,
        fighterMemberId: fighterMember.id,
        result: "win" as const,
        method: "Submission",
        opponent: "J. Halonen",
        eventName: "Nordic Fight Night 11",
        fightDate: addDays(now, -120),
        weightClass: "Lightweight",
        rounds: 3,
        roundEnded: 2,
        level: "amateur" as const,
        verified: true,
        verifiedById: coachUser.id,
        verifiedAt: addDays(now, -118),
      },
      {
        orgId: org.id,
        fighterMemberId: fighterMember.id,
        result: "loss" as const,
        method: "Decision",
        opponent: "M. Costa",
        eventName: "Nordic Fight Night 9",
        fightDate: addDays(now, -260),
        weightClass: "Lightweight",
        rounds: 3,
        level: "amateur" as const,
        verified: true,
        verifiedById: coachUser.id,
      },
      {
        orgId: org.id,
        fighterMemberId: fighterMember.id,
        result: "win" as const,
        method: "TKO",
        opponent: "S. Berg",
        eventName: "Local Grappling Cup",
        fightDate: addDays(now, -330),
        weightClass: "Lightweight",
        rounds: 3,
        roundEnded: 1,
        level: "amateur" as const,
        verified: false,
      },
    ]);
  }

  /* ---------------- comms ---------------- */
  const existingAnn = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.orgId, org.id)).limit(1);
  if (!existingAnn.length) {
    await db.insert(announcements).values([
      {
        orgId: org.id,
        authorId: owner.id,
        title: "New morning BJJ classes",
        body: "Starting this week, BJJ runs Mon/Wed/Fri at 07:00 in Kista. Book in the app.",
        audience: "all",
      },
      {
        orgId: org.id,
        authorId: coachUser.id,
        title: "Sparring night Saturday",
        body: "Sparring starts at 12:00. Bring shin guards and a mouthguard.",
        audience: "fighters",
      },
    ]);
    await db.insert(notifications).values([
      {
        userId: fighterUser.id,
        orgId: org.id,
        type: "fightcamp",
        title: "Camp starts Monday",
        body: "Your fight camp plan is ready. Check the checklist.",
        link: "/app/fights",
        dedupeKey: "seed-camp",
      },
      {
        userId: fighterUser.id,
        orgId: org.id,
        type: "class",
        title: "Class reminder: MMA Advanced",
        body: "Tomorrow 19:30 at Södermalm.",
        link: "/app/schedule",
        dedupeKey: "seed-class",
      },
    ]);
    await db.insert(consents).values([
      { userId: fighterUser.id, orgId: org.id, type: "terms", granted: true, grantedAt: new Date() },
      { userId: fighterUser.id, orgId: org.id, type: "privacy", granted: true, grantedAt: new Date() },
    ]);
  }

  /* ---------------- SaaS subscription for gym #1 ---------------- */
  const existingSaas = await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.orgId, org.id)).limit(1);
  if (!existingSaas.length) {
    await db.insert(saasSubscriptions).values({
      orgId: org.id,
      planId: proPlan.id,
      status: "active",
      provider: "sandbox",
      currentPeriodStart: addDays(now, -10),
      currentPeriodEnd: addDays(now, 20),
      trialEndsAt: addDays(now, -20),
    });
  }

  /* ---------------- demo gym #2 (tenant isolation) ---------------- */
  let org2 = (await db.select().from(organizations).where(eq(organizations.slug, "southside-mma")).limit(1))[0];
  const owner2 = await ensureUser({ email: "owner@southside.mma", name: "Daniel Reyes" });
  if (!org2) {
    org2 = (
      await db
        .insert(organizations)
        .values({
          name: "Southside MMA",
          slug: "southside-mma",
          ownerId: owner2.id,
          contactEmail: "hi@southside.test",
          currency: "SEK",
          status: "active",
          onboardedAt: new Date(),
          onboardingStep: 4,
        })
        .returning()
    )[0];
    const loc = (
      await db
        .insert(gymLocations)
        .values({ orgId: org2.id, name: "Malmö", address: "Storgatan 1", city: "Malmö", isPrimary: true })
        .returning()
    )[0];
    const m2 = await ensureUser({ email: "member@southside.mma", name: "Kim Sandberg" });
    const ownerMember2 = (await db.insert(orgMembers).values({ orgId: org2.id, userId: owner2.id, role: "owner", locationId: loc.id, joinedAt: addDays(now, -60) }).returning())[0];
    const member2 = (await db.insert(orgMembers).values({ orgId: org2.id, userId: m2.id, role: "fighter", locationId: loc.id, joinedAt: addDays(now, -30) }).returning())[0];
    const plan2 = (
      await db
        .insert(membershipPlans)
        .values({ orgId: org2.id, name: "Southside Unlimited", priceCents: 89000, currency: "SEK", interval: "month", description: "All classes" })
        .returning()
    )[0];
    await db.insert(classes).values({
      orgId: org2.id,
      locationId: loc.id,
      name: "MMA Basics",
      discipline: "MMA",
      coachMemberId: ownerMember2.id,
      capacity: 15,
      durationMinutes: 60,
      recurrence: JSON.stringify({ days: [1, 4], time: "18:00" }),
    });
    await generateAllSessions(org2.id, 3);
    await db.insert(subscriptions).values({
      orgId: org2.id,
      memberId: member2.id,
      planId: plan2.id,
      status: "active",
      priceCents: 89000,
      currency: "SEK",
      startDate: addDays(now, -20),
      currentPeriodStart: addDays(now, -20),
      currentPeriodEnd: addDays(now, 10),
      provider: "sandbox",
    });
    await db.insert(saasSubscriptions).values({
      orgId: org2.id,
      planId: starterPlan.id,
      status: "active",
      provider: "sandbox",
      currentPeriodStart: addDays(now, -5),
      currentPeriodEnd: addDays(now, 25),
    });
    void managerMember;
  }


  /* ---------------- platform demo: support, GDPR, email, audit ---------------- */
  const supportSeeds = [
    {
      subject: "Invoice reminder missing",
      body: "We turned on automatic reminders but no email was sent for last month's open invoice. Can you check the schedule?",
      status: "open" as const,
      priority: "high" as const,
      response: null as string | null,
    },
    {
      subject: "Add a second coach to the Tuesday class",
      body: "Our Tuesday no-gi class is full. We need to raise capacity and add coach Emilia as backup.",
      status: "pending" as const,
      priority: "normal" as const,
      response: "Capacity raised to 24 and Emilia added as backup coach. Reply if it still looks wrong." as string | null,
    },
    {
      subject: "Export members as CSV",
      body: "Is it possible to export our member list with plan and status columns?",
      status: "resolved" as const,
      priority: "low" as const,
      response: "Members can be exported from Members → Export. Include plans from the filter bar." as string | null,
    },
  ];
  const existingTickets = await db.select({ subject: supportTickets.subject }).from(supportTickets).where(eq(supportTickets.orgId, org.id));
  if (!existingTickets.length) {
    await db.insert(supportTickets).values(
      supportSeeds.map((t, i) => ({
        orgId: org.id,
        userId: (i === 0 ? owner.id : i === 1 ? managerUser.id : fighterUser.id),
        subject: t.subject,
        body: t.body,
        status: t.status,
        priority: t.priority,
        response: t.response,
        createdAt: addDays(now, -6 + i * 2),
        updatedAt: addDays(now, -5 + i * 2),
      })),
    );
  }

  const existingRequests = await db.select({ id: dataRequests.id }).from(dataRequests).where(eq(dataRequests.userId, fighterUser.id));
  if (!existingRequests.length) {
    await db.insert(dataRequests).values([
      { userId: fighterUser.id, type: "export", status: "pending", createdAt: addDays(now, -2) },
      { userId: managerUser.id, type: "export", status: "completed", notes: "Delivered as JSON archive (sandbox).", createdAt: addDays(now, -20), completedAt: addDays(now, -19) },
    ]);
  }

  const existingEmails = await db.select({ id: emailOutbox.id }).from(emailOutbox).limit(1);
  if (!existingEmails.length) {
    await db.insert(emailOutbox).values([
      { to: "fighter@demo.mma", subject: "Your invoice is ready", body: "Your monthly invoice for Nordic Fight Lab is available in the app.", template: "invoice", status: "sent", sentAt: addDays(now, -3), createdAt: addDays(now, -3) },
      { to: "owner@demo.mma", subject: "Weekly gym summary", body: "Members: 17 · Check-ins: 42 · Open invoices: 4.", template: "digest", status: "sent", sentAt: addDays(now, -1), createdAt: addDays(now, -1) },
      { to: "newmember@example.com", subject: "Join Nordic Fight Lab on MMA OS", body: "You have been invited to join Nordic Fight Lab.", template: "invite", status: "queued", createdAt: addDays(now, -1) },
      { to: "bounce@example.com", subject: "Reset your password", body: "Reset link expired.", template: "password_reset", status: "failed", error: "Mailbox does not exist (sandbox)", createdAt: addDays(now, -4) },
    ]);
  }

  const existingAudit = await db.select({ id: auditLogs.id }).from(auditLogs).limit(1);
  if (!existingAudit.length) {
    await audit({ orgId: org.id, actor: { id: owner.id, name: owner.name, role: "owner" }, action: "organization.created", targetType: "organization", targetId: org.id, meta: { source: "seed" } });
    await audit({ orgId: org.id, actor: { id: owner.id, name: owner.name, role: "owner" }, action: "plan.created", targetType: "membership_plan", meta: { plans: 8 } });
    await audit({ orgId: org.id, actor: { id: managerUser.id, name: managerUser.name, role: "manager" }, action: "class.created", targetType: "class", meta: { source: "seed" } });
    await audit({ orgId: org.id, actor: { id: owner.id, name: owner.name, role: "owner" }, action: "coach.assigned", targetType: "coach_assignment", meta: { athletes: 8 } });
    await audit({ orgId: org.id, actor: { id: owner.id, name: owner.name, role: "owner" }, action: "member.invited", targetType: "invitation", meta: { role: "fighter" } });
    await audit({ actor: { id: owner2.id, name: owner2.name, role: "super_admin" }, action: "platform.org.created", targetType: "organization", targetId: org2.id, meta: { plan: "starter" } });
    await audit({ actor: { id: owner.id, name: "Platform Admin", role: "super_admin" }, action: "platform.audit.verified", meta: { entries: 7, valid: true } });
  }

  const counts = await db.select({ n: sql<number>`count(*)` }).from(orgMembers).where(eq(orgMembers.orgId, org.id));
  return { orgId: org.id, members: Number(counts[0]?.n ?? 0) };
}

// Only auto-run when this file is executed directly (`npm run db:seed`).
// A loose substring match would also fire when any other script name contains
// "seed", causing two concurrent seed runs and UNIQUE violations.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = entry.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.(ts|js|mjs|cjs)$/, "") === "seed";
})();

if (invokedDirectly) {
  seedDemo()
    .then((r) => {
      console.log(`[mma-os] demo data ready — gym ${r.orgId} with ${r.members} members`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

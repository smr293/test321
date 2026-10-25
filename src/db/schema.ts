/**
 * MMA OS — relational schema (Drizzle ORM).
 *
 * Every tenant-owned row carries `orgId` so that authorization can be enforced
 * with tenant-scoped queries (see src/lib/authz.ts). Financial rows are append
 * only; corrections happen through refunds / credit notes, never by mutation.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string, def = false) =>
  integer(name, { mode: "boolean" }).notNull().default(def);
const money = (name: string) => integer(name).notNull().default(0); // minor units

/* ------------------------------------------------------------------ */
/* Identity & sessions                                                 */
/* ------------------------------------------------------------------ */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    phone: text("phone"),
    dateOfBirth: ts("date_of_birth"),
    avatarUrl: text("avatar_url"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    address: text("address"),
    isSuperAdmin: bool("is_super_admin"),
    status: text("status", { enum: ["active", "suspended", "pending_deletion"] })
      .notNull()
      .default("active"),
    mustChangePassword: bool("must_change_password"),
    mfaEnabled: bool("mfa_enabled"),
    mfaSecret: text("mfa_secret"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    locale: text("locale").notNull().default("en"),
    theme: text("theme", { enum: ["dark", "light", "system"] }).notNull().default("dark"),
    marketingOptIn: bool("marketing_opt_in"),
    termsAcceptedAt: ts("terms_accepted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = sqliteTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    success: bool("success"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_ident_idx").on(t.identifier, t.createdAt)],
);

export const securityEvents = sqliteTable(
  "security_events",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: text("detail"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("security_events_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Tenants: organizations, locations, staff                            */
/* ------------------------------------------------------------------ */

export const organizations = sqliteTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: text("owner_id").references(() => users.id),
    status: text("status", { enum: ["active", "suspended", "archived"] })
      .notNull()
      .default("active"),
    currency: text("currency").notNull().default("SEK"),
    country: text("country").notNull().default("SE"),
    timezone: text("timezone").notNull().default("Europe/Stockholm"),
    taxRateBps: integer("tax_rate_bps").notNull().default(2500),
    brandColor: text("brand_color").notNull().default("#B8F36B"),
    logoUrl: text("logo_url"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    description: text("description"),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardedAt: ts("onboarded_at"),
    suspendedReason: text("suspended_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug), index("organizations_status_idx").on(t.status)],
);

export const gymLocations = sqliteTable(
  "gym_locations",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    timezone: text("timezone").notNull().default("Europe/Stockholm"),
    isPrimary: bool("is_primary"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [index("gym_locations_org_idx").on(t.orgId)],
);

export const orgMembers = sqliteTable(
  "org_members",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "manager", "coach", "fighter"] }).notNull(),
    locationId: text("location_id").references(() => gymLocations.id),
    title: text("title"),
    permissions: text("permissions"), // JSON array overriding manager defaults
    status: text("status", { enum: ["invited", "active", "inactive", "archived"] })
      .notNull()
      .default("active"),
    joinedAt: ts("joined_at"),
    archivedAt: ts("archived_at"),
    invitedById: text("invited_by_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("org_members_org_user_uq").on(t.orgId, t.userId),
    index("org_members_user_idx").on(t.userId),
    index("org_members_org_role_idx").on(t.orgId, t.role),
  ],
);

/** Coach ↔ athlete (student) relationship: the core "elev och tränare" link. */
export const coachAssignments = sqliteTable(
  "coach_assignments",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    coachMemberId: text("coach_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    fighterMemberId: text("fighter_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    isPrimary: bool("is_primary"),
    focus: text("focus"),
    assignedById: text("assigned_by_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coach_assignments_uq").on(t.coachMemberId, t.fighterMemberId),
    index("coach_assignments_fighter_idx").on(t.fighterMemberId),
    index("coach_assignments_org_idx").on(t.orgId),
  ],
);

export const coachNotes = sqliteTable(
  "coach_notes",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    coachMemberId: text("coach_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    fighterMemberId: text("fighter_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    visibility: text("visibility", { enum: ["private", "staff", "fighter"] })
      .notNull()
      .default("staff"),
    createdAt: createdAt(),
  },
  (t) => [index("coach_notes_fighter_idx").on(t.fighterMemberId)],
);

export const fighterProfiles = sqliteTable(
  "fighter_profiles",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    nickname: text("nickname"),
    discipline: text("discipline"),
    level: text("level", { enum: ["beginner", "intermediate", "advanced", "competitor"] })
      .notNull()
      .default("beginner"),
    weightClass: text("weight_class"),
    currentWeightKg: real("current_weight_kg"),
    targetWeightKg: real("target_weight_kg"),
    heightCm: integer("height_cm"),
    stance: text("stance"),
    goals: text("goals"),
    isMinor: bool("is_minor"),
    guardianName: text("guardian_name"),
    guardianPhone: text("guardian_phone"),
    publicProfile: bool("public_profile"),
    publicConsentAt: ts("public_consent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("fighter_profiles_member_uq").on(t.memberId), index("fighter_profiles_org_idx").on(t.orgId)],
);

/* ------------------------------------------------------------------ */
/* Membership plans & subscriptions                                    */
/* ------------------------------------------------------------------ */

export const membershipPlans = sqliteTable(
  "membership_plans",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category", { enum: ["unlimited", "limited", "program", "pass", "trial", "team", "kids", "annual"] })
      .notNull()
      .default("unlimited"),
    priceCents: money("price_cents"),
    currency: text("currency").notNull().default("SEK"),
    interval: text("interval", { enum: ["month", "year", "week", "one_time"] })
      .notNull()
      .default("month"),
    classLimitPerWeek: integer("class_limit_per_week"),
    creditCount: integer("credit_count"),
    allowedDisciplines: text("allowed_disciplines"), // JSON string[]; null = all
    locationIds: text("location_ids"), // JSON string[]; null = all locations
    signupFeeCents: money("signup_fee_cents"),
    trialDays: integer("trial_days").notNull().default(0),
    minCommitmentMonths: integer("min_commitment_months").notNull().default(0),
    noticePeriodDays: integer("notice_period_days").notNull().default(0),
    freezeAllowed: bool("freeze_allowed", true),
    freezeMaxDays: integer("freeze_max_days").notNull().default(60),
    autoRenew: bool("auto_renew", true),
    taxRateBps: integer("tax_rate_bps"),
    familyDiscountBps: integer("family_discount_bps").notNull().default(0),
    studentDiscountBps: integer("student_discount_bps").notNull().default(0),
    introOfferCents: integer("intro_offer_cents"),
    introOfferMonths: integer("intro_offer_months"),
    cancellationPolicy: text("cancellation_policy"),
    terms: text("terms"),
    isActive: bool("is_active", true),
    isPublic: bool("is_public", true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("membership_plans_org_idx").on(t.orgId)],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull().references(() => membershipPlans.id),
    status: text("status", {
      enum: ["active", "trial", "pending", "paused", "past_due", "cancel_scheduled", "expired", "cancelled"],
    })
      .notNull()
      .default("pending"),
    priceCents: money("price_cents"),
    currency: text("currency").notNull().default("SEK"),
    discountBps: integer("discount_bps").notNull().default(0),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    currentPeriodStart: integer("current_period_start", { mode: "timestamp_ms" }).notNull(),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }).notNull(),
    cancelAtPeriodEnd: bool("cancel_at_period_end"),
    cancelRequestedAt: ts("cancel_requested_at"),
    cancelledAt: ts("cancelled_at"),
    pausedAt: ts("paused_at"),
    resumeAt: ts("resume_at"),
    endedAt: ts("ended_at"),
    creditsRemaining: integer("credits_remaining"),
    autoRenew: bool("auto_renew", true),
    provider: text("provider", { enum: ["stripe", "sandbox", "manual", "complimentary"] })
      .notNull()
      .default("sandbox"),
    providerSubscriptionId: text("provider_subscription_id"),
    paymentMethodLabel: text("payment_method_label"),
    statusReason: text("status_reason"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subscriptions_member_idx").on(t.memberId),
    index("subscriptions_org_status_idx").on(t.orgId, t.status),
    uniqueIndex("subscriptions_provider_uq").on(t.provider, t.providerSubscriptionId),
  ],
);

export const membershipPauses = sqliteTable(
  "membership_pauses",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp_ms" }).notNull(),
    reason: text("reason"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("membership_pauses_sub_idx").on(t.subscriptionId)],
);

export const membershipCredits = sqliteTable(
  "membership_credits",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("membership_credits_sub_idx").on(t.subscriptionId)],
);

export const membershipPlanChanges = sqliteTable("membership_plan_changes", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  fromPlanId: text("from_plan_id"),
  toPlanId: text("to_plan_id").notNull(),
  effectiveAt: integer("effective_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["scheduled", "applied", "cancelled"] }).notNull().default("scheduled"),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
});

export const membershipEvents = sqliteTable(
  "membership_events",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorId: text("actor_id"),
    meta: text("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("membership_events_sub_idx").on(t.subscriptionId)],
);

/* ------------------------------------------------------------------ */
/* Money: invoices, payments, refunds, provider events                 */
/* ------------------------------------------------------------------ */

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    amountCents: money("amount_cents"),
    taxCents: money("tax_cents"),
    currency: text("currency").notNull().default("SEK"),
    status: text("status", { enum: ["draft", "open", "paid", "void", "refunded", "uncollectible"] })
      .notNull()
      .default("open"),
    periodStart: ts("period_start"),
    periodEnd: ts("period_end"),
    dueDate: ts("due_date"),
    paidAt: ts("paid_at"),
    provider: text("provider").notNull().default("sandbox"),
    providerInvoiceId: text("provider_invoice_id"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.number),
    index("invoices_org_status_idx").on(t.orgId, t.status),
    uniqueIndex("invoices_provider_uq").on(t.provider, t.providerInvoiceId),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").references(() => invoices.id),
    memberId: text("member_id").references(() => orgMembers.id),
    amountCents: money("amount_cents"),
    currency: text("currency").notNull().default("SEK"),
    status: text("status", { enum: ["pending", "succeeded", "failed", "refunded", "disputed"] })
      .notNull()
      .default("pending"),
    provider: text("provider").notNull().default("sandbox"),
    providerPaymentId: text("provider_payment_id"),
    method: text("method"),
    failureReason: text("failure_reason"),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_org_created_idx").on(t.orgId, t.createdAt),
    uniqueIndex("payments_provider_uq").on(t.provider, t.providerPaymentId),
  ],
);

export const refunds = sqliteTable("refunds", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  amountCents: money("amount_cents"),
  reason: text("reason"),
  providerRefundId: text("provider_refund_id"),
  createdById: text("created_by_id"),
  createdAt: createdAt(),
});

/** Idempotency ledger for payment-provider webhooks. */
export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: id(),
    provider: text("provider").notNull().default("stripe"),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload"),
    status: text("status", { enum: ["received", "processed", "failed", "ignored"] })
      .notNull()
      .default("received"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_events_provider_event_uq").on(t.provider, t.eventId)],
);

/* ------------------------------------------------------------------ */
/* SaaS layer                                                          */
/* ------------------------------------------------------------------ */

export const saasPlans = sqliteTable(
  "saas_plans",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceMonthlyCents: money("price_monthly_cents"),
    priceAnnualCents: money("price_annual_cents"),
    currency: text("currency").notNull().default("SEK"),
    maxLocations: integer("max_locations").notNull().default(1),
    maxActiveMembers: integer("max_active_members").notNull().default(100),
    maxCoaches: integer("max_coaches").notNull().default(3),
    features: text("features").notNull().default("[]"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saas_plans_slug_uq").on(t.slug)],
);

export const saasSubscriptions = sqliteTable(
  "saas_subscriptions",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull().references(() => saasPlans.id),
    status: text("status", { enum: ["trialing", "active", "past_due", "cancelled", "paused"] })
      .notNull()
      .default("trialing"),
    seats: integer("seats").notNull().default(1),
    provider: text("provider").notNull().default("sandbox"),
    providerSubscriptionId: text("provider_subscription_id"),
    trialEndsAt: ts("trial_ends_at"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("saas_subscriptions_org_uq").on(t.orgId)],
);

/* ------------------------------------------------------------------ */
/* Schedule, bookings, attendance                                      */
/* ------------------------------------------------------------------ */

export const classes = sqliteTable(
  "classes",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => gymLocations.id),
    name: text("name").notNull(),
    discipline: text("discipline").notNull().default("MMA"),
    description: text("description"),
    coachMemberId: text("coach_member_id").references(() => orgMembers.id),
    capacity: integer("capacity").notNull().default(20),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    level: text("level", { enum: ["all", "beginner", "intermediate", "advanced", "kids"] })
      .notNull()
      .default("all"),
    eligiblePlanIds: text("eligible_plan_ids"),
    bookingWindowDays: integer("booking_window_days").notNull().default(14),
    cancellationWindowHours: integer("cancellation_window_hours").notNull().default(4),
    recurrence: text("recurrence"), // JSON { days:[1,3], time:"18:00" }
    color: text("color").notNull().default("#B8F36B"),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("classes_org_idx").on(t.orgId)],
);

export const classSessions = sqliteTable(
  "class_sessions",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    classId: text("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => gymLocations.id),
    coachMemberId: text("coach_member_id").references(() => orgMembers.id),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    capacity: integer("capacity").notNull().default(20),
    status: text("status", { enum: ["scheduled", "cancelled", "completed"] })
      .notNull()
      .default("scheduled"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("class_sessions_org_starts_idx").on(t.orgId, t.startsAt),
    uniqueIndex("class_sessions_class_start_uq").on(t.classId, t.startsAt),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["booked", "waitlisted", "cancelled", "attended", "no_show", "late_cancelled"],
    })
      .notNull()
      .default("booked"),
    position: integer("position"),
    bookedAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    cancelledAt: ts("cancelled_at"),
    checkedInAt: ts("checked_in_at"),
    checkInMethod: text("check_in_method", { enum: ["self", "qr", "staff", "coach"] }),
    source: text("source").notNull().default("app"),
  },
  (t) => [
    uniqueIndex("bookings_session_member_uq").on(t.sessionId, t.memberId),
    index("bookings_member_idx").on(t.memberId),
    index("bookings_org_idx").on(t.orgId),
  ],
);

export const attendance = sqliteTable(
  "attendance",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => classSessions.id),
    method: text("method", { enum: ["self", "qr", "staff", "coach"] }).notNull().default("self"),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    checkedInById: text("checked_in_by_id"),
    /** Anti-replay: one attendance per member per session, or a unique scan nonce. */
    nonce: text("nonce"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attendance_session_member_uq").on(t.sessionId, t.memberId),
    uniqueIndex("attendance_nonce_uq").on(t.nonce),
    index("attendance_org_time_idx").on(t.orgId, t.checkedInAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Training, programs, goals                                           */
/* ------------------------------------------------------------------ */

export const trainingSessions = sqliteTable(
  "training_sessions",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    intensity: text("intensity", { enum: ["light", "moderate", "hard", "max"] }).notNull().default("moderate"),
    rpe: integer("rpe"),
    notes: text("notes"),
    exercises: text("exercises"), // JSON
    classSessionId: text("class_session_id"),
    createdAt: createdAt(),
  },
  (t) => [index("training_sessions_member_date_idx").on(t.memberId, t.date)],
);

export const workoutLogs = sqliteTable("workout_logs", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  trainingSessionId: text("training_session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  exercise: text("exercise").notNull(),
  sets: integer("sets"),
  reps: integer("reps"),
  weightKg: real("weight_kg"),
  restSeconds: integer("rest_seconds"),
  rpe: integer("rpe"),
  isPersonalRecord: bool("is_personal_record"),
  createdAt: createdAt(),
});

export const trainingPrograms = sqliteTable("training_programs", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  coachMemberId: text("coach_member_id").notNull().references(() => orgMembers.id),
  title: text("title").notNull(),
  description: text("description"),
  discipline: text("discipline"),
  weeks: integer("weeks").notNull().default(4),
  sessionsPerWeek: integer("sessions_per_week").notNull().default(3),
  plan: text("plan"), // JSON day-by-day
  isTemplate: bool("is_template"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const programAssignments = sqliteTable("program_assignments", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => trainingPrograms.id, { onDelete: "cascade" }),
  fighterMemberId: text("fighter_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
  assignedById: text("assigned_by_id"),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  progressPct: integer("progress_pct").notNull().default(0),
  dueAt: ts("due_at"),
  createdAt: createdAt(),
});

export const fighterGoals = sqliteTable("fighter_goals", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  target: text("target"),
  progress: integer("progress").notNull().default(0),
  dueDate: ts("due_date"),
  status: text("status", { enum: ["open", "done", "abandoned"] }).notNull().default("open"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Fight camps, records, readiness                                     */
/* ------------------------------------------------------------------ */

export const fightCamps = sqliteTable(
  "fight_camps",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fighterMemberId: text("fighter_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    coachMemberId: text("coach_member_id").references(() => orgMembers.id),
    title: text("title").notNull(),
    opponent: text("opponent"),
    eventName: text("event_name"),
    fightDate: integer("fight_date", { mode: "timestamp_ms" }).notNull(),
    weightClass: text("weight_class"),
    campStart: integer("camp_start", { mode: "timestamp_ms" }).notNull(),
    phases: text("phases"), // JSON
    weeklyTargets: text("weekly_targets"), // JSON
    checklist: text("checklist"), // JSON
    coachNotes: text("coach_notes"),
    status: text("status", { enum: ["draft", "active", "completed", "cancelled"] })
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("fight_camps_fighter_idx").on(t.fighterMemberId)],
);

export const fightRecords = sqliteTable(
  "fight_records",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fighterMemberId: text("fighter_member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    result: text("result", { enum: ["win", "loss", "draw", "no_contest"] }).notNull(),
    method: text("method"), // KO, TKO, Submission, Decision, ...
    opponent: text("opponent").notNull(),
    eventName: text("event_name"),
    fightDate: integer("fight_date", { mode: "timestamp_ms" }).notNull(),
    weightClass: text("weight_class"),
    rounds: integer("rounds"),
    roundEnded: integer("round_ended"),
    level: text("level", { enum: ["amateur", "professional"] }).notNull().default("amateur"),
    verified: bool("verified"),
    verifiedById: text("verified_by_id"),
    verifiedAt: ts("verified_at"),
    notes: text("notes"),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("fight_records_fighter_idx").on(t.fighterMemberId)],
);

export const readinessCheckins = sqliteTable(
  "readiness_checkins",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    campId: text("camp_id").references(() => fightCamps.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => orgMembers.id, { onDelete: "cascade" }),
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    sleep: integer("sleep"),
    soreness: integer("soreness"),
    energy: integer("energy"),
    mood: integer("mood"),
    weightKg: real("weight_kg"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("readiness_member_idx").on(t.memberId)],
);

/* ------------------------------------------------------------------ */
/* Communication & notifications                                       */
/* ------------------------------------------------------------------ */

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    dedupeKey: text("dedupe_key"),
    emailStatus: text("email_status", { enum: ["pending", "sent", "skipped", "failed"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
  ],
);

export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    classReminders: bool("class_reminders", true),
    membershipReminders: bool("membership_reminders", true),
    paymentNotifications: bool("payment_notifications", true),
    fightCampReminders: bool("fight_camp_reminders", true),
    announcements: bool("announcements", true),
    productUpdates: bool("product_updates"),
    emailEnabled: bool("email_enabled", true),
    updatedAt: updatedAt(),
  },
);

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_pair_idx").on(t.senderId, t.recipientId)],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: text("audience", { enum: ["all", "fighters", "coaches", "staff"] }).notNull().default("all"),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_org_idx").on(t.orgId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Compliance, documents, audit, platform ops                          */
/* ------------------------------------------------------------------ */

export const documents = sqliteTable("documents", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => orgMembers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("document"),
  url: text("url"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  signedAt: ts("signed_at"),
  uploadedById: text("uploaded_by_id"),
  createdAt: createdAt(),
});

export const consents = sqliteTable("consents", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // terms, privacy, photo, guardian, marketing
  granted: bool("granted"),
  version: text("version").notNull().default("1.0"),
  grantedAt: ts("granted_at"),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    orgId: text("org_id"),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: text("outcome", { enum: ["success", "failure", "denied"] }).notNull().default("success"),
    meta: text("meta"),
    ip: text("ip"),
    prevHash: text("prev_hash"),
    hash: text("hash"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_org_idx").on(t.orgId)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["manager", "coach", "fighter"] }).notNull(),
    token: text("token").notNull(),
    invitedById: text("invited_by_id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invitations_token_uq").on(t.token), index("invitations_org_idx").on(t.orgId)],
);

export const featureFlags = sqliteTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: bool("enabled", true),
    orgIds: text("org_ids"), // JSON allow-list; null = all organizations
    updatedAt: updatedAt(),
  },
);

export const supportTickets = sqliteTable("support_tickets", {
  id: id(),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["open", "pending", "resolved", "closed"] }).notNull().default("open"),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  response: text("response"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

/** Outbox for transactional email in local/dev and audit of what was sent. */
export const emailOutbox = sqliteTable("email_outbox", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  template: text("template"),
  status: text("status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
  error: text("error"),
  sentAt: ts("sent_at"),
  createdAt: createdAt(),
});

export const dataRequests = sqliteTable("data_requests", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["export", "deletion"] }).notNull(),
  status: text("status", { enum: ["pending", "completed", "rejected"] }).notNull().default("pending"),
  handledById: text("handled_by_id"),
  notes: text("notes"),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(),
    result: text("result"),
    createdAt: createdAt(),
  },
  (t) => [index("idempotency_scope_idx").on(t.scope)],
);

export const schemaMeta = sqliteTable(
  "schema_meta",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index("schema_meta_idx").on(t.key)],
);

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrgMember = typeof orgMembers.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type FightCamp = typeof fightCamps.$inferSelect;
export type FightRecord = typeof fightRecords.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export const nowSql = sql`(unixepoch() * 1000)`;

import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
  code: z.string().trim().optional().nullable(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  password: passwordSchema,
  createGym: z.boolean().optional(),
  gymName: z.string().trim().max(120).optional(),
});

export const memberSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.enum(["fighter", "coach", "manager"]).default("fighter"),
  planId: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  sendInvite: z.coerce.boolean().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const planSchema = z.object({
  name: z.string().trim().min(2, "Plan name is required").max(80),
  description: z.string().max(400).optional().or(z.literal("")),
  category: z.enum(["unlimited", "limited", "program", "pass", "trial", "team", "kids", "annual"]),
  price: z.coerce.number().min(0, "Price cannot be negative").max(100000),
  signupFee: z.coerce.number().min(0).max(100000).optional(),
  interval: z.enum(["month", "year", "week", "one_time"]),
  currency: z.string().length(3).default("SEK"),
  classLimitPerWeek: z.coerce.number().int().min(0).max(50).optional(),
  creditCount: z.coerce.number().int().min(0).max(500).optional(),
  trialDays: z.coerce.number().int().min(0).max(90).optional(),
  minCommitmentMonths: z.coerce.number().int().min(0).max(36).optional(),
  noticePeriodDays: z.coerce.number().int().min(0).max(180).optional(),
  freezeAllowed: z.coerce.boolean().optional(),
  freezeMaxDays: z.coerce.number().int().min(0).max(365).optional(),
  autoRenew: z.coerce.boolean().optional(),
  familyDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  studentDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  allowedDisciplines: z.string().optional().or(z.literal("")),
  terms: z.string().max(4000).optional().or(z.literal("")),
  cancellationPolicy: z.string().max(2000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
});

export const classSchema = z.object({
  name: z.string().trim().min(2, "Class name is required").max(80),
  discipline: z.string().trim().min(2).max(60),
  level: z.enum(["all", "beginner", "intermediate", "advanced", "kids"]),
  coachMemberId: z.string().optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(200),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  days: z.string().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional(),
  bookingWindowDays: z.coerce.number().int().min(0).max(60).optional(),
  cancellationWindowHours: z.coerce.number().int().min(0).max(72).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
});

export const trainingSchema = z.object({
  type: z.string().min(1).max(60),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  intensity: z.enum(["light", "moderate", "hard", "max"]),
  date: z.string().optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
  rpe: z.coerce.number().int().min(1).max(10).optional(),
});

export const fightCampSchema = z.object({
  fighterMemberId: z.string().min(1, "Choose a fighter"),
  opponent: z.string().max(120).optional().or(z.literal("")),
  eventName: z.string().max(160).optional().or(z.literal("")),
  fightDate: z.string().min(1, "Fight date is required"),
  weightClass: z.string().max(60).optional().or(z.literal("")),
  campStart: z.string().optional(),
  coachNotes: z.string().max(2000).optional().or(z.literal("")),
});

export const fightRecordSchema = z.object({
  result: z.enum(["win", "loss", "draw", "no_contest"]),
  method: z.string().max(60).optional().or(z.literal("")),
  opponent: z.string().min(1, "Opponent is required").max(120),
  eventName: z.string().max(160).optional().or(z.literal("")),
  fightDate: z.string().min(1, "Date is required"),
  weightClass: z.string().max(60).optional().or(z.literal("")),
  level: z.enum(["amateur", "professional"]),
  rounds: z.coerce.number().int().min(1).max(10).optional(),
  roundEnded: z.coerce.number().int().min(1).max(10).optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      raw[k] = [...((raw[k] as string[]) ?? []), String(value)];
    } else if (typeof value === "string") {
      raw[key] = value;
    }
  }
  // checkboxes: absent means false for known boolean fields
  for (const key of ["freezeAllowed", "autoRenew", "isActive", "sendInvite", "createGym", "notifyEmail"]) {
    raw[key] = raw[key] === "on" || raw[key] === "true" || raw[key] === "1";
  }
  return schema.safeParse(raw);
}

export function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Invalid input";
}

"use server";

import crypto from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  gymLocations,
  loginAttempts,
  orgMembers,
  organizations,
  passwordResets,
  saasPlans,
  saasSubscriptions,
  users,
} from "@/db/schema";
import { audit, securityEvent } from "@/lib/audit";
import { ensureDevAdmin } from "@/lib/bootstrap";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { verifyTotp } from "@/lib/totp";
import { slugify } from "@/lib/utils";
import { firstError, loginSchema, registerSchema } from "@/lib/validation";
import { createSession, destroySession, getSession, hashToken, newToken, requestMeta, resolveToken } from "@/lib/session";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export type AuthFormState = { error?: string; ok?: string; needsMfa?: boolean } | null;

const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    code: formData.get("code") ?? undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { email, password, code } = parsed.data;
  const adminOnly = formData.get("adminOnly") === "true";
  const next = String(formData.get("next") ?? "");
  const { ip, userAgent } = await requestMeta();

  const key = `login:${ip ?? "unknown"}:${email}`;
  const limit = rateLimit(key, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    await securityEvent({ type: "login.rate_limited", detail: email, ip, userAgent });
    return { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  }

  // Explicitly restricted development bootstrap account (admin/admin).
  if (env.isDev && !env.isProd && email === "admin" && password === "admin") {
    await ensureDevAdmin();
  }

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = found[0];

  // Dev convenience: allow username "admin" to resolve to the bootstrap email.
  if (!user && env.isDev && email === env.bootstrap.username) {
    const admin = await db.select().from(users).where(eq(users.email, env.bootstrap.email)).limit(1);
    user = admin[0];
  }

  const genericError = "Email or password is incorrect";
  if (!user) {
    await db.insert(loginAttempts).values({ identifier: email, success: false, ip });
    await securityEvent({ type: "login.failed", detail: email, ip, userAgent });
    return { error: genericError };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Account temporarily locked after too many failed attempts. Try again later." };
  }
  if (user.status !== "active") {
    return { error: "This account is suspended. Contact support." };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const count = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: count,
        lockedUntil: count >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null,
      })
      .where(eq(users.id, user.id));
    await db.insert(loginAttempts).values({ identifier: email, success: false, ip });
    await securityEvent({ userId: user.id, type: "login.failed", detail: email, ip, userAgent });
    return { error: genericError };
  }

  if (user.mfaEnabled) {
    if (!code) return { error: "Enter your 6-digit authenticator code to continue.", needsMfa: true };
    const ok = verifyTotp(user.mfaSecret ?? "", code);
    if (!ok) {
      await securityEvent({ userId: user.id, type: "login.mfa_failed", ip, userAgent });
      return { error: "That authenticator code is not valid.", needsMfa: true };
    }
  }

  if (adminOnly && !user.isSuperAdmin) {
    await securityEvent({ userId: user.id, type: "login.admin_denied", ip, userAgent });
    return { error: "This account does not have platform administrator access." };
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await db.insert(loginAttempts).values({ identifier: email, success: true, ip });
  resetRateLimit(key);
  await createSession(user.id);
  await securityEvent({ userId: user.id, type: "login.success", ip, userAgent });
  await audit({
    actor: { id: user.id, name: user.name, role: user.isSuperAdmin ? "super_admin" : "user" },
    action: adminOnly ? "auth.admin_login" : "auth.login",
    targetType: "user",
    targetId: user.id,
  });

  if (user.mustChangePassword) redirect("/settings/security?ok=Please+set+a+new+password");

  let destination = "/app";
  if (user.isSuperAdmin && (adminOnly || !next)) destination = "/admin";
  if (!user.isSuperAdmin) {
    const staff = await db
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, user.id), sql`${orgMembers.role} in ('owner','manager','coach')`))
      .limit(1);
    destination = staff[0] ? "/gym" : "/app";
  }
  if (next && next.startsWith("/") && !next.startsWith("//")) destination = next;
  if (user.isSuperAdmin && adminOnly) destination = "/admin";
  redirect(destination);
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    createGym: formData.get("createGym") === "on",
    gymName: formData.get("gymName") ?? undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { name, email, password, createGym, gymName } = parsed.data;

  const limit = rateLimit(`register:${email}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Too many sign-up attempts. Try again later." };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { error: "An account with this email already exists. Try signing in." };

  const passwordHash = await hashPassword(password);
  const created = await db
    .insert(users)
    .values({ email, name, passwordHash, termsAcceptedAt: new Date() })
    .returning();
  const user = created[0];
  await securityEvent({ userId: user.id, type: "account.created" });
  await audit({ actor: { id: user.id, name }, action: "auth.register", targetType: "user", targetId: user.id });
  await createSession(user.id);

  if (createGym && gymName) {
    const base = slugify(gymName);
    const slug = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    const org = (
      await db
        .insert(organizations)
        .values({
          name: gymName,
          slug,
          ownerId: user.id,
          contactEmail: email,
          currency: "SEK",
          country: "SE",
        })
        .returning()
    )[0];
    await db.insert(gymLocations).values({ orgId: org.id, name: "Main location", city: "", isPrimary: true });
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: user.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    const starter = await db.select().from(saasPlans).where(eq(saasPlans.slug, "starter")).limit(1);
    if (starter[0]) {
      await db.insert(saasSubscriptions).values({
        orgId: org.id,
        planId: starter[0].id,
        status: "trialing",
        provider: "sandbox",
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
      });
    }
    await audit({
      orgId: org.id,
      actor: { id: user.id, name, role: "owner" },
      action: "gym.created",
      targetType: "organization",
      targetId: org.id,
    });
    redirect("/gym/onboarding");
  }

  redirect("/app/onboarding");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    await audit({
      actor: { id: session.user.id, name: session.user.name },
      action: "auth.logout",
      targetType: "user",
      targetId: session.user.id,
    });
  }
  await destroySession();
  redirect("/login?info=You+are+signed+out");
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address" };
  const limit = rateLimit(`reset:${email}`, 4, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Too many requests. Try again in an hour." };

  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  // Always return the same message to avoid account enumeration.
  if (user) {
    const token = newToken();
    await db.insert(passwordResets).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await sendEmail({
      to: user.email,
      subject: "Reset your MMA OS password",
      body: `Hi ${user.name},\n\nReset your password within 60 minutes:\n${env.appUrl}/reset-password/${token}\n\nIf you didn't request this, ignore this email.`,
      template: "password_reset",
    });
    await securityEvent({ userId: user.id, type: "password.reset_requested" });
  }
  return { ok: "If that email is registered, a reset link is on its way." };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };

  const row = (
    await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, hashToken(token)), gte(passwordResets.expiresAt, new Date())))
      .limit(1)
  )[0];
  if (!row || row.usedAt) return { error: "This reset link is invalid or has expired. Request a new one." };

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, row.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
  await securityEvent({ userId: row.userId, type: "password.reset_completed" });
  await audit({ actor: { id: row.userId, name: "self" }, action: "auth.password_reset", targetType: "user", targetId: row.userId });
  redirect("/login?ok=Password+updated.+Sign+in+with+your+new+password");
}

export async function changePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again" };
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassword(session.user.passwordHash, current))) return { error: "Current password is incorrect" };
  if (password.length < 8) return { error: "New password must be at least 8 characters" };
  if (env.isProd && !/[A-Z]/.test(password)) return { error: "Use at least one uppercase letter" };
  if (password !== confirm) return { error: "New passwords do not match" };
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, session.user.id));
  await securityEvent({ userId: session.user.id, type: "password.changed" });
  await audit({ actor: { id: session.user.id, name: session.user.name }, action: "auth.password_changed", targetType: "user", targetId: session.user.id });
  revalidatePath("/settings/security");
  return { ok: "Password updated." };
}

export async function enableMfaAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again" };
  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!verifyTotp(secret, code)) return { error: "That code is not valid. Check your authenticator app and try again." };
  await db.update(users).set({ mfaEnabled: true, mfaSecret: secret }).where(eq(users.id, session.user.id));
  await securityEvent({ userId: session.user.id, type: "mfa.enabled" });
  await audit({ actor: { id: session.user.id, name: session.user.name }, action: "security.mfa_enabled", targetType: "user", targetId: session.user.id });
  revalidatePath("/settings/security");
  return { ok: "Two-factor authentication is on." };
}

export async function disableMfaAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in again" };
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(session.user.passwordHash, password))) return { error: "Password is incorrect" };
  await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, session.user.id));
  await securityEvent({ userId: session.user.id, type: "mfa.disabled" });
  revalidatePath("/settings/security");
  return { ok: "Two-factor authentication is off." };
}

/** Used by /api/auth/session checks in tests. */
export async function currentSession(token: string) {
  return resolveToken(token);
}

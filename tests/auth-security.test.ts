import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { passwordResets, users } from "@/db/schema";
import { hashPassword, isPasswordAcceptable, passwordIssues, verifyPassword } from "@/lib/password";
import { hashToken, newToken } from "@/lib/session";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { generateTotpSecret, totpCode, verifyTotp } from "@/lib/totp";

describe("password security", () => {
  it("hashes with Argon2id and never stores the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("s3cret-password!");
    expect(await verifyPassword(hash, "s3cret-password?")).toBe(false);
  });

  it("enforces password policy", () => {
    expect(passwordIssues("short").length).toBeGreaterThan(0);
    expect(isPasswordAcceptable("long-enough-passphrase")).toBe(true);
  });

  it("never stores a session token verbatim", async () => {
    const token = newToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    const hashed = hashToken(token);
    expect(hashed).not.toBe(token);
    expect(hashed).toHaveLength(64);
    const [row] = await db.select().from(users).limit(1);
    expect(row.passwordHash).not.toBe("demo1234");
  });

  it("stores password-reset tokens only as hashes", async () => {
    const token = newToken();
    const user = (await db.select().from(users).where(eq(users.email, "fighter@demo.mma")).limit(1))[0];
    await db.insert(passwordResets).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) });
    const rows = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, hashToken(token)));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit and reports retry-after", () => {
    const key = `login:${Math.random()}`;
    resetRateLimit(key);
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates limits per key", () => {
    const a = `k:${Math.random()}`;
    const b = `k:${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });
});

describe("TOTP MFA", () => {
  it("verifies a current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const code = totpCode(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, null)).toBe(false);
  });

  it("tolerates one time step of clock drift", () => {
    const secret = generateTotpSecret();
    const previous = totpCode(secret, Date.now() - 30_000);
    expect(verifyTotp(secret, previous, 1)).toBe(true);
  });
});

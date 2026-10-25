import { hash, verify } from "@node-rs/argon2";
import { env } from "./env";

// Argon2id parameters (OWASP-ish baseline for 2025: 19 MiB, t=2, p=1).
const ARGON_OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  const min = env.isProd ? 12 : 8;
  if (password.length < min) issues.push(`At least ${min} characters`);
  if (env.isProd) {
    if (!/[A-Z]/.test(password)) issues.push("One uppercase letter");
    if (!/[a-z]/.test(password)) issues.push("One lowercase letter");
    if (!/[0-9]/.test(password)) issues.push("One number");
  }
  return issues;
}

export function isPasswordAcceptable(password: string): boolean {
  return passwordIssues(password).length === 0;
}

/**
 * Development bootstrap credential (admin/admin). Refused outside development.
 */
export function allowDevBootstrapPassword(password: string): boolean {
  return env.isDev && !env.isProd && password === "admin";
}

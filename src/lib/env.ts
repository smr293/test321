/**
 * Central environment / configuration access with production safety checks.
 */
const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  isDev: nodeEnv !== "production",
  isTest: nodeEnv === "test" || process.env.MMA_TEST === "1",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  authSecret: process.env.AUTH_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/mma.db",
  bootstrap: {
    enabled:
      (process.env.BOOTSTRAP_ADMIN_ENABLED ?? String(nodeEnv !== "production")) === "true",
    username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin",
    email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@mmaos.local",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
    forcePasswordChange: (process.env.FORCE_ADMIN_PASSWORD_CHANGE ?? String(nodeEnv === "production")) === "true",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    prices: {
      starter: process.env.STRIPE_PRICE_STARTER ?? "",
      pro: process.env.STRIPE_PRICE_PRO ?? "",
      elite: process.env.STRIPE_PRICE_ELITE ?? "",
    },
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "MMA OS <no-reply@mmaos.local>",
  },
  retentionDays: Number(process.env.DATA_RETENTION_DAYS ?? 730),
};

/** Called lazily by auth code — throws in production when misconfigured. */
export function assertSecureConfig() {
  if (!env.isProd) return;
  const problems: string[] = [];
  if (!env.authSecret || env.authSecret.length < 32)
    problems.push("AUTH_SECRET must be at least 32 characters in production");
  if (env.bootstrap.enabled && env.bootstrap.password.length < 12)
    problems.push("BOOTSTRAP_ADMIN_PASSWORD must be a strong (12+ char) secret in production");
  if (problems.length) {
    // Fail closed: never boot production with weak secrets.
    throw new Error(`Insecure configuration: ${problems.join("; ")}`);
  }
}

export const SESSION_COOKIE = "mma_session";
export const ORG_COOKIE = "mma_org";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
export const SESSION_IDLE_MS = 1000 * 60 * 60 * 12; // 12h inactivity

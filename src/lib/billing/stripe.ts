/**
 * Minimal Stripe REST client (no SDK) for subscription + invoice flows.
 * Only used when STRIPE_SECRET_KEY is configured; otherwise the app runs on
 * the explicitly-labelled sandbox provider.
 */
import crypto from "node:crypto";
import { env } from "../env";

const API = "https://api.stripe.com/v1";

export function stripeEnabled() {
  return Boolean(env.stripe.secretKey);
}

async function stripeRequest<T>(path: string, body?: Record<string, string | number | undefined>, method = "POST"): Promise<T> {
  if (!stripeEnabled()) throw new Error("Stripe is not configured");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body ?? {})) {
    if (v !== undefined) params.append(k, String(v));
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.stripe.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stable idempotency for provider-side retries.
      "Idempotency-Key": body?.idempotency_key ? String(body.idempotency_key) : crypto.randomUUID(),
    },
    body: method === "GET" ? undefined : params,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error ${res.status}: ${json?.error?.message ?? "unknown"}`);
  return json as T;
}

export type StripeCheckoutSession = { id: string; url: string };

export async function createCheckoutSession(input: {
  priceId: string;
  mode: "subscription" | "payment";
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata?: Record<string, string>;
}) {
  const body: Record<string, string | number | undefined> = {
    mode: input.mode,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    "metadata[reference]": input.clientReferenceId,
  };
  for (const [k, v] of Object.entries(input.metadata ?? {})) body[`metadata[${k}]`] = v;
  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", body);
}

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  return stripeRequest<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

export async function createStripeCustomer(input: { email: string; name: string; orgId?: string }) {
  return stripeRequest<{ id: string }>("/customers", {
    email: input.email,
    name: input.name,
    "metadata[org_id]": input.orgId,
  });
}

export async function refundStripePayment(paymentIntentId: string, amountCents?: number) {
  return stripeRequest<{ id: string; status: string }>("/refunds", {
    payment_intent: paymentIntentId,
    amount: amountCents,
  });
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                      */
/* ------------------------------------------------------------------ */

export type VerifiedEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string, toleranceSec = 300) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split("=");
    if (!k || !v) return acc;
    acc[k] = [...(acc[k] ?? []), v];
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  if (!timestamp) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const candidates = parts.v1 ?? [];
  return candidates.some((sig) => {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

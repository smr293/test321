import { handleStripeWebhook } from "@/lib/billing/webhooks";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. Must read the raw body — never parse it before
 * signature verification. Side effects are idempotent per event id.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  const result = await handleStripeWebhook(raw, signature);
  return Response.json(
    { received: result.ok, handled: result.handled ?? null, duplicate: result.duplicate ?? false, message: result.message ?? null },
    { status: result.status ?? (result.ok ? 200 : 400) },
  );
}

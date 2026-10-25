import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { emailOutbox } from "@/db/schema";
import { env } from "./env";

/**
 * Sends transactional email. With RESEND_API_KEY the message is delivered via
 * the Resend HTTP API; otherwise it is persisted in the outbox and logged so
 * local development stays fully functional without external services.
 */
export async function sendEmail(input: { to: string; subject: string; body: string; template?: string }) {
  const row = await db
    .insert(emailOutbox)
    .values({ to: input.to, subject: input.subject, body: input.body, template: input.template ?? null })
    .returning();
  const message = row[0];
  if (!env.email.resendApiKey) {
    console.info(`[email:outbox] → ${input.to} :: ${input.subject}`);
    return { id: message.id, delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.email.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.email.from,
        to: [input.to],
        subject: input.subject,
        text: input.body,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: new Date() })
      .where(eqId(message.id));
    return { id: message.id, delivered: true };
  } catch (error) {
    await db
      .update(emailOutbox)
      .set({ status: "failed", error: (error as Error).message })
      .where(eqId(message.id));
    return { id: message.id, delivered: false, error: (error as Error).message };
  }
}

function eqId(id: string) {
  return eq(emailOutbox.id, id);
}

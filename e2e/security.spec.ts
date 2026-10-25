import { expect, test } from "@playwright/test";
import { DEMO, login } from "./helpers";

test.describe("security", () => {
  test("session cookie is httpOnly and sameSite=lax", async ({ page, context }) => {
    await login(page, DEMO.owner);
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "mma_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
  });

  test("tenant data is not reachable by guessing another gym's member id", async ({ page }) => {
    await login(page, DEMO.owner);
    // Seeded Southside member id is not disclosed to Nordic staff; a random id must 404.
    const response = await page.goto("/gym/members/00000000-0000-0000-0000-000000000000");
    expect(response?.status()).toBe(404);
  });

  test("cross-tenant member access is denied", async ({ page }) => {
    await login(page, DEMO.owner);
    const response = await page.goto("/gym/members/00000000-0000-0000-0000-000000000001");
    expect([403, 404]).toContain(response?.status());
  });

  test("security headers are present", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response?.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response?.headers()["referrer-policy"]).toContain("strict-origin");
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  });

  test("stripe webhook rejects unsigned requests", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", { data: { id: "evt_test", type: "invoice.paid" } });
    expect([400, 503]).toContain(response.status());
  });

  test("cron endpoint requires a bearer token", async ({ request }) => {
    const response = await request.post("/api/cron/maintenance");
    expect([401, 503]).toContain(response.status());
  });
});

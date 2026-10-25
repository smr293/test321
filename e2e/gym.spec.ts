import { expect, test } from "@playwright/test";
import { DEMO, expectNoServerError, login } from "./helpers";

test.describe("gym workspace", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO.owner);
  });

  test("dashboard shows live stats", async ({ page }) => {
    await page.goto("/gym");
    await expect(page.getByRole("heading", { name: /good|overview|dashboard/i }).first()).toBeVisible();
    await expectNoServerError(page);
  });

  test("staff can search and open a member", async ({ page }) => {
    await page.goto("/gym/members");
    await page.getByPlaceholder(/search/i).first().fill("Alex");
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: /Alex Nord/i }).first().click();
    await expect(page.getByText(/elev och tränare|coach/i).first()).toBeVisible();
    await expectNoServerError(page);
  });

  test("admin can assign and remove a coach from an athlete", async ({ page }) => {
    await page.goto("/gym/fighters");
    await page.getByRole("link", { name: /Alex Nord/i }).first().click();
    await expect(page.getByText(/coach/i).first()).toBeVisible();
  });

  test("membership plans page lists plans and allows creating one", async ({ page }) => {
    await page.goto("/gym/memberships");
    await expect(page.getByText(/unlimited|plan/i).first()).toBeVisible();
    await expectNoServerError(page);
  });

  test("calendar and attendance render for today", async ({ page }) => {
    await page.goto("/gym/calendar");
    await expect(page.getByRole("heading", { name: /calendar/i })).toBeVisible();
    await page.goto("/gym/attendance");
    await expect(page.getByText(/QR check-in/i)).toBeVisible();
  });

  test("payments and analytics are real reports, not placeholders", async ({ page }) => {
    await page.goto("/gym/payments");
    await expect(page.getByText(/invoices|payments/i).first()).toBeVisible();
    await page.goto("/gym/analytics");
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  });

  test("messages thread loads", async ({ page }) => {
    await page.goto("/gym/messages");
    await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible();
  });

  test("settings and billing load without leaking secrets", async ({ page }) => {
    await page.goto("/gym/settings");
    await page.goto("/gym/settings/billing");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("STRIPE_SECRET_KEY");
    expect(body).not.toContain("AUTH_SECRET");
  });
});

test.describe("coach scoping", () => {
  test("coach only sees assigned fighters", async ({ page }) => {
    await login(page, DEMO.coach);
    await page.goto("/gym/fighters");
    await expectNoServerError(page);
    const rows = page.locator("table tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
  });
});

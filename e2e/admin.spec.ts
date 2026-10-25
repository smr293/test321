import { expect, test } from "@playwright/test";
import { DEMO, expectNoServerError } from "./helpers";

async function adminLogin(page: Parameters<typeof expectNoServerError>[0]) {
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill(DEMO.admin.email);
  await page.getByLabel(/password/i).fill(DEMO.admin.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("super admin", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page);
  });

  test("overview shows MRR, gyms and users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("MRR").first()).toBeVisible();
    await expect(page.getByText("Gyms").first()).toBeVisible();
    await expectNoServerError(page);
  });

  test("gyms list and detail expose subscription controls", async ({ page }) => {
    await page.goto("/admin/orgs");
    await page.getByRole("link", { name: /Nordic Fight Lab/i }).first().click();
    await expect(page.getByText(/subscription/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save subscription/i })).toBeVisible();
  });

  test("suspend and reactivate a gym", async ({ page }) => {
    await page.goto("/admin/orgs");
    await page.getByRole("link", { name: /Southside MMA/i }).first().click();
    await page.getByRole("button", { name: /suspend gym/i }).first().click();
    await page.getByRole("dialog").getByRole("textbox").fill("E2E test suspension");
    await page.getByRole("dialog").getByRole("button", { name: /suspend gym/i }).click();
    await expect(page.getByText(/gym is suspended/i)).toBeVisible();
    await page.getByRole("button", { name: /reactivate gym/i }).click();
    await expect(page.getByText(/gym is suspended/i)).toHaveCount(0);
  });

  test("audit chain verifies", async ({ page }) => {
    await page.goto("/admin/audit");
    await page.getByRole("button", { name: /verify chain/i }).click();
    await expect(page.getByText(/chain verified/i)).toBeVisible();
  });

  test("plans, flags, settings and inboxes render", async ({ page }) => {
    for (const path of ["/admin/plans", "/admin/flags", "/admin/settings", "/admin/tickets", "/admin/data-requests", "/admin/email", "/admin/revenue", "/admin/users"]) {
      await page.goto(path);
      await expectNoServerError(page);
    }
  });

  test("support reply notifies the member", async ({ page }) => {
    await page.goto("/admin/tickets");
    await page.getByRole("link", { name: /invoice reminder/i }).first().click();
    await page.getByRole("textbox").last().fill("Checked — reminders are enabled and the next batch sends at 08:00.");
    await page.getByRole("button", { name: /save & notify/i }).click();
    await expect(page.getByText(/reply sent|ticket updated/i)).toBeVisible();
  });
});

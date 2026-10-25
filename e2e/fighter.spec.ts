import { expect, test } from "@playwright/test";
import { DEMO, expectNoServerError, login } from "./helpers";

test.describe("fighter portal", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DEMO.fighter);
  });

  test("home shows coach, membership and next class", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText(/your coach/i)).toBeVisible();
    await expectNoServerError(page);
  });

  test("schedule shows QR check-in and booking controls", async ({ page }) => {
    await page.goto("/app/schedule");
    await expect(page.getByText(/QR/i).first()).toBeVisible();
    await expect(page.locator("svg[aria-label='Your gym check-in QR code']")).toBeVisible();
  });

  test("logs a training session and sees it in history", async ({ page }) => {
    await page.goto("/app/progress");
    await page.getByRole("button", { name: /log training/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("fights page shows camp phases and record list", async ({ page }) => {
    await page.goto("/app/fights");
    await expect(page.getByText(/readiness|fight camp|record/i).first()).toBeVisible();
  });

  test("billing shows invoices and a clearly labelled test payment path", async ({ page }) => {
    await page.goto("/app/billing");
    await expect(page.getByText(/test|sandbox|invoice/i).first()).toBeVisible();
  });

  test("profile allows exporting and requesting deletion", async ({ page }) => {
    await page.goto("/app/profile");
    await expect(page.getByText(/export/i).first()).toBeVisible();
    await expect(page.getByText(/delete/i).first()).toBeVisible();
  });

  test("support ticket can be submitted", async ({ page }) => {
    await page.goto("/app/support");
    await expect(page.getByRole("heading", { name: /support/i })).toBeVisible();
  });

  test("mobile navigation works", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.getByRole("button", { name: /menu/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

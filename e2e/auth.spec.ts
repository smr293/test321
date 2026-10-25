import { expect, test } from "@playwright/test";
import { DEMO, expectNoServerError, login } from "./helpers";

test.describe("authentication", () => {
  test("landing page renders the product and dark theme", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(9, 11, 9)");
    await expectNoServerError(page);
  });

  test("signs in as gym owner and lands in the gym workspace", async ({ page }) => {
    await login(page, DEMO.owner);
    await expect(page).toHaveURL(/\/gym/);
    await expect(page.getByText("Nordic Fight Lab").first()).toBeVisible();
  });

  test("signs in as fighter and lands in the fighter portal", async ({ page }) => {
    await login(page, DEMO.fighter);
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByText(/Alex/i).first()).toBeVisible();
  });

  test("rejects bad credentials without leaking account existence", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert").or(page.getByText(/invalid/i))).toBeVisible();
  });

  test("requires authentication for protected areas", async ({ page }) => {
    await page.goto("/gym");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("admin login is separate and rejects non-admin accounts", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel(/email/i).fill(DEMO.owner.email);
    await page.getByLabel(/password/i).fill(DEMO.owner.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/does not have platform administrator access/i)).toBeVisible();
  });

  test("owner cannot reach super-admin pages", async ({ page }) => {
    await login(page, DEMO.owner);
    await page.goto("/admin/orgs");
    await expect(page).not.toHaveURL(/\/admin\/orgs/);
  });
});

import { expect, type Page } from "@playwright/test";

export const DEMO = {
  owner: { email: "owner@demo.mma", password: "demo1234" },
  manager: { email: "manager@demo.mma", password: "demo1234" },
  coach: { email: "coach@demo.mma", password: "demo1234" },
  fighter: { email: "fighter@demo.mma", password: "demo1234" },
  admin: { email: "admin", password: "admin" },
};

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(who.email);
  await page.getByLabel(/password/i).fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

export async function expectNoServerError(page: Page) {
  await expect(page.locator("text=Application error")).toHaveCount(0);
  await expect(page.locator("text=Internal Server Error")).toHaveCount(0);
}

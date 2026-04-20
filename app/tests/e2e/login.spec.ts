import { test, expect } from "@playwright/test";

test("shows login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Einsatzbericht PWA|PWA de informes/ })).toBeVisible();
  await expect(page.getByLabel(/E-Mail|Correo/)).toBeVisible();
});

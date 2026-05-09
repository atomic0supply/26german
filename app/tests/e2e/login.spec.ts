import { test, expect } from "@playwright/test";

test("shows login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Einsatzbericht PWA|PWA de informes/ })).toBeVisible();
  await expect(page.getByLabel(/E-Mail|Correo/)).toBeVisible();

  await page.getByRole("button", { name: "ES" }).click();
  await expect(page.getByLabel("Correo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Correo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();

  await page.getByRole("button", { name: "DE" }).click();
  await expect(page.getByLabel("E-Mail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
});

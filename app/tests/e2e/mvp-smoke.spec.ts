import { expect, test } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

const runAuthenticatedSmoke = Boolean(E2E_EMAIL && E2E_PASSWORD);

test.describe("mvp smoke", () => {
  test.skip(!runAuthenticatedSmoke, "Set E2E_EMAIL and E2E_PASSWORD to run the authenticated MVP smoke.");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("app-language", "es");
    });
  });

  test("login, create client, create report, sign and preview", async ({ page }) => {
    test.slow();

    const nonce = Date.now().toString().slice(-6);
    const clientName = `MVP${nonce}`;
    const clientSurname = `Cliente${nonce}`;
    const clientEmail = `mvp.${nonce}@example.com`;
    const clientLocation = `Calle Piloto ${nonce}, Madrid`;
    const projectNumber = `MVP-${nonce}`;

    await page.goto("/");

    await page.getByLabel("Correo").fill(E2E_EMAIL!);
    await page.getByLabel("Contraseña").fill(E2E_PASSWORD!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByRole("heading", { name: "Inicio operativo" })).toBeVisible();

    await page.getByRole("button", { name: /Clientes/ }).first().click();
    await expect(page.getByRole("heading", { name: "Nuevo cliente" })).toBeVisible();

    await page.getByLabel("Nombre").fill(clientName);
    await page.getByLabel("Apellido").fill(clientSurname);
    await page.getByLabel("Contacto principal").fill(`${clientName} Contacto`);
    await page.getByLabel("Correo").last().fill(clientEmail);
    await page.getByLabel("Teléfono").fill("+34 600 000 000");
    await page.getByLabel("Dirección / ubicación").fill(clientLocation);
    await page.getByRole("button", { name: "Crear cliente" }).click();

    await expect(page.getByText("Cliente creado.")).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(clientName) })).toBeVisible();

    await page.getByRole("button", { name: /Informes/ }).first().click();
    await expect(page.getByRole("heading", { name: "Nuevo informe" })).toBeVisible();

    await page.getByLabel("Empresa / logo").selectOption("svt");
    await page.getByRole("button", { name: "Crear informe" }).click();

    await expect(page.getByRole("heading", { name: /Nuevo informe|MVP-/ })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente paso" }).click();

    await page.getByLabel("Cliente").selectOption({
      label: `${clientName} ${clientSurname} · ${clientLocation} · ${clientEmail}`
    });
    await page.getByLabel("Ubicación / objeto").fill(`Inspeccion piloto ${nonce}`);
    await page.getByRole("button", { name: "Siguiente paso" }).click();

    await page.getByLabel("Número de proyecto").fill(projectNumber);
    await page.getByLabel("Fecha y hora").fill("2026-04-20T10:30");
    await page.getByLabel("Técnico").fill("Tecnico MVP");
    await page.getByLabel("Resultado / resumen").fill("Fuga localizada y documentada para smoke test.");
    await page.getByRole("button", { name: "Siguiente paso" }).click();

    await page.getByRole("button", { name: "Siguiente paso" }).click();

    await page.getByLabel("Nombre visible").fill("Tecnico MVP");
    const signatureCanvas = page.getByLabel("Campo de firma");
    const box = await signatureCanvas.boundingBox();
    if (!box) {
      throw new Error("Signature canvas is not visible");
    }
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 70, { steps: 8 });
    await page.mouse.move(box.x + 280, box.y + 110, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Guardar firma" }).click();
    await expect(page.getByText("Firma preparada")).toBeVisible();

    await page.getByRole("button", { name: "Siguiente paso" }).click();
    await page.getByRole("button", { name: "Generar preview PDF" }).click();

    await expect(page.locator("object.editor-pdf-frame")).toBeVisible({ timeout: 30_000 });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { setPdfJsLoaderForTests, suggestTemplateSchemaFromPdf } from "../src/schemaSuggestion";
import { TemplateVersion } from "../src/types";

const buildVersion = (fieldSchema: TemplateVersion["fieldSchema"] = []): Pick<TemplateVersion, "fieldSchema"> => ({
  fieldSchema
});

const installPdfJsMock = () => {
  setPdfJsLoaderForTests(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 595, height: 842 }),
          getTextContent: async () => ({
            items: [
              { str: "Projektnummer:", transform: [1, 0, 0, 1, 40, 780], width: 90, height: 12 },
              { str: "Telefon:", transform: [1, 0, 0, 1, 40, 740], width: 50, height: 12 },
              { str: "Unterschrift Techniker", transform: [1, 0, 0, 1, 40, 680], width: 140, height: 12 },
              { str: "Foto Schaden", transform: [1, 0, 0, 1, 40, 620], width: 80, height: 12 }
            ]
          })
        })
      })
    })
  }));
};

afterEach(() => {
  setPdfJsLoaderForTests(null);
});

describe("suggestTemplateSchemaFromPdf", () => {
  it("creates a usable draft schema from PDF text even without Gemini configured", async () => {
    installPdfJsMock();
    const result = await suggestTemplateSchemaFromPdf(new Uint8Array([1, 2, 3]), buildVersion(), true);

    expect(result.fieldSchema.length).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();
    expect(result.fieldSchema.some((field) => field.label.toLowerCase().includes("projektnummer"))).toBe(true);
    expect(result.fieldSchema.some((field) => field.type === "signature")).toBe(true);
    expect(result.fieldSchema.every((field) => /^[a-z0-9_]+$/.test(field.id))).toBe(true);
  });

  it("merges AI suggestions onto existing fields when overwriteExisting is false", async () => {
    installPdfJsMock();
    const result = await suggestTemplateSchemaFromPdf(
      new Uint8Array([1, 2, 3]),
      buildVersion([
        {
          id: "existing_manual",
          type: "text",
          source: "dynamic",
          label: "Existing Manual",
          page: 0,
          rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 },
          required: false,
          options: [],
          defaultValue: "",
          helpText: ""
        }
      ]),
      false
    );

    expect(result.schemaSource).toBe("mixed");
    expect(result.fieldSchema.some((field) => field.id === "existing_manual")).toBe(true);
    expect(result.fieldSchema.length).toBeGreaterThan(1);
  });
});

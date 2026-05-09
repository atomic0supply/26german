import type { Bucket } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { PDFCheckBox, PDFDocument } from "pdf-lib";
import { extractTemplateFieldSchema, fillDynamicReportPdfTemplate, fillReportPdfTemplate } from "../src/pdf";
import { REPORT_TEMPLATE } from "../src/templates";
import { ReportData, TemplateConfig, TemplateVersion } from "../src/types";

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgNf9oXkAAAAASUVORK5CYII=",
    "base64"
  )
);

const createTemplatePdf = async (): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const form = pdf.getForm();

  form.createTextField("project_number").addToPage(page, { x: 20, y: 780, width: 160, height: 20 });
  form.createTextField("summary").addToPage(page, { x: 20, y: 750, width: 350, height: 22 });
  form.createTextField("Sonstiges").addToPage(page, { x: 20, y: 720, width: 350, height: 22 });
  form.createCheckBox("cause_found").addToPage(page, { x: 20, y: 720, width: 16, height: 16 });
  form.createCheckBox("Zeiterfassung").addToPage(page, { x: 50, y: 720, width: 16, height: 16 });
  form.createTextField("Zeiterfassung_von").addToPage(page, { x: 20, y: 660, width: 90, height: 20 });
  form.createTextField("Zeiterfassung_bis").addToPage(page, { x: 120, y: 660, width: 90, height: 20 });
  form.createTextField("Arbeitszeit").addToPage(page, { x: 220, y: 660, width: 90, height: 20 });
  const technician = form.createDropdown("technician");
  technician.addOptions(["Max Mustermann"]);
  technician.addToPage(page, { x: 20, y: 690, width: 200, height: 20 });
  form.createButton("imagen1").addToPage("Photo", page, { x: 20, y: 600, width: 120, height: 80 });
  form.createButton("signature_technician").addToPage("Sign", page, { x: 160, y: 600, width: 120, height: 50 });

  return pdf.save();
};

const buildTemplate = (): TemplateConfig => ({
  ...REPORT_TEMPLATE,
  fieldMap: {
    "projectInfo.projectNumber": "project_number",
    "findings.summary": "summary",
    "findings.causeFound": "cause_found",
    "projectInfo.technicianName": "technician"
  },
  optionalFieldMap: {
    "templateFields.sonstiges": "Sonstiges",
    "templateFields.zeiterfassung": "Zeiterfassung",
    "billing.from": "Zeiterfassung_von",
    "billing.to": "Zeiterfassung_bis",
    "billing.workingTimeHours": "Arbeitszeit"
  },
  imageFieldMap: {
    "1": "imagen1"
  },
  signatureField: "signature_technician",
  requiredTemplateFields: []
});

const buildBucket = (): Bucket =>
  ({
    file: (path: string) => ({
      exists: async () => [path === "report-photos/r1/p1.png" || path === "report-signatures/r1/technician.png"],
      download: async () => [Buffer.from(ONE_PIXEL_PNG)]
    })
  }) as unknown as Bucket;

const report: ReportData = {
  brandTemplateId: "svt",
  projectInfo: {
    projectNumber: "P-100",
    appointmentDate: "2026-03-27T10:00",
    technicianName: "Max Mustermann",
    firstReportBy: "Kunde",
    locationObject: "Objekt A"
  },
  contacts: {
    name1: "A",
    name2: "B",
    street1: "S1",
    street2: "S2",
    city1: "C1",
    city2: "C2",
    phone1: "1",
    phone2: "2",
    mobile1: "3",
    mobile2: "4",
    email: "test@example.com"
  },
  damageChecklist: { flags: { feuchteschaden: true }, notes: "n" },
  attendees: { flags: { eigentumer: true }, notes: "n" },
  findings: { causeFound: true, causeExposed: false, temporarySeal: false, summary: "summary" },
  actions: { agreedWith: "x", coordinateWith: "y", flags: {}, demontageDetails: "", notes: "" },
  techniques: ["Sichtprüfung"],
  photos: [
    {
      id: "p1",
      slot: 1,
      location: "Küche",
      documentation: "Leck an Rohr",
      storagePath: "report-photos/r1/p1.png",
      downloadUrl: "",
      uploadedAt: "2026-03-27"
    }
  ],
  billing: { from: "08:00", to: "09:00", workingTimeHours: "1" },
  templateFields: {
    sonstiges: "Texto libre",
    zeiterfassung: true,
    assignmentReference: "AB-100",
    insuranceName: "Muster",
    claimNumber: "C-1"
  },
  signature: { technicianName: "Max", signedAt: "2026-03-27", storagePath: "report-signatures/r1/technician.png" },
  status: "draft",
  createdBy: "uid-1"
};

describe("fillReportPdfTemplate", () => {
  it("extracts a dynamic schema from the AcroForm", async () => {
    const templatePdf = await createTemplatePdf();
    const schema = await extractTemplateFieldSchema(templatePdf);

    expect(schema.some((field) => field.pdfFieldName === "project_number" && field.type === "text")).toBe(true);
    expect(schema.some((field) => field.pdfFieldName === "cause_found" && field.type === "checkbox")).toBe(true);
    expect(schema.some((field) => field.pdfFieldName === "technician" && field.type === "dropdown")).toBe(true);
    expect(schema.some((field) => field.pdfFieldName === "signature_technician" && field.type === "signature")).toBe(true);
  });

  it("fills AcroForm fields and embeds photos/signature", async () => {
    const templatePdf = await createTemplatePdf();
    const bytes = await fillReportPdfTemplate(templatePdf, report, buildTemplate(), buildBucket(), { flatten: false });
    const loaded = await PDFDocument.load(bytes);
    const form = loaded.getForm();

    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("%PDF");
    expect(form.getTextField("Sonstiges").getText()).toBe("Texto libre");
    expect(form.getTextField("Zeiterfassung_von").getText()).toBe("08:00");
    expect(form.getTextField("Zeiterfassung_bis").getText()).toBe("09:00");
    expect(form.getTextField("Arbeitszeit").getText()).toBe("1");
    expect((form.getField("Zeiterfassung") as PDFCheckBox).isChecked()).toBe(true);
  });

  it("throws a clear error when a mapped field does not exist", async () => {
    const templatePdf = await createTemplatePdf();
    const invalidTemplate = buildTemplate();
    invalidTemplate.fieldMap = {
      ...invalidTemplate.fieldMap,
      "projectInfo.firstReportBy": "missing_field"
    };

    await expect(fillReportPdfTemplate(templatePdf, report, invalidTemplate, buildBucket())).rejects.toThrow(
      "MAPPED_FIELD_NOT_FOUND:missing_field"
    );
  });

  it("flattens finalized output", async () => {
    const templatePdf = await createTemplatePdf();
    const bytes = await fillReportPdfTemplate(templatePdf, report, buildTemplate(), buildBucket(), { flatten: true });
    const loaded = await PDFDocument.load(bytes);

    expect(loaded.getForm().getFields()).toHaveLength(0);
  });

  it("ignores optional mapped fields that are not present", async () => {
    const templatePdf = await createTemplatePdf();
    const template = buildTemplate();
    template.optionalFieldMap = {
      "templateFields.sonstiges": "missing_optional_field"
    };

    await expect(fillReportPdfTemplate(templatePdf, report, template, buildBucket())).resolves.toBeInstanceOf(Uint8Array);
  });

  it("fills a published dynamic template version using templateFields", async () => {
    const templatePdf = await createTemplatePdf();
    const fieldSchema = await extractTemplateFieldSchema(templatePdf);
    const version: TemplateVersion = {
      id: "v1",
      templateId: "custom-template",
      basePdfPath: "templates/custom-template/versions/v1/source.pdf",
      fieldSchema,
      versionNumber: 1,
      createdBy: "admin-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      status: "published",
      schemaSource: "manual",
      schemaWarnings: []
    };

    const dynamicReport: ReportData = {
      ...report,
      brandTemplateId: "custom-template",
      templateVersionId: "v1",
      templateFields: {
        project_number: "P-DYN-1",
        summary: "dynamic summary",
        cause_found: true,
        technician: "Max Mustermann"
      }
    };

    const bytes = await fillDynamicReportPdfTemplate(templatePdf, dynamicReport, version, buildBucket(), { flatten: false });
    const loaded = await PDFDocument.load(bytes);
    const form = loaded.getForm();

    expect(form.getTextField("project_number").getText()).toBe("P-DYN-1");
    expect(form.getTextField("summary").getText()).toBe("dynamic summary");
    expect((form.getField("cause_found") as PDFCheckBox).isChecked()).toBe(true);
  });
});

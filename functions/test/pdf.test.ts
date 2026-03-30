import type { Bucket } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fillReportPdfTemplate } from "../src/pdf";
import { DEFAULT_TEMPLATES } from "../src/templates";
import { ReportData, TemplateConfig } from "../src/types";

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
  form.createCheckBox("cause_found").addToPage(page, { x: 20, y: 720, width: 16, height: 16 });
  const technician = form.createDropdown("technician");
  technician.addOptions(["Max Mustermann"]);
  technician.addToPage(page, { x: 20, y: 690, width: 200, height: 20 });
  form.createButton("imagen1").addToPage("Photo", page, { x: 20, y: 600, width: 120, height: 80 });
  form.createButton("signature_technician").addToPage("Sign", page, { x: 160, y: 600, width: 120, height: 50 });

  return pdf.save();
};

const buildTemplate = (): TemplateConfig => ({
  ...DEFAULT_TEMPLATES.svt,
  fieldMap: {
    "projectInfo.projectNumber": "project_number",
    "findings.summary": "summary",
    "findings.causeFound": "cause_found",
    "projectInfo.technicianName": "technician"
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
    assignmentReference: "AB-100",
    insuranceName: "Muster",
    claimNumber: "C-1"
  },
  signature: { technicianName: "Max", signedAt: "2026-03-27", storagePath: "report-signatures/r1/technician.png" },
  status: "draft",
  createdBy: "uid-1"
};

describe("fillReportPdfTemplate", () => {
  it("fills AcroForm fields and embeds photos/signature", async () => {
    const templatePdf = await createTemplatePdf();
    const bytes = await fillReportPdfTemplate(templatePdf, report, buildTemplate(), buildBucket(), { flatten: false });

    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("%PDF");
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
});

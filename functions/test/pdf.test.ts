import { describe, expect, it } from "vitest";
import { renderReportPdf } from "../src/pdf";
import { DEFAULT_TEMPLATES } from "../src/templates";
import { ReportData } from "../src/types";

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
  photos: [{
    id: "1",
    slot: 1,
    location: "Küche",
    documentation: "Leck an Rohr",
    storagePath: "",
    downloadUrl: "",
    uploadedAt: "2026-03-27"
  }],
  billing: { from: "08:00", to: "09:00", workingTimeHours: "1" },
  signature: { technicianName: "Max", signedAt: "2026-03-27", storagePath: "" },
  status: "draft",
  createdBy: "uid-1"
};

describe("renderReportPdf", () => {
  it.each(Object.values(DEFAULT_TEMPLATES))("generates a PDF for template %s", async (template) => {
    const bytes = await renderReportPdf(report, template);

    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("%PDF");
  });

  it("sanitizes unsupported unicode characters", async () => {
    const bytes = await renderReportPdf(
      {
        ...report,
        projectInfo: {
          ...report.projectInfo,
          technicianName: "Jürgen 🚧"
        },
        findings: {
          ...report.findings,
          summary: "Leak 🧪 fixed"
        }
      },
      DEFAULT_TEMPLATES.svt
    );

    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("%PDF");
  });
});

import { describe, expect, it } from "vitest";
import { validateReportForFinalize } from "../src/validation";
import { ReportData } from "../src/types";

const baseReport = (): ReportData => ({
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
  photos: [],
  billing: { from: "08:00", to: "09:00", workingTimeHours: "1" },
  templateFields: {
    assignmentReference: "AB-10",
    insuranceName: "MusterVersicherung",
    claimNumber: "CL-9"
  },
  signature: { technicianName: "Max", signedAt: "2026-03-27", storagePath: "report-signatures/id/technician.png" },
  status: "draft",
  createdBy: "uid-1"
});

describe("validateReportForFinalize", () => {
  it("returns no errors for a valid report", () => {
    expect(validateReportForFinalize(baseReport())).toEqual([]);
  });

  it("returns validation errors for missing mandatory fields", () => {
    const report = baseReport();
    report.projectInfo.projectNumber = "";
    report.signature.storagePath = "";

    const errors = validateReportForFinalize(report);
    expect(errors).toContain("Projektnummer ist erforderlich");
    expect(errors).not.toContain("Techniker-Signatur ist erforderlich");
  });

  it("enforces required template fields", () => {
    const report = baseReport();
    report.templateFields.claimNumber = "";

    const errors = validateReportForFinalize(report, ["templateFields.claimNumber"]);
    expect(errors).toContain("templateFields.claimNumber ist erforderlich");
  });

  it("allows dynamic templates to skip summary and signature when not required", () => {
    const report = baseReport();
    report.findings.summary = "";
    report.signature.storagePath = "";

    expect(
      validateReportForFinalize(report, [], {
        requireSummary: false,
        requireSignature: false
      })
    ).toEqual([]);
  });

  it("does not require technician signature by default", () => {
    const report = baseReport();
    report.signature.storagePath = "";

    expect(validateReportForFinalize(report)).toEqual([]);
  });
});

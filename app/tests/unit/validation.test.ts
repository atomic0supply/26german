import { describe, expect, it } from "vitest";
import { createDefaultReport } from "../../src/lib/defaultReport";
import { validateReportForFinalize } from "../../src/lib/validation";

describe("validateReportForFinalize", () => {
  it("returns errors when required fields are missing", () => {
    const report = createDefaultReport("uid-1");
    const errors = validateReportForFinalize(report);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("Projektnummer");
    expect(errors.join(" ")).toContain("Techniker-Signatur");
  });

  it("passes when all required fields exist", () => {
    const report = createDefaultReport("uid-1");
    report.projectInfo.projectNumber = "P-2026-1001";
    report.projectInfo.appointmentDate = "2026-03-27T12:30";
    report.projectInfo.technicianName = "Max Mustermann";
    report.findings.summary = "Leckage im Vorlauf lokalisiert.";
    report.signature.storagePath = "report-signatures/report-1/technician.png";

    expect(validateReportForFinalize(report)).toEqual([]);
  });
});

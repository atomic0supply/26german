import { ReportData } from "../types";

const getValueByPath = (source: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);

export const validateReportForFinalize = (report: ReportData, requiredTemplateFields: string[] = []): string[] => {
  const errors: string[] = [];

  if (!report.projectInfo.projectNumber.trim()) {
    errors.push("Projektnummer ist erforderlich.");
  }

  if (!report.projectInfo.appointmentDate.trim()) {
    errors.push("Messtermin ist erforderlich.");
  }

  if (!report.projectInfo.technicianName.trim()) {
    errors.push("Messtechniker ist erforderlich.");
  }

  if (!report.findings.summary.trim()) {
    errors.push("Ergebnis der Überprüfung ist erforderlich.");
  }

  if (!report.signature.storagePath) {
    errors.push("Techniker-Signatur ist erforderlich.");
  }

  requiredTemplateFields.forEach((fieldPath) => {
    const value = getValueByPath(report, fieldPath);
    if (typeof value === "boolean") {
      if (!value) {
        errors.push(`${fieldPath} ist erforderlich.`);
      }
      return;
    }

    if (!String(value ?? "").trim()) {
      errors.push(`${fieldPath} ist erforderlich.`);
    }
  });

  return errors;
};

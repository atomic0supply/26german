import { ReportData } from "./types";

interface ValidationOptions {
  requireSummary?: boolean;
  requireSignature?: boolean;
  requireProjectNumber?: boolean;
  requireAppointmentDate?: boolean;
  requireTechnicianName?: boolean;
}

const getValueByPath = (source: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);

export const validateReportForFinalize = (
  report: ReportData,
  requiredTemplateFields: string[] = [],
  options: ValidationOptions = {}
): string[] => {
  const errors: string[] = [];
  const {
    requireSummary = true,
    requireSignature = false,
    requireProjectNumber = true,
    requireAppointmentDate = true,
    requireTechnicianName = true
  } = options;

  if (requireProjectNumber && !report.projectInfo?.projectNumber?.trim()) {
    errors.push("Projektnummer ist erforderlich");
  }

  if (requireAppointmentDate && !report.projectInfo?.appointmentDate?.trim()) {
    errors.push("Messtermin ist erforderlich");
  }

  if (requireTechnicianName && !report.projectInfo?.technicianName?.trim()) {
    errors.push("Messtechniker ist erforderlich");
  }

  if (requireSummary && !report.findings?.summary?.trim()) {
    errors.push("Ergebnis der Überprüfung ist erforderlich");
  }

  if (requireSignature && !report.signature?.storagePath?.trim()) {
    errors.push("Techniker-Signatur ist erforderlich");
  }

  for (const fieldPath of requiredTemplateFields) {
    const value = getValueByPath(report, fieldPath);
    if (typeof value === "boolean") {
      if (!value) {
        errors.push(`${fieldPath} ist erforderlich`);
      }
      continue;
    }

    if (!String(value ?? "").trim()) {
      errors.push(`${fieldPath} ist erforderlich`);
    }
  }

  return errors;
};

import { ReportData } from "./types";

export const validateReportForFinalize = (report: ReportData): string[] => {
  const errors: string[] = [];

  if (!report.projectInfo?.projectNumber?.trim()) {
    errors.push("Projektnummer ist erforderlich");
  }

  if (!report.projectInfo?.appointmentDate?.trim()) {
    errors.push("Messtermin ist erforderlich");
  }

  if (!report.projectInfo?.technicianName?.trim()) {
    errors.push("Messtechniker ist erforderlich");
  }

  if (!report.findings?.summary?.trim()) {
    errors.push("Ergebnis der Überprüfung ist erforderlich");
  }

  if (!report.signature?.storagePath?.trim()) {
    errors.push("Techniker-Signatur ist erforderlich");
  }

  return errors;
};

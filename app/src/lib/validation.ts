import { Language, translate } from "../i18n";
import { ReportData } from "../types";

const getValueByPath = (source: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);

const getRequiredFieldLabel = (fieldPath: string, language: Language): string => {
  switch (fieldPath) {
    case "projectInfo.projectNumber":
      return translate(language, "Projektnummer", "Número de proyecto");
    case "projectInfo.appointmentDate":
      return translate(language, "Messtermin", "Fecha de la visita");
    case "projectInfo.technicianName":
      return translate(language, "Messtechniker", "Técnico");
    default:
      return fieldPath;
  }
};

const buildRequiredMessage = (label: string, language: Language): string =>
  translate(language, `${label} ist erforderlich.`, `${label} es obligatorio.`);

export const validateReportForFinalize = (
  report: ReportData,
  requiredTemplateFields: string[] = [],
  language: Language = "de"
): string[] => {
  const errors: string[] = [];

  if (!report.projectInfo.projectNumber.trim()) {
    errors.push(buildRequiredMessage(translate(language, "Projektnummer", "Número de proyecto"), language));
  }

  if (!report.projectInfo.appointmentDate.trim()) {
    errors.push(buildRequiredMessage(translate(language, "Messtermin", "Fecha de la visita"), language));
  }

  if (!report.projectInfo.technicianName.trim()) {
    errors.push(buildRequiredMessage(translate(language, "Messtechniker", "Técnico"), language));
  }

  if (!report.findings.summary.trim()) {
    errors.push(buildRequiredMessage(translate(language, "Ergebnis der Überprüfung", "Resultado de la revisión"), language));
  }

  if (!report.signature.storagePath) {
    errors.push(buildRequiredMessage(translate(language, "Techniker-Signatur", "Firma del técnico"), language));
  }

  requiredTemplateFields.forEach((fieldPath) => {
    const value = getValueByPath(report, fieldPath);
    const label = getRequiredFieldLabel(fieldPath, language);
    if (typeof value === "boolean") {
      if (!value) {
        errors.push(buildRequiredMessage(label, language));
      }
      return;
    }

    if (!String(value ?? "").trim()) {
      errors.push(buildRequiredMessage(label, language));
    }
  });

  return errors;
};

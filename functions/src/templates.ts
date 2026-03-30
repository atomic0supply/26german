import { BuiltinTemplateId, TemplateConfig, TemplateFieldMap, TemplateImageFieldMap } from "./types";

const BASE_FIELD_MAP: TemplateFieldMap = {
  "projectInfo.projectNumber": "AUF_ProjektId",
  "projectInfo.appointmentDate": "EINSATZ_VonDatum",
  "projectInfo.technicianName": "MONT_listname",
  "projectInfo.firstReportBy": "AUF_StoerGesprochenMit",
  "projectInfo.locationObject": "SO_Name1",
  "contacts.name1": "KD_Name1",
  "contacts.name2": "KD_Name2",
  "contacts.street1": "KD_Street",
  "contacts.street2": "KD_StreetNo",
  "contacts.city1": "KD_City",
  "contacts.city2": "SO_City",
  "contacts.phone1": "KD_TelNumber",
  "contacts.phone2": "KD_TelConnection",
  "contacts.mobile1": "KD_Mobil",
  "contacts.email": ["KD_EMail", "MIET_EMail", "VERS_EMail", "ZUST_EMail"],
  "findings.summary": "Text194",
  "billing.from": "Text37",
  "billing.to": "Text38",
  "billing.workingTimeHours": "Text11",
  "findings.causeFound": "Kontrollkästchen8",
  "findings.causeExposed": "Kontrollkästchen9",
  "findings.temporarySeal": "Kontrollkästchen10",
  "damageChecklist.flags.feuchteschaden": "Kontrollkästchen17",
  "actions.flags.folgetermin": "Kontrollkästchen18",
  "templateFields.assignmentReference": "AUF_StoerBestNr",
  "templateFields.insuranceName": "VERS_Name1",
  "templateFields.claimNumber": "AUF_VersSchadenNr",
  "templateFields.policyNumber": "AUF_VersScheinNr",
  "templateFields.technicianPhone": "MONT_teld",
  "templateFields.tenantEmail": "MIET_EMail",
  "templateFields.insurerEmail": "VERS_EMail",
  "templateFields.responsibleEmail": "ZUST_EMail",
  "templateFields.damageLocation": "Text13",
  "templateFields.documentationSummary": "Text98",
  "templateFields.emergencyService": "Kontrollkästchen14",
  "templateFields.confirmedByClient": "Kontrollkästchen15",
  "templateFields.invoiceReleased": "Kontrollkästchen16"
};

const BASE_IMAGE_FIELD_MAP: TemplateImageFieldMap = {
  "1": "imagen1",
  "2": "imagen2",
  "3": "imagen3",
  "4": "imagen4",
  "5": "imagen5",
  "6": "imagen6",
  "7": "imagen7",
  "8": "imagen8",
  "9": "imagen9"
};

const REQUIRED_TEMPLATE_FIELDS = [
  "templateFields.assignmentReference",
  "templateFields.insuranceName",
  "templateFields.claimNumber"
];

const buildTemplate = (
  id: BuiltinTemplateId,
  name: string,
  logoPath: string,
  primaryColor: string,
  titleColor: string
): TemplateConfig => ({
  id,
  name,
  pdfTemplatePath: `templates/${id}/template.pdf`,
  fieldMap: { ...BASE_FIELD_MAP },
  imageFieldMap: { ...BASE_IMAGE_FIELD_MAP },
  signatureField: "signature_technician",
  requiredTemplateFields: [...REQUIRED_TEMPLATE_FIELDS],
  logoPath,
  footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
  headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
  pdfStyle: { primaryColor, titleColor }
});

export const DEFAULT_TEMPLATES: Record<BuiltinTemplateId, TemplateConfig> = {
  svt: buildTemplate("svt", "SVT", "templates/svt/logo.png", "#0c2a4d", "#12395f"),
  brasa: buildTemplate("brasa", "Brasa", "templates/brasa/logo.jpg", "#1e3a5f", "#1d4f7d"),
  angerhausen: buildTemplate("angerhausen", "Angerhausen", "templates/angerhausen/logo.png", "#254763", "#1b5a87"),
  "aqua-braun": buildTemplate("aqua-braun", "Aqua-Braun", "templates/aqua-braun/logo.png", "#0f3d59", "#005f8f")
};

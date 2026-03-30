import { ActionKey, AttendeeKey, BuiltinTemplateId, DamageKey, TemplateConfig } from "./types";

export const DAMAGE_OPTIONS: { key: DamageKey; label: string }[] = [
  { key: "feuchteschaden", label: "Feuchteschaden" },
  { key: "druckabfall", label: "Druckabfall" },
  { key: "wasserverlust", label: "Wasserverlust" },
  { key: "wasseraustritt", label: "Wasseraustritt" },
  { key: "schimmel", label: "Schimmel" }
];

export const ATTENDEE_OPTIONS: { key: AttendeeKey; label: string }[] = [
  { key: "eigentumer", label: "Eigentümer" },
  { key: "mieter", label: "Mieter" },
  { key: "installateur", label: "Installateur" },
  { key: "hausmeister", label: "Hausmeister" },
  { key: "hv", label: "HV" },
  { key: "versicherung", label: "Versicherung" }
];

export const ACTION_OPTIONS: { key: ActionKey; label: string }[] = [
  { key: "regulierer", label: "Regulierereinsatz zu empfehlen" },
  { key: "technischeTrocknung", label: "Techn. Trocknung" },
  { key: "fussbodenheizung", label: "Fußbodenheizung" },
  { key: "reparaturInstallateur", label: "Reparatur durch Installateur" },
  { key: "folgegewerke", label: "Folgegewerke erforderlich" },
  { key: "ersatzfliesen", label: "Ersatzfliesen vorhanden" },
  { key: "rueckbau", label: "Rückbau erforderlich" },
  { key: "schimmelbeseitigung", label: "Schimmelbeseitigung erforderlich" },
  { key: "inlinereinzugPruefen", label: "Inlinereinzug ist zu prüfen" },
  { key: "demontage", label: "Demontage erforderlich" },
  { key: "folgetermin", label: "Folgetermin erforderlich" },
  { key: "infoAquaRadar", label: "Info an Aqua-Radar" }
];

export const TECHNIQUE_OPTIONS: string[] = [
  "Sichtprüfung",
  "Feuchtemessung",
  "Druckprobe",
  "Thermografie",
  "Elektroakustik",
  "Leitungsortung",
  "Tracergas",
  "Rohrkamera",
  "Endoskopie",
  "Färbemittel",
  "Spülung",
  "Leitfähigkeit"
];

export const PHOTO_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type TemplateFieldInputType = "text" | "textarea" | "checkbox";

export interface TemplateFieldDefinition {
  key: string;
  label: string;
  type: TemplateFieldInputType;
}

export const TEMPLATE_FIELD_DEFINITIONS: TemplateFieldDefinition[] = [
  { key: "assignmentReference", label: "Auftrags-/Bestellnummer", type: "text" },
  { key: "insuranceName", label: "Versicherung", type: "text" },
  { key: "claimNumber", label: "Schadennummer", type: "text" },
  { key: "policyNumber", label: "Versicherungsscheinnummer", type: "text" },
  { key: "technicianPhone", label: "Telefon Messtechniker", type: "text" },
  { key: "tenantEmail", label: "E-Mail Mieter", type: "text" },
  { key: "insurerEmail", label: "E-Mail Versicherung", type: "text" },
  { key: "responsibleEmail", label: "E-Mail Zuständige Stelle", type: "text" },
  { key: "damageLocation", label: "Ort der Aufnahme / Schadenort", type: "text" },
  { key: "documentationSummary", label: "Dokumentation (Kurztext)", type: "textarea" },
  { key: "emergencyService", label: "Notfallbearbeitung", type: "checkbox" },
  { key: "confirmedByClient", label: "Mit Kunde abgestimmt", type: "checkbox" },
  { key: "invoiceReleased", label: "Abrechnung freigegeben", type: "checkbox" }
];

const BASE_FIELD_MAP: TemplateConfig["fieldMap"] = {
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

const BASE_IMAGE_FIELD_MAP: TemplateConfig["imageFieldMap"] = {
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

export const TEMPLATE_OPTIONS: TemplateConfig[] = [
  buildTemplate("svt", "SVT", "templates/svt/logo.png", "#0c2a4d", "#12395f"),
  buildTemplate("brasa", "Brasa", "templates/brasa/logo.jpg", "#1e3a5f", "#1d4f7d"),
  buildTemplate("angerhausen", "Angerhausen", "templates/angerhausen/logo.png", "#254763", "#1b5a87"),
  buildTemplate("aqua-braun", "Aqua-Braun", "templates/aqua-braun/logo.png", "#0f3d59", "#005f8f")
];

export const TEMPLATE_OPTIONS_BY_ID = TEMPLATE_OPTIONS.reduce<Record<BuiltinTemplateId, TemplateConfig>>((acc, template) => {
  acc[template.id] = template;
  return acc;
}, {} as Record<BuiltinTemplateId, TemplateConfig>);

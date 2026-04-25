import { Language, translate } from "./i18n";
import { ActionKey, AttendeeKey, CompanyConfig, CompanyId, DamageKey, TemplateConfig, TemplateId } from "./types";

interface LocalizedOption<T extends string> {
  key: T;
  deLabel: string;
  esLabel: string;
}

interface LocalizedTechniqueOption {
  value: string;
  deLabel: string;
  esLabel: string;
}

// ---------------------------------------------------------------------------
// Opciones de formulario
// ---------------------------------------------------------------------------
export const DAMAGE_OPTIONS: LocalizedOption<DamageKey>[] = [
  { key: "feuchteschaden", deLabel: "Feuchteschaden", esLabel: "Daños por humedad" },
  { key: "druckabfall", deLabel: "Druckabfall", esLabel: "Caída de presión" },
  { key: "wasserverlust", deLabel: "Wasserverlust", esLabel: "Pérdida de agua" },
  { key: "wasseraustritt", deLabel: "Wasseraustritt", esLabel: "Fuga de agua" },
  { key: "schimmel", deLabel: "Schimmel", esLabel: "Moho" }
];

export const ATTENDEE_OPTIONS: LocalizedOption<AttendeeKey>[] = [
  { key: "eigentumer", deLabel: "Eigentümer", esLabel: "Propietario" },
  { key: "mieter", deLabel: "Mieter", esLabel: "Inquilino" },
  { key: "installateur", deLabel: "Installateur", esLabel: "Instalador" },
  { key: "hausmeister", deLabel: "Hausmeister", esLabel: "Conserje" },
  { key: "hv", deLabel: "HV", esLabel: "Administración" },
  { key: "versicherung", deLabel: "Versicherung", esLabel: "Seguro" }
];

export const ACTION_OPTIONS: LocalizedOption<ActionKey>[] = [
  { key: "technischeTrocknung", deLabel: "Techn. Trocknung", esLabel: "Secado técnico" },
  { key: "fussbodenheizung", deLabel: "Fußbodenheizung", esLabel: "Suelo radiante" },
  { key: "reparaturInstallateur", deLabel: "Reparatur durch Installateur", esLabel: "Reparación por instalador" },
  { key: "folgegewerke", deLabel: "Folgegewerke erforderlich", esLabel: "Se requieren gremios posteriores" },
  { key: "ersatzfliesen", deLabel: "Ersatzfliesen vorhanden", esLabel: "Hay azulejos de repuesto" },
  { key: "rueckbau", deLabel: "Rückbau erforderlich", esLabel: "Se requiere desmontaje" },
  { key: "schimmelbeseitigung", deLabel: "Schimmelbeseitigung erforderlich", esLabel: "Se requiere eliminación de moho" },
  { key: "demontage", deLabel: "Demontage erforderlich", esLabel: "Desmontaje necesario" },
  { key: "folgetermin", deLabel: "Folgetermin erforderlich", esLabel: "Se requiere cita de seguimiento" }
];

export const TECHNIQUE_OPTIONS: LocalizedTechniqueOption[] = [
  { value: "Sichtprüfung", deLabel: "Sichtprüfung", esLabel: "Inspección visual" },
  { value: "Feuchtemessung", deLabel: "Feuchtemessung", esLabel: "Medición de humedad" },
  { value: "Druckprobe", deLabel: "Druckprobe", esLabel: "Prueba de presión" },
  { value: "Thermografie", deLabel: "Thermografie", esLabel: "Termografía" },
  { value: "Elektroakustik", deLabel: "Elektroakustik", esLabel: "Electroacústica" },
  { value: "Leitungsortung", deLabel: "Leitungsortung", esLabel: "Localización de tuberías" },
  { value: "Tracergas", deLabel: "Tracergas", esLabel: "Gas trazador" },
  { value: "Rohrkamera", deLabel: "Rohrkamera", esLabel: "Cámara de tuberías" },
  { value: "Endoskopie", deLabel: "Endoskopie", esLabel: "Endoscopia" },
  { value: "Färbemittel", deLabel: "Färbemittel", esLabel: "Colorante" },
  { value: "Spülung", deLabel: "Spülung", esLabel: "Limpieza por arrastre" },
  { value: "Leitfähigkeit", deLabel: "Leitfähigkeit", esLabel: "Conductividad" }
];

export const PHOTO_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------
export const COMPANIES: Record<CompanyId, CompanyConfig> = {
  svt:        { id: "svt",        name: "SVT",          logoStoragePath: "logo/logo_svt.png" },
  brasa:      { id: "brasa",      name: "Brasa",        logoStoragePath: "logo/brasa_logo.jpg" },
  angerhausen:{ id: "angerhausen",name: "Angerhausen",  logoStoragePath: "logo/logo_angerhausen.png" },
  aquaradar:  { id: "aquaradar",  name: "AquaRADAR",    logoStoragePath: "logo/logo_aquaradar.jpg" },
  herrmann:   { id: "herrmann",   name: "Hermann SBR",  logoStoragePath: "logo/logo_herrmann.png" },
  homekoncept:{ id: "homekoncept",name: "HOMEKONZEPT",  logoStoragePath: "logo/logo_homekoncept.png" },
  wasat:      { id: "wasat",      name: "Wasa-T",       logoStoragePath: "logo/Ilogo_wasatec.png" }
};

export const COMPANY_OPTIONS = Object.values(COMPANIES);

// ---------------------------------------------------------------------------
// Plantilla AcroForm única
// ---------------------------------------------------------------------------
export const REPORT_TEMPLATE_ID: TemplateId = "svt";

export const REPORT_TEMPLATE: TemplateConfig = {
  id: REPORT_TEMPLATE_ID,
  name: "Plantilla AcroForm",
  pdfTemplatePath: "template/template.pdf",
  fieldMap: {},            // el fieldMap real vive en el backend (functions/src/templates.ts)
  imageFieldMap: {},
  signatureField: "",
  requiredTemplateFields: [
    "projectInfo.projectNumber",
    "projectInfo.technicianName"
  ]
};

export const TEMPLATE_OPTIONS_BY_ID = {
  svt: REPORT_TEMPLATE
} as const;

export const getLocalizedOptionLabel = (
  language: Language,
  option: { deLabel: string; esLabel: string }
): string => translate(language, option.deLabel, option.esLabel);

export const getLocalizedTechniqueLabel = (
  language: Language,
  option: LocalizedTechniqueOption
): string => translate(language, option.deLabel, option.esLabel);

export const getReportTemplateLabel = (language: Language): string =>
  translate(language, "AcroForm-Vorlage", "Plantilla AcroForm");

export const resolveReportTemplateName = (language: Language, templateName?: string): string => {
  const normalizedName = templateName?.trim();
  const knownNames = new Set(["AcroForm-Vorlage", "Plantilla AcroForm"]);
  if (!normalizedName || knownNames.has(normalizedName)) {
    return getReportTemplateLabel(language);
  }

  return normalizedName;
};

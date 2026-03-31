export type ReportStatus = "draft" | "finalized";
export type UserRole = "technician" | "admin" | "office";
export type BuiltinTemplateId = "svt" | "brasa" | "angerhausen" | "aqua-braun";
export type TemplateId = BuiltinTemplateId | "custom";
export type TemplateFieldValue = string | boolean;
export type TemplateFieldMap = Record<string, string | string[]>;
export type TemplateImageFieldMap = Record<string, string | string[]>;
export type TemplateStatus = "draft" | "published";
export type TemplateFieldType = "text" | "textarea" | "checkbox" | "dropdown" | "image" | "signature";
export type TemplateFieldSource = "dynamic" | "image" | "signature";
export type TemplateSchemaSource = "manual" | "ai" | "mixed";

export type DamageKey =
  | "feuchteschaden"
  | "druckabfall"
  | "wasserverlust"
  | "wasseraustritt"
  | "schimmel";

export type AttendeeKey =
  | "eigentumer"
  | "mieter"
  | "installateur"
  | "hausmeister"
  | "hv"
  | "versicherung";

export type ActionKey =
  | "regulierer"
  | "technischeTrocknung"
  | "fussbodenheizung"
  | "reparaturInstallateur"
  | "folgegewerke"
  | "ersatzfliesen"
  | "rueckbau"
  | "schimmelbeseitigung"
  | "inlinereinzugPruefen"
  | "demontage"
  | "folgetermin"
  | "infoAquaRadar";

export interface ProjectInfo {
  projectNumber: string;
  appointmentDate: string;
  technicianName: string;
  firstReportBy: string;
  locationObject: string;
}

export interface ContactDetails {
  name1: string;
  name2: string;
  street1: string;
  street2: string;
  city1: string;
  city2: string;
  phone1: string;
  phone2: string;
  mobile1: string;
  mobile2: string;
  email: string;
}

export interface DamageChecklist {
  flags: Record<DamageKey, boolean>;
  notes: string;
}

export interface Attendees {
  flags: Record<AttendeeKey, boolean>;
  notes: string;
}

export interface Findings {
  causeFound: boolean;
  causeExposed: boolean;
  temporarySeal: boolean;
  summary: string;
}

export interface Actions {
  agreedWith: string;
  coordinateWith: string;
  flags: Record<ActionKey, boolean>;
  demontageDetails: string;
  notes: string;
}

export interface ReportPhoto {
  id: string;
  slot: number;
  location: string;
  documentation: string;
  storagePath: string;
  downloadUrl: string;
  uploadedAt: string;
}

export interface Billing {
  from: string;
  to: string;
  workingTimeHours: string;
}

export interface Signature {
  technicianName: string;
  signedAt: string;
  dataUrl?: string;
  storagePath?: string;
  downloadUrl?: string;
}

export interface FinalizationInfo {
  finalizedAt: string;
  finalizedBy: string;
  pdfPath: string;
  pdfUrl: string;
  pdfChecksum: string;
  pdfVersion: number;
}

export interface TemplateFieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateFieldSchema {
  id: string;
  type: TemplateFieldType;
  source: TemplateFieldSource;
  label: string;
  page: number;
  rect: TemplateFieldRect;
  required: boolean;
  options: string[];
  defaultValue: string;
  helpText: string;
  aiConfidence?: number;
  aiReason?: string;
  generatedByAi?: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  brand: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedVersionId?: string;
  status: TemplateStatus;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  basePdfPath: string;
  editablePdfPath: string;
  fieldSchema: TemplateFieldSchema[];
  versionNumber: number;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  publishedBy?: string;
  status: TemplateStatus;
  schemaSource?: TemplateSchemaSource;
  schemaGeneratedAt?: string;
  schemaModel?: string;
  schemaWarnings?: string[];
}

export interface SuggestTemplateSchemaResult {
  fieldSchema: TemplateFieldSchema[];
  summary: string;
  model: string;
  generatedAt: string;
  warnings: string[];
  schemaSource: TemplateSchemaSource;
}

export interface GeminiModelOption {
  id: string;
  displayName: string;
  description: string;
}

export interface AiSettingsSummary {
  hasApiKey: boolean;
  apiKeyHint: string;
  model: string;
}

export interface ReportData {
  clientId: string;
  brandTemplateId: TemplateId;
  templateRef?: string;
  templateVersionRef?: string;
  templateName?: string;
  projectInfo: ProjectInfo;
  contacts: ContactDetails;
  damageChecklist: DamageChecklist;
  attendees: Attendees;
  findings: Findings;
  actions: Actions;
  techniques: string[];
  photos: ReportPhoto[];
  billing: Billing;
  templateFields: Record<string, TemplateFieldValue>;
  templateAssetPaths?: Record<string, string>;
  templateAssetUrls?: Record<string, string>;
  signature: Signature;
  status: ReportStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finalization?: FinalizationInfo;
}

export interface ClientData {
  id: string;
  email: string;
  phone: string;
  location: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportListItem {
  id: string;
  projectNumber: string;
  objectLabel: string;
  status: ReportStatus;
  updatedAt: string;
  template: TemplateId;
  templateName?: string;
}

export interface TemplateConfig {
  id: BuiltinTemplateId;
  name: string;
  pdfTemplatePath: string;
  fieldMap: TemplateFieldMap;
  imageFieldMap: TemplateImageFieldMap;
  signatureField: string;
  requiredTemplateFields: string[];
  logoPath: string;
  footerText: string;
  headerFields: string[];
  pdfStyle: {
    primaryColor: string;
    titleColor: string;
  };
}

export interface ReportTemplateOption {
  id: string;
  versionId?: string;
  value: string;
  name: string;
  kind: "builtin" | "custom";
}

export interface FinalizeReportResult {
  pdfUrl: string;
  finalizedAt: string;
}

export type ReportStatus = "draft" | "finalized";
export type UserRole = "technician" | "admin" | "office";
export type BuiltinTemplateId = "svt";
export type TemplateId = "svt";
export type TemplateFieldValue = string | boolean;
export type TemplateFieldMap = Record<string, string | string[]>;
export type TemplateImageFieldMap = Record<string, string | string[]>;
export type TemplateStatus = "draft" | "published";
export type TemplateFieldType = "text" | "textarea" | "checkbox" | "dropdown" | "image" | "signature";
export type TemplateFieldSource = "dynamic" | "image" | "signature";
export type TemplateSchemaSource = "manual" | "ai" | "mixed";

export type CompanyId =
  | "svt"
  | "brasa"
  | "angerhausen"
  | "aquaradar"
  | "herrmann"
  | "homekoncept"
  | "wasat";

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
  | "technischeTrocknung"
  | "fussbodenheizung"
  | "reparaturInstallateur"
  | "folgegewerke"
  | "ersatzfliesen"
  | "rueckbau"
  | "schimmelbeseitigung"
  | "demontage"
  | "folgetermin";

export interface ProjectInfo {
  projectNumber: string;
  auftragserteilung?: string;
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
  editablePdfPath?: string;
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

export interface ReportData {
  clientId: string;
  brandTemplateId: TemplateId;
  companyId?: CompanyId;
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
  signature: Signature;
  status: ReportStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finalization?: FinalizationInfo;
}

export interface ClientData {
  id: string;
  name: string;
  surname: string;
  principalContact: string;
  email: string;
  phone: string;
  location: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportListItem {
  id: string;
  createdBy: string;
  createdByEmail?: string;
  createdByLabel?: string;
  projectNumber: string;
  objectLabel: string;
  clientId?: string;
  appointmentDate?: string;
  visitDurationMinutes?: string;
  visitNotificationRecipient?: string;
  visitNotificationSentAt?: string;
  technicianName?: string;
  companyId?: CompanyId;
  status: ReportStatus;
  updatedAt: string;
  templateName?: string;
  finalization?: {
    pdfUrl?: string;
    finalizedAt?: string;
    pdfVersion?: number;
  };
}

export interface TemplateConfig {
  id: TemplateId;
  name: string;
  pdfTemplatePath: string;
  fieldMap: TemplateFieldMap;
  imageFieldMap?: TemplateImageFieldMap;
  signatureField: string;
  requiredTemplateFields: string[];
}

export interface CompanyConfig {
  id: CompanyId;
  name: string;
  logoStoragePath: string;
}

export interface FinalizeReportResult {
  pdfUrl: string;
  finalizedAt: string;
}

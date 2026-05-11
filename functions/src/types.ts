export type ReportStatus = "draft" | "finalized";
export type UserRole = "technician" | "admin" | "office";
export type BuiltinTemplateId = "svt" | "leckortung";
export type TemplateId = string;
export type TemplateFieldValue = string | boolean;
export type TemplateFieldMap = Record<string, string | string[]>;
export type TemplateImageFieldMap = Record<string, string | string[]>;
export type TemplateStatus = "draft" | "published";
export type TemplateFieldType = "text" | "textarea" | "checkbox" | "dropdown" | "image" | "signature";
export type TemplateFieldSource = "dynamic" | "image" | "signature" | "acroform";
export type TemplateSchemaSource = "manual" | "ai" | "mixed";

export type CompanyId =
  | "svt"
  | "brasa"
  | "angerhausen"
  | "aquaradar"
  | "herrmann"
  | "homekoncept"
  | "wasat";

export interface PartnerData {
  id: string;
  name: string;
  contactPerson: string;
  street: string;
  city: string;
  phone: string;
  mobile: string;
  email: string;
  web: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerSnapshot {
  id: string;
  name: string;
  contactPerson: string;
  street: string;
  city: string;
  phone: string;
  mobile: string;
  email: string;
  web: string;
}

export interface ReportData {
  clientId?: string;
  brandTemplateId: TemplateId;
  templateVersionId?: string;
  companyId?: CompanyId;
  templateName?: string;
  partnerId?: string;
  partner?: PartnerSnapshot;
  projectInfo: {
    projectNumber: string;
    auftragserteilung?: string;
    appointmentDate: string;
    technicianName: string;
    firstReportBy: string;
    locationObject: string;
  };
  contacts: {
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
  };
  damageChecklist: {
    flags: Record<string, boolean>;
    notes: string;
  };
  attendees: {
    flags: Record<string, boolean>;
    notes: string;
  };
  findings: {
    causeFound: boolean;
    causeExposed: boolean;
    temporarySeal: boolean;
    ursacheGefunden: boolean;
    summary: string;
  };
  actions: {
    agreedWith: string;
    coordinateWith: string;
    flags: Record<string, boolean>;
    demontageDetails: string;
    notes: string;
  };
  techniques: string[];
  photos: Array<{
    id: string;
    slot: number;
    location: string;
    documentation: string;
    storagePath: string;
    downloadUrl: string;
    uploadedAt: string;
  }>;
  billing: {
    from: string;
    to: string;
    workingTimeHours: string;
    workDate?: string;
  };
  templateFields: Record<string, TemplateFieldValue>;
  signature: {
    technicianName: string;
    signedAt: string;
    dataUrl?: string;
    storagePath?: string;
    downloadUrl?: string;
  };
  status: ReportStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  finalization?: {
    finalizedAt?: string;
    finalizedBy?: string;
    pdfPath?: string;
    pdfUrl?: string;
    pdfChecksum?: string;
    pdfVersion?: number;
  };
  leckortungFinalization?: {
    finalizedAt?: string;
    finalizedBy?: string;
    pdfPath?: string;
    pdfUrl?: string;
    pdfChecksum?: string;
    pdfVersion?: number;
  };
  lastEmailDelivery?: {
    clientId?: string;
    recipient?: string;
    sentAt?: string;
  };
  lastLeckortungEmailDelivery?: {
    clientId?: string;
    recipient?: string;
    sentAt?: string;
  };
}

export interface ClientData {
  name: string;
  surname: string;
  principalContact: string;
  email: string;
  phone: string;
  location: string;
  createdBy: string;
}

export interface TemplateConfig {
  id: TemplateId;
  name: string;
  pdfTemplatePath: string;
  fieldMap: TemplateFieldMap;
  optionalFieldMap?: TemplateFieldMap;
  imageFieldMap?: TemplateImageFieldMap;
  signatureField: string;
  requiredTemplateFields: string[];
}

export interface CompanyConfig {
  id: CompanyId;
  name: string;
  logoStoragePath: string;
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
  includeInForm: boolean;
  options: string[];
  defaultValue: string;
  helpText: string;
  pdfFieldName: string;
  pdfFieldType: string;
  sortOrder: number;
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
  latestDraftVersionId?: string;
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

export type AiPromptPurpose = "photo_description" | "damage_summary" | "general";

export interface AnalyzePhotoRequest {
  reportId: string;
  photoId: string;
  storagePath: string;
  slot: number;
  technicianNote?: string;
}

export interface AnalyzePhotoResponse {
  description: string;
  model: string;
  generatedAt: string;
}

export interface AiConfig {
  textModel: string;
  visionModel: string;
  hasKey?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AiPrompt {
  id: string;
  name: string;
  description: string;
  content: string;
  purpose: AiPromptPurpose;
  isDefault: boolean;
  isActive?: boolean;
  version?: string;
  updatedAt?: string;
  updatedBy?: string;
}

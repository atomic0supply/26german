export type ReportStatus = "draft" | "finalized";
export type UserRole = "technician" | "admin" | "office";
export type BuiltinTemplateId = "svt" | "brasa" | "angerhausen" | "aqua-braun";
export type TemplateId = BuiltinTemplateId | "custom";
export type TemplateFieldValue = string | boolean;
export type TemplateFieldMap = Record<string, string | string[]>;
export type TemplateImageFieldMap = Record<string, string | string[]>;
export type TemplateStatus = "draft" | "published";
export type TemplateFieldType = "text" | "textarea" | "checkbox" | "dropdown" | "image" | "signature";
export type TemplateFieldSource = "dynamic" | "image" | "signature" | "insurer_logo";

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
}

export interface InsurerData {
  id: string;
  name: string;
  logoPath: string;
  primaryColor: string;
  titleColor: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export interface AppointmentData {
  id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  assignedTo: string;
  assignedToName: string;
  clientId: string;
  clientName: string;
  location: string;
  status: AppointmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  confirmationEmailSentAt?: string;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  footerText: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReportData {
  clientId?: string;
  insurerId?: string;
  brandTemplateId: TemplateId;
  templateRef?: string;
  templateVersionRef?: string;
  templateName?: string;
  projectInfo: {
    projectNumber: string;
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
  };
  templateFields: Record<string, TemplateFieldValue>;
  templateAssetPaths?: Record<string, string>;
  templateAssetUrls?: Record<string, string>;
  signature: {
    technicianName: string;
    signedAt: string;
    storagePath?: string;
    downloadUrl?: string;
  };
  status: ReportStatus;
  createdBy: string;
  finalization?: {
    finalizedAt?: string;
    finalizedBy?: string;
    pdfPath?: string;
    pdfUrl?: string;
    pdfChecksum?: string;
    pdfVersion?: number;
  };
}

export interface ClientData {
  email: string;
  phone: string;
  location: string;
  createdBy: string;
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

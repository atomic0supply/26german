export type ReportStatus = "draft" | "finalized";
export type UserRole = "technician" | "admin" | "office";
export type TemplateId = "svt";
export type TemplateFieldValue = string | boolean;
export type TemplateFieldMap = Record<string, string | string[]>;
export type TemplateImageFieldMap = Record<string, string | string[]>;

export type CompanyId =
  | "svt"
  | "brasa"
  | "angerhausen"
  | "aquaradar"
  | "herrmann"
  | "homekoncept"
  | "wasat";

export interface ReportData {
  clientId?: string;
  brandTemplateId: TemplateId;
  companyId?: CompanyId;
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
  signatureField: string;
  requiredTemplateFields: string[];
}

export interface CompanyConfig {
  id: CompanyId;
  name: string;
  logoStoragePath: string;
}

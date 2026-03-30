export type ReportStatus = "draft" | "finalized";

export type TemplateId = "svt" | "brasa" | "angerhausen" | "aqua-braun";

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

export interface ReportData {
  clientId: string;
  brandTemplateId: TemplateId;
  projectInfo: ProjectInfo;
  contacts: ContactDetails;
  damageChecklist: DamageChecklist;
  attendees: Attendees;
  findings: Findings;
  actions: Actions;
  techniques: string[];
  photos: ReportPhoto[];
  billing: Billing;
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
}

export interface TemplateConfig {
  id: TemplateId;
  name: string;
  logoPath: string;
  footerText: string;
  headerFields: string[];
  pdfStyle: {
    primaryColor: string;
    titleColor: string;
  };
}

export interface FinalizeReportResult {
  pdfUrl: string;
  finalizedAt: string;
}

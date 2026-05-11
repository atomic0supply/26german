import { ACTION_OPTIONS, ATTENDEE_OPTIONS, DAMAGE_OPTIONS, REPORT_TEMPLATE } from "../constants";
import { CompanyId, ReportData, TemplateId } from "../types";

const buildFlagMap = <T extends string>(keys: T[]) =>
  keys.reduce(
    (acc, key) => {
      acc[key] = false;
      return acc;
    },
    {} as Record<T, boolean>
  );

interface CreateDefaultReportOptions {
  companyId?: CompanyId;
  templateId?: TemplateId;
  templateName?: string;
  templateVersionId?: string;
}

export const createDefaultReport = (uid: string, options: CreateDefaultReportOptions = {}): ReportData => {
  const now = new Date().toISOString();

  return {
    clientId: "",
    brandTemplateId: options.templateId ?? REPORT_TEMPLATE.id,
    ...(options.templateVersionId !== undefined && { templateVersionId: options.templateVersionId }),
    ...(options.companyId !== undefined && { companyId: options.companyId }),
    templateName: options.templateName ?? REPORT_TEMPLATE.name,
    partnerId: "",
    partner: {
      id: "",
      name: "",
      contactPerson: "",
      street: "",
      city: "",
      phone: "",
      mobile: "",
      email: "",
      web: ""
    },
    projectInfo: {
      projectNumber: "",
      auftragserteilung: "",
      appointmentDate: "",
      technicianName: "",
      firstReportBy: "",
      locationObject: ""
    },
    contacts: {
      name1: "",
      name2: "",
      street1: "",
      street2: "",
      city1: "",
      city2: "",
      phone1: "",
      phone2: "",
      mobile1: "",
      mobile2: "",
      email: ""
    },
    damageChecklist: {
      flags: buildFlagMap(DAMAGE_OPTIONS.map((item) => item.key)),
      notes: ""
    },
    attendees: {
      flags: buildFlagMap(ATTENDEE_OPTIONS.map((item) => item.key)),
      notes: ""
    },
    findings: {
      causeFound: false,
      causeExposed: false,
      temporarySeal: false,
      ursacheGefunden: false,
      summary: ""
    },
    actions: {
      agreedWith: "",
      coordinateWith: "",
      flags: buildFlagMap(ACTION_OPTIONS.map((item) => item.key)),
      demontageDetails: "",
      notes: ""
    },
    techniques: [],
    photos: [],
    billing: {
      from: "",
      to: "",
      workingTimeHours: ""
    },
    templateFields: {},
    signature: {
      technicianName: "",
      signedAt: ""
    },
    status: "draft",
    createdBy: uid,
    createdAt: now,
    updatedAt: now
  };
};

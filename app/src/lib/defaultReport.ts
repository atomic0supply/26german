import { ACTION_OPTIONS, ATTENDEE_OPTIONS, DAMAGE_OPTIONS, REPORT_TEMPLATE } from "../constants";
import { CompanyId, ReportData } from "../types";

const buildFlagMap = <T extends string>(keys: T[]) =>
  keys.reduce(
    (acc, key) => {
      acc[key] = false;
      return acc;
    },
    {} as Record<T, boolean>
  );

export const createDefaultReport = (uid: string, companyId?: CompanyId): ReportData => {
  const now = new Date().toISOString();

  return {
    clientId: "",
    brandTemplateId: REPORT_TEMPLATE.id,
    companyId,
    templateName: REPORT_TEMPLATE.name,
    projectInfo: {
      projectNumber: "",
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

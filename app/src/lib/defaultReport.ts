import { ATTENDEE_OPTIONS, ACTION_OPTIONS, DAMAGE_OPTIONS, TEMPLATE_FIELD_DEFINITIONS } from "../constants";
import { ReportData, TemplateId } from "../types";

const buildFlagMap = <T extends string>(keys: T[]) =>
  keys.reduce(
    (acc, key) => {
      acc[key] = false;
      return acc;
    },
    {} as Record<T, boolean>
  );

export const createDefaultReport = (uid: string, template: TemplateId = "svt"): ReportData => {
  const now = new Date().toISOString();
  const templateFields = TEMPLATE_FIELD_DEFINITIONS.reduce<Record<string, string | boolean>>((acc, field) => {
    acc[field.key] = field.type === "checkbox" ? false : "";
    return acc;
  }, {});

  return {
    clientId: "",
    brandTemplateId: template,
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
    templateFields,
    templateAssetPaths: {},
    templateAssetUrls: {},
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

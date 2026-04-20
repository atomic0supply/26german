import { ReportData, ReportPhoto, TemplateFieldValue } from "../types";
import { createDefaultReport } from "./defaultReport";

export const toIsoString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
  }

  return new Date().toISOString();
};

const normalizePhotos = (value: unknown): ReportPhoto[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((photo, index) => {
      if (!photo || typeof photo !== "object") {
        return null;
      }

      const source = photo as Partial<ReportPhoto>;
      return {
        id: source.id ?? `${index}`,
        slot: source.slot ?? index + 1,
        location: source.location ?? "",
        documentation: source.documentation ?? "",
        storagePath: source.storagePath ?? "",
        downloadUrl: source.downloadUrl ?? "",
        uploadedAt: source.uploadedAt ?? new Date().toISOString()
      };
    })
    .filter((item): item is ReportPhoto => item !== null);
};

const normalizeTemplateFields = (value: unknown): Record<string, TemplateFieldValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Record<string, TemplateFieldValue> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (typeof raw === "string" || typeof raw === "boolean") {
      next[key] = raw;
      return;
    }

    if (typeof raw === "number") {
      next[key] = String(raw);
    }
  });

  return next;
};

export const normalizeReportData = (raw: unknown): ReportData => {
  const source = (raw ?? {}) as Partial<ReportData>;
  const fallback = createDefaultReport(source.createdBy ?? "");

  return {
    ...fallback,
    ...source,
    brandTemplateId: fallback.brandTemplateId,
    templateName: source.templateName ?? fallback.templateName,
    clientId: source.clientId ?? fallback.clientId,
    projectInfo: { ...fallback.projectInfo, ...(source.projectInfo ?? {}) },
    contacts: { ...fallback.contacts, ...(source.contacts ?? {}) },
    damageChecklist: {
      ...fallback.damageChecklist,
      ...(source.damageChecklist ?? {}),
      flags: {
        ...fallback.damageChecklist.flags,
        ...(source.damageChecklist?.flags ?? {})
      }
    },
    attendees: {
      ...fallback.attendees,
      ...(source.attendees ?? {}),
      flags: {
        ...fallback.attendees.flags,
        ...(source.attendees?.flags ?? {})
      }
    },
    findings: { ...fallback.findings, ...(source.findings ?? {}) },
    actions: {
      ...fallback.actions,
      ...(source.actions ?? {}),
      flags: {
        ...fallback.actions.flags,
        ...(source.actions?.flags ?? {})
      }
    },
    techniques: Array.isArray(source.techniques) ? source.techniques : fallback.techniques,
    photos: normalizePhotos(source.photos),
    billing: { ...fallback.billing, ...(source.billing ?? {}) },
    templateFields: {
      ...fallback.templateFields,
      ...normalizeTemplateFields(source.templateFields)
    },
    signature: { ...fallback.signature, ...(source.signature ?? {}) },
    createdAt: toIsoString(source.createdAt ?? fallback.createdAt),
    updatedAt: toIsoString(source.updatedAt ?? fallback.updatedAt),
    finalization: source.finalization
      ? {
          ...source.finalization,
          finalizedAt: toIsoString(source.finalization.finalizedAt)
        }
      : undefined
  };
};

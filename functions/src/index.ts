import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { randomUUID } from "node:crypto";
import { sha256 } from "./hash";
import { extractTemplateFieldSchema, renderDynamicReportPdf, renderReportPdf } from "./pdf";
import { REPORT_TEMPLATE_ALL, REPORT_TEMPLATE_LECKORTUNG, REPORT_TEMPLATE_PROK } from "./templates";
import type { TemplateConfig } from "./types";
import {
  BuiltinTemplateId,
  ClientData,
  ReportData,
  SuggestTemplateSchemaResult,
  TemplateSummary,
  TemplateVersion,
  UserRole
} from "./types";
import { validateReportForFinalize } from "./validation";

initializeApp();
setGlobalOptions({
  region: "europe-west3",
  maxInstances: 10,
  // v2 callable functions need public HTTP ingress so browser preflight requests
  // can reach the function before Firebase auth/role checks run inside the handler.
  invoker: "public"
});

const db = getFirestore();

let bucket: Bucket | null | undefined;

const getBucket = () => {
  if (bucket === undefined) {
    try {
      const storage = getStorage();
      const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
      bucket = fromEnv ? storage.bucket(fromEnv) : storage.bucket();
    } catch (error) {
      logger.warn("Cloud Storage bucket is not configured; preview/finalize will fail.", {
        error: error instanceof Error ? error.message : String(error)
      });
      bucket = null;
    }
  }

  return bucket ?? undefined;
};

const requireBucket = () => {
  const storageBucket = getBucket();
  if (!storageBucket) {
    throw new HttpsError("failed-precondition", "STORAGE_BUCKET_NOT_CONFIGURED");
  }

  return storageBucket;
};

type Mailer = {
  transporter: import("nodemailer").Transporter;
  from: string;
};

type EmailTemplateConfig = {
  emailSignature: string;
  signatureLogoUrl: string;
  signatureLogoPosition: "above" | "below" | "left" | "right";
  appointmentEmailSubject: string;
  appointmentEmailBody: string;
  reportEmailSubject: string;
  reportEmailBody: string;
  leckortungEmailSubject: string;
  leckortungEmailBody: string;
};

const DEFAULT_EMAIL_SIGNATURE = [
  "Mit freundlichen Grüßen,",
  "{{senderName}}"
].join("\n");

const DEFAULT_APPOINTMENT_EMAIL_SUBJECT = "Terminbestätigung - {{appointmentDate}}";
const DEFAULT_APPOINTMENT_EMAIL_BODY = [
  "Guten Tag {{clientName}},",
  "",
  "hiermit bestätigen wir Ihren Termin am {{appointmentDate}}.",
  "Einsatzort: {{locationObject}}",
  "Techniker: {{technicianName}}",
  "",
  "Bei Rückfragen antworten Sie bitte auf diese E-Mail.",
  "",
  "{{signature}}"
].join("\n");

const DEFAULT_REPORT_EMAIL_SUBJECT = "Einsatzbericht {{projectNumber}}";
const DEFAULT_REPORT_EMAIL_BODY = [
  "Guten Tag {{clientName}},",
  "",
  "anbei erhalten Sie den Einsatzbericht zum durchgeführten Termin.",
  "",
  "Projekt: {{projectNumber}}",
  "Einsatzort: {{locationObject}}",
  "Techniker: {{technicianName}}",
  "",
  "{{signature}}"
].join("\n");

const DEFAULT_LECKORTUNG_EMAIL_SUBJECT = "Leckortung {{projectNumber}}";
const DEFAULT_LECKORTUNG_EMAIL_BODY = [
  "Guten Tag {{clientName}},",
  "",
  "anbei erhalten Sie das ausgefüllte Leckortung-Formular zum durchgeführten Termin.",
  "",
  "Projekt: {{projectNumber}}",
  "Einsatzort: {{locationObject}}",
  "Techniker: {{technicianName}}",
  "",
  "{{signature}}"
].join("\n");

const getEmailTemplateConfig = (data?: Record<string, unknown> | null): EmailTemplateConfig => ({
  emailSignature: String(data?.emailSignature ?? DEFAULT_EMAIL_SIGNATURE),
  signatureLogoUrl: String(data?.signatureLogoUrl ?? ""),
  signatureLogoPosition: (["above", "below", "left", "right"].includes(String(data?.signatureLogoPosition))
    ? String(data?.signatureLogoPosition)
    : "below") as "above" | "below" | "left" | "right",
  appointmentEmailSubject: String(data?.appointmentEmailSubject ?? DEFAULT_APPOINTMENT_EMAIL_SUBJECT),
  appointmentEmailBody: String(data?.appointmentEmailBody ?? DEFAULT_APPOINTMENT_EMAIL_BODY),
  reportEmailSubject: String(data?.reportEmailSubject ?? DEFAULT_REPORT_EMAIL_SUBJECT),
  reportEmailBody: String(data?.reportEmailBody ?? DEFAULT_REPORT_EMAIL_BODY),
  leckortungEmailSubject: String(data?.leckortungEmailSubject ?? DEFAULT_LECKORTUNG_EMAIL_SUBJECT),
  leckortungEmailBody: String(data?.leckortungEmailBody ?? DEFAULT_LECKORTUNG_EMAIL_BODY),
});

/**
 * Builds an HTML version of the email body for clients that support it.
 * The plain-text body is still sent in the `text` field as a fallback.
 */
const buildHtmlEmail = (body: string, signatureLogoUrl?: string, logoPosition?: string): string => {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const bodyHtml = escapeHtml(body)
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p style="margin:0 0 4px">${line}</p>`))
    .join("\n");

  const logoUrl = signatureLogoUrl?.trim();
  if (!logoUrl) {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px">
${bodyHtml}
</body></html>`;
  }

  const logoImg = `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="max-height:72px;max-width:200px;object-fit:contain;display:block" />`;

  let signatureBlock: string;
  switch (logoPosition) {
    case "above":
      signatureBlock = `<div style="margin-top:24px">${logoImg}<div style="margin-top:10px">${bodyHtml}</div></div>`;
      break;
    case "left":
      signatureBlock = `<table style="margin-top:24px;border-collapse:collapse"><tr>
        <td style="vertical-align:top;padding-right:16px">${logoImg}</td>
        <td style="vertical-align:top">${bodyHtml}</td>
      </tr></table>`;
      break;
    case "right":
      signatureBlock = `<table style="margin-top:24px;border-collapse:collapse"><tr>
        <td style="vertical-align:top;padding-right:16px">${bodyHtml}</td>
        <td style="vertical-align:top">${logoImg}</td>
      </tr></table>`;
      break;
    default: // "below"
      signatureBlock = `<div style="margin-top:24px">${bodyHtml}<div style="margin-top:12px">${logoImg}</div></div>`;
  }

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px">
${signatureBlock}
</body></html>`;
};

const fillTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");

const formatAppointmentDate = (value: string | undefined) => {
  if (!value?.trim()) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
};

const getMailer = async (): Promise<Mailer | null> => {
  let host = process.env.SMTP_HOST;
  let port = Number(process.env.SMTP_PORT ?? "587");
  let user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS;
  let from = process.env.SMTP_FROM ?? user;

  // Firestore config takes precedence over env vars
  try {
    const snap = await db.doc("config/smtp").get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.host) host = String(d.host);
      if (d.port) port = Number(d.port);
      if (d.user) user = String(d.user);
      if (d.pass) pass = String(d.pass);
      if (d.from) from = String(d.from);
    }
  } catch {
    // ignore — fall back to env vars
  }

  if (!host || Number.isNaN(port) || !user || !pass || !from) {
    return null;
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  return { transporter, from };
};

const getActiveUserRole = async (uid: string): Promise<UserRole> => {
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data();
  const role = String(data?.role ?? "");

  if (!userSnap.exists || data?.active !== true || !["technician", "admin", "office"].includes(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }

  return role as UserRole;
};

const assertAdmin = async (uid: string) => {
  const role = await getActiveUserRole(uid);
  if (role !== "admin") {
    throw new HttpsError("permission-denied", "ADMIN_REQUIRED");
  }
};

const canReadAcrossTeam = (role: UserRole) => role === "admin" || role === "office";

const assertOwnReport = (uid: string, report: ReportData) => {
  if (report.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const assertCanReadReport = (uid: string, role: UserRole, report: ReportData) => {
  if (report.createdBy !== uid && !canReadAcrossTeam(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const assertCanReadClient = (uid: string, role: UserRole, client: ClientData) => {
  if (client.createdBy !== uid && !canReadAcrossTeam(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const toPdfRenderError = (error: unknown): HttpsError => {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.startsWith("MAPPED_FIELD_NOT_FOUND:")
    || message.startsWith("MAPPED_OPTION_NOT_FOUND:")
    || message.startsWith("TEMPLATE_PDF_NOT_FOUND:")
    || message.startsWith("IMAGE_FIELD_NOT_SUPPORTED:")
    || message === "STORAGE_BUCKET_NOT_CONFIGURED"
  ) {
    return new HttpsError("failed-precondition", message);
  }

  return new HttpsError("internal", "PDF_RENDER_FAILED");
};

const BUILTIN_TEMPLATE_IDS: BuiltinTemplateId[] = ["svt", "leckortung"];

const isBuiltinTemplateId = (templateId: string | undefined): templateId is BuiltinTemplateId =>
  Boolean(templateId && BUILTIN_TEMPLATE_IDS.includes(templateId as BuiltinTemplateId));

const normalizeIsoString = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
  }

  return "";
};

const normalizeTemplateSummary = (
  id: string,
  data: Record<string, unknown> | undefined | null
): TemplateSummary => ({
  id,
  name: String(data?.name ?? ""),
  brand: String(data?.brand ?? ""),
  createdBy: String(data?.createdBy ?? ""),
  createdAt: normalizeIsoString(data?.createdAt),
  updatedAt: normalizeIsoString(data?.updatedAt),
  publishedVersionId: String(data?.publishedVersionId ?? "").trim() || undefined,
  latestDraftVersionId: String(data?.latestDraftVersionId ?? "").trim() || undefined,
  status: data?.status === "draft" ? "draft" : "published"
});

const normalizeTemplateVersion = (
  id: string,
  data: Record<string, unknown> | undefined | null
): TemplateVersion => ({
  id,
  templateId: String(data?.templateId ?? ""),
  basePdfPath: String(data?.basePdfPath ?? ""),
  editablePdfPath: String(data?.editablePdfPath ?? "").trim() || undefined,
  fieldSchema: Array.isArray(data?.fieldSchema) ? data?.fieldSchema as TemplateVersion["fieldSchema"] : [],
  versionNumber: Number(data?.versionNumber ?? 1) || 1,
  createdBy: String(data?.createdBy ?? ""),
  createdAt: normalizeIsoString(data?.createdAt),
  publishedAt: normalizeIsoString(data?.publishedAt) || undefined,
  publishedBy: String(data?.publishedBy ?? "").trim() || undefined,
  status: data?.status === "draft" ? "draft" : "published",
  schemaSource: data?.schemaSource === "ai" || data?.schemaSource === "mixed" ? data.schemaSource : "manual",
  schemaGeneratedAt: normalizeIsoString(data?.schemaGeneratedAt) || undefined,
  schemaModel: String(data?.schemaModel ?? "").trim() || undefined,
  schemaWarnings: Array.isArray(data?.schemaWarnings)
    ? data.schemaWarnings.map((item) => String(item))
    : []
});

const resolveBuiltinTemplate = (report: ReportData): TemplateConfig => {
  if (report.brandTemplateId === "leckortung") {
    return REPORT_TEMPLATE_LECKORTUNG;
  }

  return report.projectInfo.auftragserteilung?.trim()
    ? REPORT_TEMPLATE_ALL
    : REPORT_TEMPLATE_PROK;
};

const getSignedReadUrl = async (storageBucket: Bucket, path: string) => {
  const [url] = await storageBucket.file(path).getSignedUrl({
    action: "read",
    expires: "2100-01-01"
  });
  return url;
};

const getTemplateSummaryRef = (templateId: string) => db.doc(`templates/${templateId}`);

const getTemplateVersionRef = (templateId: string, versionId: string) =>
  db.doc(`templates/${templateId}/versions/${versionId}`);

const getDynamicTemplateVersion = async (
  report: ReportData,
  role?: UserRole
): Promise<{ summary: TemplateSummary; version: TemplateVersion }> => {
  const templateId = String(report.brandTemplateId ?? "").trim();
  const versionId = String(report.templateVersionId ?? "").trim();

  if (!templateId || !versionId) {
    throw new HttpsError("failed-precondition", "DYNAMIC_TEMPLATE_VERSION_MISSING");
  }

  const [summarySnap, versionSnap] = await Promise.all([
    getTemplateSummaryRef(templateId).get(),
    getTemplateVersionRef(templateId, versionId).get()
  ]);

  if (!summarySnap.exists || !versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_VERSION_NOT_FOUND");
  }

  const summary = normalizeTemplateSummary(summarySnap.id, summarySnap.data() as Record<string, unknown>);
  const version = normalizeTemplateVersion(versionSnap.id, versionSnap.data() as Record<string, unknown>);

  if (version.status !== "published" && role && role !== "admin") {
    throw new HttpsError("permission-denied", "TEMPLATE_DRAFT_ADMIN_ONLY");
  }

  return { summary, version };
};

const buildDynamicValidationInputs = (version: TemplateVersion) => ({
  requiredTemplateFields: version.fieldSchema
    .filter((field) => field.includeInForm && field.required && field.type !== "signature" && field.type !== "image")
    .map((field) => `templateFields.${field.id}`)
});

const resolveReportRenderContext = async (
  report: ReportData,
  role?: UserRole
): Promise<
  | { kind: "builtin"; template: TemplateConfig }
  | { kind: "dynamic"; summary: TemplateSummary; version: TemplateVersion }
> => {
  if (isBuiltinTemplateId(report.brandTemplateId)) {
    return { kind: "builtin", template: resolveBuiltinTemplate(report) };
  }

  const dynamicTemplate = await getDynamicTemplateVersion(report, role);
  return { kind: "dynamic", ...dynamicTemplate };
};

export const finalizeReport = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  const role = await getActiveUserRole(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  let report = reportSnap.data() as ReportData;
  assertOwnReport(uid, report);

  const leckortungFields = request.data?.leckortungFields as Record<string, string> | null | undefined;
  const isLeckortung = Boolean(leckortungFields);

  // Only block re-finalization for the standard (non-LECKORTUNG) flow.
  // LECKORTUNG reports can be (re-)finalized regardless of current status.
  if (!isLeckortung && report.status === "finalized") {
    throw new HttpsError("failed-precondition", "ALREADY_FINALIZED");
  }

  // For LECKORTUNG, persist only the form fields without changing brandTemplateId or status.
  // Build a temporary report copy with brandTemplateId="leckortung" for the PDF render.
  let renderReport = report;
  if (isLeckortung) {
    const fieldUpdates: Record<string, unknown> = {
      "templateFields.auftragnehmer":         leckortungFields!.auftragnehmer ?? "",
      "templateFields.leistung":              leckortungFields!.leistung ?? "",
      "templateFields.hinweis":               leckortungFields!.hinweis ?? "",
      "templateFields.ortDatum":              leckortungFields!.ortDatum ?? "",
      "templateFields.customerSignaturePath": leckortungFields!.customerSignaturePath ?? "",
      updatedAt: FieldValue.serverTimestamp()
    };
    if (leckortungFields!.locationObject) fieldUpdates["projectInfo.locationObject"] = leckortungFields!.locationObject;
    if (leckortungFields!.name1)          fieldUpdates["contacts.name1"] = leckortungFields!.name1;
    await reportRef.update(fieldUpdates);
    const refreshed = await reportRef.get();
    const persisted = refreshed.data() as ReportData;

    renderReport = {
      ...persisted,
      brandTemplateId: "leckortung",
      status: "draft"
    };
  }

  const renderContext = await resolveReportRenderContext(renderReport, role);
  let validationRequiredFields: string[];
  let validationOptions: {
    requireSummary?: boolean;
    requireSignature?: boolean;
    requireProjectNumber?: boolean;
    requireAppointmentDate?: boolean;
    requireTechnicianName?: boolean;
  };

  if (renderContext.kind === "builtin") {
    validationRequiredFields = renderContext.template.requiredTemplateFields;
    // LECKORTUNG has its own fields — skip all standard SVT validation rules.
    validationOptions = isLeckortung
      ? {
          requireSummary: false,
          requireProjectNumber: false,
          requireAppointmentDate: false,
          requireTechnicianName: false,
          requireSignature: false
        }
      : { requireSignature: false, requireSummary: false };
  } else {
    const dynInputs = buildDynamicValidationInputs(renderContext.version);
    validationRequiredFields = dynInputs.requiredTemplateFields;
    const requiresSig = renderContext.version.fieldSchema.some(
      (f) => f.type === "signature" && f.required
    );
    validationOptions = { requireSummary: false, requireSignature: requiresSig };
  }

  const validationErrors = validateReportForFinalize(
    renderReport,
    validationRequiredFields,
    validationOptions
  );
  if (validationErrors.length > 0) {
    logger.warn("Finalize validation failed", {
      reportId,
      uid,
      isLeckortung,
      errors: validationErrors
    });
    throw new HttpsError("invalid-argument", validationErrors.join(" "), {
      errors: validationErrors
    });
  }

  const storageBucket = requireBucket();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = renderContext.kind === "builtin"
      ? await renderReportPdf(renderReport, renderContext.template, storageBucket, { flatten: true })
      : await renderDynamicReportPdf(renderReport, renderContext.version, storageBucket, { flatten: true });
  } catch (error) {
    throw toPdfRenderError(error);
  }

  const pdfFileName = isLeckortung ? "leckortung.pdf" : "final.pdf";
  const pdfPath = `report-pdfs/${reportId}/${pdfFileName}`;
  await storageBucket.file(pdfPath).save(Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=0, no-cache"
    }
  });

  const pdfUrl = await getSignedReadUrl(storageBucket, pdfPath);

  const finalizedAt = new Date().toISOString();
  const pdfChecksum = sha256(pdfBytes);
  const finalizationField = isLeckortung ? "leckortungFinalization" : "finalization";
  const previousVersion = Number(
    (isLeckortung ? report.leckortungFinalization?.pdfVersion : report.finalization?.pdfVersion) ?? 0
  );
  const pdfVersion = previousVersion + 1;

  const docUpdate: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    [finalizationField]: {
      finalizedAt,
      finalizedBy: uid,
      pdfPath,
      pdfUrl,
      pdfChecksum,
      pdfVersion
    }
  };
  if (!isLeckortung) {
    docUpdate.status = "finalized";
  }
  await reportRef.update(docUpdate);

  logger.info(isLeckortung ? "Leckortung PDF finalized" : "Report finalized", { reportId, uid });

  return {
    pdfUrl,
    finalizedAt
  };
});

export const previewPdf = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  const role = await getActiveUserRole(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertCanReadReport(uid, role, report);

  const renderContext = await resolveReportRenderContext(report, role);

  const storageBucket = requireBucket();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = renderContext.kind === "builtin"
      ? await renderReportPdf(report, renderContext.template, storageBucket, { flatten: false })
      : await renderDynamicReportPdf(report, renderContext.version, storageBucket, { flatten: false });
  } catch (error) {
    throw toPdfRenderError(error);
  }

  logger.info("Report preview generated", { reportId, uid });

  return {
    previewBase64: Buffer.from(pdfBytes).toString("base64"),
    mimeType: "application/pdf"
  };
});

export const sendReportEmail = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  const requestClientId = String(request.data?.clientId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  const role = await getActiveUserRole(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertCanReadReport(uid, role, report);

  if (report.status !== "finalized") {
    throw new HttpsError("failed-precondition", "REPORT_NOT_FINALIZED");
  }

  const resolvedClientId = requestClientId || report.clientId || "";
  if (!resolvedClientId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: clientId fehlt");
  }

  const clientRef = db.doc(`clients/${resolvedClientId}`);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new HttpsError("not-found", "Kunde nicht gefunden");
  }

  const client = clientSnap.data() as ClientData;
  assertCanReadClient(uid, role, client);

  if (!client.email) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: Kunde ohne E-Mail");
  }

  const mailer = await getMailer();
  if (!mailer) {
    throw new HttpsError("failed-precondition", "SMTP_NOT_CONFIGURED");
  }

  const smtpSnap = await db.doc("config/smtp").get();
  const templateConfig = getEmailTemplateConfig(smtpSnap.exists ? (smtpSnap.data() as Record<string, unknown>) : null);

  const pdfPath = report.finalization?.pdfPath;
  if (!pdfPath) {
    throw new HttpsError("failed-precondition", "PDF_NOT_AVAILABLE");
  }

  const storageBucket = requireBucket();
  const [pdfBuffer] = await storageBucket.file(pdfPath).download();
  const sentAt = new Date().toISOString();
  const filename = `Einsatzbericht-${report.projectInfo?.projectNumber || reportId}.pdf`;
  const clientFullName = [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");
  const senderName = mailer.from;
  const tokens: Record<string, string> = {
    clientName: client.principalContact?.trim() || clientFullName || client.email || "",
    appointmentDate: formatAppointmentDate(report.projectInfo?.appointmentDate),
    locationObject: report.projectInfo?.locationObject || client.location || "",
    technicianName: report.projectInfo?.technicianName || report.signature?.technicianName || "",
    projectNumber: report.projectInfo?.projectNumber || reportId,
    senderName,
    recipientEmail: client.email || ""
  };
  tokens.signature = fillTemplate(templateConfig.emailSignature, tokens);
  
  const subject = fillTemplate(templateConfig.reportEmailSubject, tokens).trim() || fillTemplate(DEFAULT_REPORT_EMAIL_SUBJECT, tokens);
  const text = fillTemplate(templateConfig.reportEmailBody, tokens).trim() || fillTemplate(DEFAULT_REPORT_EMAIL_BODY, tokens);

  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: client.email,
      subject,
      text,
      html: buildHtmlEmail(text, templateConfig.signatureLogoUrl, templateConfig.signatureLogoPosition),
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });
  } catch (smtpErr) {
    const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
    logger.error("SMTP send failed (report)", { reportId, error: msg });
    throw new HttpsError("internal", `SMTP_SEND_FAILED: ${msg}`);
  }

  await reportRef.update({
    clientId: resolvedClientId,
    updatedAt: FieldValue.serverTimestamp(),
    lastEmailDelivery: {
      clientId: resolvedClientId,
      recipient: client.email,
      sentAt
    }
  });

  logger.info("Report email sent", { reportId, uid, clientId: resolvedClientId, recipient: client.email });

  return {
    recipient: client.email,
    sentAt
  };
});

export const sendLeckortungEmail = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  const requestClientId = String(request.data?.clientId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  const role = await getActiveUserRole(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertCanReadReport(uid, role, report);

  const pdfPath = report.leckortungFinalization?.pdfPath;
  if (!pdfPath) {
    throw new HttpsError("failed-precondition", "LECKORTUNG_PDF_NOT_AVAILABLE");
  }

  const resolvedClientId = requestClientId || report.clientId || "";
  if (!resolvedClientId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: clientId fehlt");
  }

  const clientRef = db.doc(`clients/${resolvedClientId}`);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new HttpsError("not-found", "Kunde nicht gefunden");
  }

  const client = clientSnap.data() as ClientData;
  assertCanReadClient(uid, role, client);

  if (!client.email) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: Kunde ohne E-Mail");
  }

  const mailer = await getMailer();
  if (!mailer) {
    throw new HttpsError("failed-precondition", "SMTP_NOT_CONFIGURED");
  }

  const storageBucket = requireBucket();
  const [pdfBuffer] = await storageBucket.file(pdfPath).download();
  const sentAt = new Date().toISOString();
  const filename = `Leckortung-${report.projectInfo?.projectNumber || reportId}.pdf`;
  const clientFullName = [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");
  const senderName = mailer.from;
  const tokens: Record<string, string> = {
    clientName: client.principalContact?.trim() || clientFullName || client.email || "",
    appointmentDate: formatAppointmentDate(report.projectInfo?.appointmentDate),
    locationObject: report.projectInfo?.locationObject || client.location || "",
    technicianName: report.projectInfo?.technicianName || report.signature?.technicianName || "",
    projectNumber: report.projectInfo?.projectNumber || reportId,
    senderName,
    recipientEmail: client.email || ""
  };

  const smtpSnap = await db.doc("config/smtp").get();
  const emailConfig = getEmailTemplateConfig(smtpSnap.exists ? (smtpSnap.data() as Record<string, unknown>) : null);
  tokens.signature = fillTemplate(emailConfig.emailSignature, tokens);

  const emailText = fillTemplate(emailConfig.leckortungEmailBody, tokens);
  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: client.email,
      subject: fillTemplate(emailConfig.leckortungEmailSubject, tokens),
      text: emailText,
      html: buildHtmlEmail(emailText, emailConfig.signatureLogoUrl, emailConfig.signatureLogoPosition),
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });
  } catch (smtpErr) {
    const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
    logger.error("SMTP send failed (leckortung)", { reportId, error: msg });
    throw new HttpsError("internal", `SMTP_SEND_FAILED: ${msg}`);
  }

  await reportRef.update({
    clientId: resolvedClientId,
    updatedAt: FieldValue.serverTimestamp(),
    lastLeckortungEmailDelivery: {
      clientId: resolvedClientId,
      recipient: client.email,
      sentAt
    }
  });

  logger.info("Leckortung email sent", { reportId, uid, clientId: resolvedClientId, recipient: client.email });

  return {
    recipient: client.email,
    sentAt
  };
});

export const sendVisitNotification = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  const role = await getActiveUserRole(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertCanReadReport(uid, role, report);

  const clientId = String(report.clientId ?? "").trim();
  if (!clientId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: clientId fehlt");
  }

  const clientRef = db.doc(`clients/${clientId}`);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) {
    throw new HttpsError("not-found", "Kunde nicht gefunden");
  }

  const client = clientSnap.data() as ClientData;
  assertCanReadClient(uid, role, client);

  if (!client.email) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: Kunde ohne E-Mail");
  }

  const mailer = await getMailer();
  if (!mailer) {
    throw new HttpsError("failed-precondition", "SMTP_NOT_CONFIGURED");
  }

  const appointment = String(report.projectInfo?.appointmentDate ?? "").trim();
  if (!appointment) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: appointmentDate fehlt");
  }


  const sentAt = new Date().toISOString();

  const clientFullName = [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ");
  const tokens: Record<string, string> = {
    clientName: client.principalContact?.trim() || clientFullName || client.email || "",
    appointmentDate: formatAppointmentDate(appointment),
    locationObject: report.projectInfo?.locationObject || client.location || "",
    technicianName: report.projectInfo?.technicianName || report.signature?.technicianName || "",
    projectNumber: report.projectInfo?.projectNumber || reportId,
    senderName: mailer.from,
    recipientEmail: client.email || ""
  };

  const smtpSnap = await db.doc("config/smtp").get();
  const emailConfig = getEmailTemplateConfig(smtpSnap.exists ? (smtpSnap.data() as Record<string, unknown>) : null);
  tokens.signature = fillTemplate(emailConfig.emailSignature, tokens);

  const emailText = fillTemplate(emailConfig.appointmentEmailBody, tokens).trim() || fillTemplate(DEFAULT_APPOINTMENT_EMAIL_BODY, tokens);
  await mailer.transporter.sendMail({
    from: mailer.from,
    to: client.email,
    subject: fillTemplate(emailConfig.appointmentEmailSubject, tokens).trim() || fillTemplate(DEFAULT_APPOINTMENT_EMAIL_SUBJECT, tokens),
    text: emailText,
    html: buildHtmlEmail(emailText, emailConfig.signatureLogoUrl, emailConfig.signatureLogoPosition)
  });

  await reportRef.update({
    updatedAt: FieldValue.serverTimestamp(),
    "templateFields.visitNotificationRecipient": client.email,
    "templateFields.visitNotificationSentAt": sentAt
  });

  logger.info("Visit notification sent", { reportId, uid, clientId, recipient: client.email });

  return {
    recipient: client.email,
    sentAt
  };
});

// ─── Admin: list all users ───────────────────────────────────────────────────
export const listUsers = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const snap = await db.collection("users").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: String(data.email ?? ""),
      displayName: String(data.displayName ?? ""),
      role: String(data.role ?? "technician") as UserRole,
      active: Boolean(data.active ?? false),
      createdAt: data.createdAt ?? null
    };
  });
});

// ─── Admin: create user ───────────────────────────────────────────────────────
export const createUser = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const { email, password, displayName, role } = request.data as {
    email: string;
    password: string;
    displayName: string;
    role: UserRole;
  };

  if (!email || !password || !role) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: email, password y role son obligatorios");
  }

  const validRoles: UserRole[] = ["technician", "admin", "office"];
  if (!validRoles.includes(role)) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: rol no válido");
  }

  const authUser = await getAuth().createUser({ email, password, displayName: displayName || email });

  await db.doc(`users/${authUser.uid}`).set({
    email,
    displayName: displayName || email,
    role,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  logger.info("User created by admin", { newUid: authUser.uid, role, createdBy: uid });

  return { uid: authUser.uid };
});

// ─── Admin: update user ───────────────────────────────────────────────────────
export const updateUser = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const { targetUid, displayName, role, active } = request.data as {
    targetUid: string;
    displayName?: string;
    role?: UserRole;
    active?: boolean;
  };

  if (!targetUid) throw new HttpsError("invalid-argument", "VALIDATION_FAILED: targetUid obligatorio");

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (displayName !== undefined) updates.displayName = displayName;
  if (role !== undefined) updates.role = role;
  if (active !== undefined) updates.active = active;

  await db.doc(`users/${targetUid}`).update(updates);

  if (displayName !== undefined) {
    await getAuth().updateUser(targetUid, { displayName });
  }

  logger.info("User updated by admin", { targetUid, updates: Object.keys(updates), updatedBy: uid });

  return { ok: true };
});

// ─── Admin: delete user ───────────────────────────────────────────────────────
export const deleteUser = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const { targetUid } = request.data as { targetUid: string };
  if (!targetUid) throw new HttpsError("invalid-argument", "VALIDATION_FAILED: targetUid obligatorio");
  if (targetUid === uid) throw new HttpsError("invalid-argument", "No puedes eliminarte a ti mismo");

  await getAuth().deleteUser(targetUid);
  await db.doc(`users/${targetUid}`).delete();

  logger.info("User deleted by admin", { targetUid, deletedBy: uid });

  return { ok: true };
});

// ─── Admin: get SMTP config (password masked) ─────────────────────────────────
export const getSmtpConfig = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const snap = await db.doc("config/smtp").get();
  const templateConfig = getEmailTemplateConfig(snap.exists ? (snap.data() as Record<string, unknown>) : null);
  if (!snap.exists) {
    return {
      configured: false,
      host: "",
      port: 587,
      user: "",
      from: "",
      hasPass: false,
      ...templateConfig
    };
  }

  const d = snap.data()!;
  return {
    configured: Boolean(d.host && d.user && d.pass),
    host: String(d.host ?? ""),
    port: Number(d.port ?? 587),
    user: String(d.user ?? ""),
    from: String(d.from ?? ""),
    hasPass: Boolean(d.pass),
    ...templateConfig
  };
});

// ─── Admin: save SMTP config ──────────────────────────────────────────────────
export const saveSmtpConfig = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const { host, port, user, pass, from, emailSignature, signatureLogoUrl, signatureLogoPosition, appointmentEmailSubject, appointmentEmailBody, reportEmailSubject, reportEmailBody, leckortungEmailSubject, leckortungEmailBody } = request.data as {
    host: string;
    port: number;
    user: string;
    pass?: string;
    from?: string;
    emailSignature?: string;
    signatureLogoUrl?: string;
    signatureLogoPosition?: string;
    appointmentEmailSubject?: string;
    appointmentEmailBody?: string;
    reportEmailSubject?: string;
    reportEmailBody?: string;
    leckortungEmailSubject?: string;
    leckortungEmailBody?: string;
  };

  if (!host || !user) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: host y user son obligatorios");
  }

  const snap = await db.doc("config/smtp").get();
  const existing = snap.exists ? snap.data()! : {};

  const payload: Record<string, unknown> = {
    host,
    port: port || 587,
    user,
    from: from || user,
    emailSignature: String(emailSignature ?? DEFAULT_EMAIL_SIGNATURE),
    signatureLogoUrl: String(signatureLogoUrl ?? ""),
    signatureLogoPosition: String(signatureLogoPosition ?? "below"),
    appointmentEmailSubject: String(appointmentEmailSubject ?? DEFAULT_APPOINTMENT_EMAIL_SUBJECT),
    appointmentEmailBody: String(appointmentEmailBody ?? DEFAULT_APPOINTMENT_EMAIL_BODY),
    reportEmailSubject: String(reportEmailSubject ?? DEFAULT_REPORT_EMAIL_SUBJECT),
    reportEmailBody: String(reportEmailBody ?? DEFAULT_REPORT_EMAIL_BODY),
    leckortungEmailSubject: String(leckortungEmailSubject ?? DEFAULT_LECKORTUNG_EMAIL_SUBJECT),
    leckortungEmailBody: String(leckortungEmailBody ?? DEFAULT_LECKORTUNG_EMAIL_BODY),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid
  };

  // Only overwrite pass if a new one is provided
  if (pass && pass.trim()) {
    payload.pass = pass;
  } else if (!existing.pass) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: contraseña obligatoria en la primera configuración");
  }

  await db.doc("config/smtp").set(payload, { merge: true });

  logger.info("SMTP config updated by admin", { updatedBy: uid });

  return { ok: true };
});

// ─── Admin: send test email ───────────────────────────────────────────────────
export const sendTestEmail = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const { subject, body, signature } = request.data as {
    subject: string;
    body: string;
    signature: string;
  };

  const mailer = await getMailer();
  if (!mailer) {
    throw new HttpsError("failed-precondition", "SMTP_NOT_CONFIGURED");
  }

  // Get recipient email from the logged-in admin user
  const userRecord = await getAuth().getUser(uid);
  const recipientEmail = userRecord.email;

  if (!recipientEmail) {
    throw new HttpsError("invalid-argument", "TEST_EMAIL_NO_RECIPIENT");
  }

  const tokens: Record<string, string> = {
    clientName: "Aqua Radar GmbH",
    appointmentDate: new Date().toLocaleDateString("de-DE") + " 14:00",
    locationObject: "Musterstraße 1, 10115 Berlin",
    technicianName: "Alex Techniker",
    projectNumber: "TEST-000000",
    senderName: mailer.from,
    recipientEmail
  };

  tokens.signature = fillTemplate(signature || "", tokens);

  const finalSubject = fillTemplate(subject || "Test Email", tokens);
  const finalBody = fillTemplate(body || "This is a test email.", tokens);

  // Fetch logo URL for the test email preview
  const smtpSnap = await db.doc("config/smtp").get();
  const emailConfig = getEmailTemplateConfig(smtpSnap.exists ? (smtpSnap.data() as Record<string, unknown>) : null);

  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: recipientEmail,
      subject: finalSubject,
      text: finalBody,
      html: buildHtmlEmail(finalBody, emailConfig.signatureLogoUrl, emailConfig.signatureLogoPosition)
    });
  } catch (smtpErr) {
    const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
    logger.error("SMTP test send failed", { uid, error: msg });
    throw new HttpsError("internal", `SMTP_SEND_FAILED: ${msg}`);
  }

  logger.info("Test email sent", { uid, recipient: recipientEmail });
  return { ok: true, recipient: recipientEmail };
});

// ─── Admin: app status ────────────────────────────────────────────────────────
export const getAppStatus = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const [usersSnap, reportsSnap, smtpSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("reports").get(),
    db.doc("config/smtp").get()
  ]);

  const usersByRole = { technician: 0, admin: 0, office: 0, inactive: 0 };
  for (const d of usersSnap.docs) {
    const data = d.data();
    if (data.active !== true) {
      usersByRole.inactive++;
    } else if (data.role === "admin") {
      usersByRole.admin++;
    } else if (data.role === "office") {
      usersByRole.office++;
    } else {
      usersByRole.technician++;
    }
  }

  const reportsByStatus = { draft: 0, finalized: 0 };
  for (const d of reportsSnap.docs) {
    if (d.data().status === "finalized") reportsByStatus.finalized++;
    else reportsByStatus.draft++;
  }

  const smtpData = smtpSnap.exists ? smtpSnap.data()! : {};
  const smtpConfigured = Boolean(smtpData.host && smtpData.user && smtpData.pass);

  return {
    users: { total: usersSnap.size, byRole: usersByRole },
    reports: { total: reportsSnap.size, byStatus: reportsByStatus },
    smtp: { configured: smtpConfigured }
  };
});

const slugifyTemplateName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "template";

const getTemplateSchemaWarnings = (version: TemplateVersion) =>
  version.fieldSchema
    .filter((field) => field.type === "image")
    .map((field) => `IMAGE_FIELD_PENDING:${field.pdfFieldName}`);

const readSchemaFromStorage = async (storageBucket: Bucket, path: string): Promise<SuggestTemplateSchemaResult> => {
  const [bytes] = await storageBucket.file(path).download();
  const fieldSchema = await extractTemplateFieldSchema(bytes);
  const warnings = fieldSchema
    .filter((field) => field.type === "image")
    .map((field) => `IMAGE_FIELD_PENDING:${field.pdfFieldName}`);

  return {
    fieldSchema,
    summary: `${fieldSchema.length} fields extracted from AcroForm`,
    model: "manual-acroform",
    generatedAt: new Date().toISOString(),
    warnings,
    schemaSource: "manual"
  };
};

export const extractPdfTemplateSchema = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertAdmin(uid);

  const importPath = String(request.data?.importPath ?? "").trim();
  if (!importPath) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: importPath obligatorio");
  }

  const storageBucket = requireBucket();
  return readSchemaFromStorage(storageBucket, importPath);
});

export const createTemplateDraft = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertAdmin(uid);

  const name = String(request.data?.name ?? "").trim();
  const brand = String(request.data?.brand ?? "").trim();
  const importPath = String(request.data?.importPath ?? "").trim();
  const existingTemplateId = String(request.data?.templateId ?? "").trim();

  if (!name || !brand || !importPath) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: name, brand e importPath son obligatorios");
  }

  const storageBucket = requireBucket();
  const schemaResult = await readSchemaFromStorage(storageBucket, importPath);
  const templateId = existingTemplateId || `${slugifyTemplateName(name)}-${randomUUID().slice(0, 8)}`;
  const summaryRef = getTemplateSummaryRef(templateId);
  const summarySnap = await summaryRef.get();
  const summary = summarySnap.exists
    ? normalizeTemplateSummary(summarySnap.id, summarySnap.data() as Record<string, unknown>)
    : null;
  const versionNumber = summary ? Number((summarySnap.data() as Record<string, unknown>)?.versionNumber ?? 0) + 1 : 1;
  const versionId = `v${versionNumber}`;
  const basePdfPath = `templates/${templateId}/versions/${versionId}/source.pdf`;

  await storageBucket.file(importPath).copy(storageBucket.file(basePdfPath));
  await storageBucket.file(importPath).delete({ ignoreNotFound: true });

  const versionPayload: Record<string, unknown> = {
    templateId,
    basePdfPath,
    fieldSchema: schemaResult.fieldSchema,
    versionNumber,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    status: "draft",
    schemaSource: schemaResult.schemaSource,
    schemaGeneratedAt: schemaResult.generatedAt,
    schemaModel: schemaResult.model,
    schemaWarnings: schemaResult.warnings
  };

  await getTemplateVersionRef(templateId, versionId).set(versionPayload, { merge: true });
  await summaryRef.set({
    name,
    brand,
    createdBy: summary?.createdBy || uid,
    createdAt: summary?.createdAt ? summarySnap.get("createdAt") : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    latestDraftVersionId: versionId,
    publishedVersionId: summary?.publishedVersionId ?? null,
    status: "draft",
    versionNumber
  }, { merge: true });

  const versionSnap = await getTemplateVersionRef(templateId, versionId).get();
  const createdSummarySnap = await summaryRef.get();
  const createdVersion = normalizeTemplateVersion(versionSnap.id, versionSnap.data() as Record<string, unknown>);
  const createdSummary = normalizeTemplateSummary(createdSummarySnap.id, createdSummarySnap.data() as Record<string, unknown>);

  return {
    summary: createdSummary,
    version: {
      ...createdVersion,
      pdfUrl: await getSignedReadUrl(storageBucket, basePdfPath)
    }
  };
});

export const updateTemplateVersionSchema = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertAdmin(uid);

  const templateId = String(request.data?.templateId ?? "").trim();
  const versionId = String(request.data?.versionId ?? "").trim();
  const fieldSchema = Array.isArray(request.data?.fieldSchema) ? request.data.fieldSchema : null;

  if (!templateId || !versionId || !fieldSchema) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: templateId, versionId y fieldSchema son obligatorios");
  }

  const versionRef = getTemplateVersionRef(templateId, versionId);
  const versionSnap = await versionRef.get();
  if (!versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_VERSION_NOT_FOUND");
  }

  const version = normalizeTemplateVersion(versionSnap.id, versionSnap.data() as Record<string, unknown>);
  if (version.status !== "draft") {
    throw new HttpsError("failed-precondition", "TEMPLATE_VERSION_IMMUTABLE");
  }

  await versionRef.update({
    fieldSchema,
    schemaWarnings: getTemplateSchemaWarnings({ ...version, fieldSchema }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid
  });
  await getTemplateSummaryRef(templateId).set({
    updatedAt: FieldValue.serverTimestamp(),
    latestDraftVersionId: versionId,
    status: "draft"
  }, { merge: true });

  return { ok: true };
});

export const publishTemplateVersion = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertAdmin(uid);

  const templateId = String(request.data?.templateId ?? "").trim();
  const versionId = String(request.data?.versionId ?? "").trim();
  if (!templateId || !versionId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: templateId y versionId son obligatorios");
  }

  const versionRef = getTemplateVersionRef(templateId, versionId);
  const versionSnap = await versionRef.get();
  if (!versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_VERSION_NOT_FOUND");
  }

  await versionRef.set({
    status: "published",
    publishedAt: FieldValue.serverTimestamp(),
    publishedBy: uid
  }, { merge: true });
  await getTemplateSummaryRef(templateId).set({
    publishedVersionId: versionId,
    latestDraftVersionId: versionId,
    status: "published",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true };
});

export const listTemplates = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const role = await getActiveUserRole(uid);
  const snap = await db.collection("templates").get();
  const templates = snap.docs
    .map((docItem) => normalizeTemplateSummary(docItem.id, docItem.data() as Record<string, unknown>))
    .filter((item) => role === "admin" || item.status === "published")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return templates;
});

export const getTemplateVersion = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const role = await getActiveUserRole(uid);
  const templateId = String(request.data?.templateId ?? "").trim();
  const requestedVersionId = String(request.data?.versionId ?? "").trim();
  if (!templateId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: templateId obligatorio");
  }

  const summarySnap = await getTemplateSummaryRef(templateId).get();
  if (!summarySnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_NOT_FOUND");
  }

  const summary = normalizeTemplateSummary(summarySnap.id, summarySnap.data() as Record<string, unknown>);
  const versionId = requestedVersionId || (role === "admin" ? summary.latestDraftVersionId : summary.publishedVersionId);
  if (!versionId) {
    throw new HttpsError("not-found", "TEMPLATE_VERSION_NOT_FOUND");
  }

  const versionSnap = await getTemplateVersionRef(templateId, versionId).get();
  if (!versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_VERSION_NOT_FOUND");
  }

  const version = normalizeTemplateVersion(versionSnap.id, versionSnap.data() as Record<string, unknown>);
  if (version.status !== "published" && role !== "admin") {
    throw new HttpsError("permission-denied", "TEMPLATE_DRAFT_ADMIN_ONLY");
  }

  const storageBucket = requireBucket();
  return {
    summary,
    version: {
      ...version,
      pdfUrl: await getSignedReadUrl(storageBucket, version.basePdfPath)
    }
  };
});

// ---------------------------------------------------------------------------
// IA — Configuración de Gemini
// ---------------------------------------------------------------------------

const ALLOWED_TEXT_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];
const ALLOWED_VISION_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"];

const DEFAULT_AI_CONFIG = {
  textModel: "gemini-2.5-flash-lite",
  visionModel: "gemini-2.5-flash",
  hasKey: false
};

export const getAiConfig = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  await assertAdmin(uid);

  const snap = await db.doc("config/ai").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;

  const data = snap.data()!;
  return {
    textModel: data.textModel ?? DEFAULT_AI_CONFIG.textModel,
    visionModel: data.visionModel ?? DEFAULT_AI_CONFIG.visionModel,
    hasKey: Boolean(data.apiKey),
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy
  };
});

export const saveAiConfig = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  await assertAdmin(uid);

  const { apiKey, textModel, visionModel } = request.data as {
    apiKey?: string;
    textModel: string;
    visionModel: string;
  };

  if (!ALLOWED_TEXT_MODELS.includes(textModel)) {
    throw new HttpsError("invalid-argument", `INVALID_TEXT_MODEL:${textModel}`);
  }
  if (!ALLOWED_VISION_MODELS.includes(visionModel)) {
    throw new HttpsError("invalid-argument", `INVALID_VISION_MODEL:${visionModel}`);
  }

  const payload: Record<string, unknown> = {
    textModel,
    visionModel,
    updatedAt: new Date().toISOString(),
    updatedBy: uid
  };

  // Solo actualizar la API key si se proporciona un valor no vacío
  if (apiKey && apiKey.trim()) {
    payload.apiKey = apiKey.trim();
  }

  await db.doc("config/ai").set(payload, { merge: true });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IA — Prompts
// ---------------------------------------------------------------------------

import type { AiPrompt } from "./types";

const DEFAULT_PROMPTS: AiPrompt[] = [
  {
    id: "photo_description",
    name: "Mejorar texto de foto",
    description: "Mejora el texto escrito por el técnico: corrige el alemán, añade terminología técnica y lo hace más profesional",
    content: "Eres un asistente técnico especializado en informes de fontanería y detección de fugas. El técnico ha escrito la siguiente observación sobre la foto de inspección: \"{{userText}}\". Mejora este texto: corrígelo gramaticalmente en alemán, usa terminología técnica precisa de instalaciones sanitarias/fontanería, hazlo más profesional y claro. Devuelve ÚNICAMENTE el texto mejorado, sin explicaciones ni comentarios adicionales.",
    purpose: "photo_description",
    isDefault: true,
    isActive: true,
    version: "1.0"
  },
  {
    id: "damage_summary",
    name: "Resumen de daños",
    description: "Genera un resumen técnico del daño para el campo Einsatzbericht",
    content: "Basándote en los siguientes datos del informe, redacta en alemán un resumen técnico profesional del daño y los trabajos realizados. Daño: {{damage}}. Hallazgos: {{findings}}. Acciones: {{actions}}. Máximo 5 frases.",
    purpose: "damage_summary",
    isDefault: true,
    isActive: true,
    version: "1.0"
  }
];

export const getPrompts = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  await assertAdmin(uid);

  const snap = await db.doc("config/aiPrompts").get();
  const customPrompts: AiPrompt[] = snap.exists ? (snap.data()!.prompts ?? []) : [];

  // Los prompts del sistema siempre se incluyen primero, no pueden ser sobreescritos
  const customIds = new Set(customPrompts.map((p) => p.id));
  const systemPrompts = DEFAULT_PROMPTS.filter((p) => !customIds.has(p.id));

  return [...systemPrompts, ...customPrompts];
});

export const savePrompt = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  await assertAdmin(uid);

  const prompt = request.data as AiPrompt;

  if (!prompt.id || !prompt.name || !prompt.content) {
    throw new HttpsError("invalid-argument", "PROMPT_FIELDS_REQUIRED");
  }

  // Los prompts del sistema SÍ pueden ser sobreescritos por admins.
  // getPrompts() ya da prioridad a la versión custom cuando el ID coincide.

  const snap = await db.doc("config/aiPrompts").get();
  const existing: AiPrompt[] = snap.exists ? (snap.data()!.prompts ?? []) : [];

  const updated = existing.filter((p) => p.id !== prompt.id);
  updated.push({
    ...prompt,
    isActive: prompt.isActive ?? true,
    version: prompt.version || "v1.0",
    isDefault: false,
    updatedAt: new Date().toISOString(),
    updatedBy: uid
  });

  await db.doc("config/aiPrompts").set({ prompts: updated });
  return { ok: true };
});

export const deletePrompt = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  await assertAdmin(uid);

  const { id } = request.data as { id: string };
  if (!id) throw new HttpsError("invalid-argument", "PROMPT_ID_REQUIRED");

  // Si el ID pertenece a un prompt del sistema, eliminar la versión custom
  // equivale a "restaurar al predeterminado" — se permite sin restricción.

  const snap = await db.doc("config/aiPrompts").get();
  const existing: AiPrompt[] = snap.exists ? (snap.data()!.prompts ?? []) : [];
  const updated = existing.filter((p) => p.id !== id);
  await db.doc("config/aiPrompts").set({ prompts: updated });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IA — Análisis de fotos de inspección (Gemini Vision)
// ---------------------------------------------------------------------------

import type { AnalyzePhotoRequest } from "./types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGeminiVision(
  apiKey: string,
  model: string,
  promptText: string,
  base64Image: string,
  mimeType: string
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(`Gemini ${res.status}: ${res.statusText} — ${errBody}`);
    (err as unknown as Record<string, unknown>).status = res.status;
    throw err;
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim();
}

const FALLBACK_PHOTO_PROMPT =
  "Eres un asistente técnico especializado en informes de fontanería y detección de fugas. " +
  "El técnico ha escrito la siguiente observación sobre la foto de inspección: \"{{userText}}\". " +
  "Mejora este texto: corrígelo gramaticalmente en alemán, usa terminología técnica precisa de instalaciones sanitarias/fontanería, " +
  "hazlo más profesional y claro. Devuelve ÚNICAMENTE el texto mejorado, sin explicaciones ni comentarios adicionales.";

export const analyzeInspectionPhoto = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");

  const { reportId, photoId, storagePath, slot, technicianNote } = request.data as AnalyzePhotoRequest;

  if (!storagePath || !storagePath.startsWith("report-photos/")) {
    throw new HttpsError("invalid-argument", "INVALID_STORAGE_PATH");
  }

  // Leer configuración de IA
  const aiSnap = await db.doc("config/ai").get();
  if (!aiSnap.exists) {
    throw new HttpsError("failed-precondition", "AI_NOT_CONFIGURED");
  }
  const aiData = aiSnap.data()!;
  const apiKey: string | undefined = aiData.apiKey;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "AI_NO_API_KEY");
  }
  const visionModel: string = aiData.visionModel ?? DEFAULT_AI_CONFIG.visionModel;

  // El texto del técnico es obligatorio para mejorar
  if (!technicianNote || !technicianNote.trim()) {
    throw new HttpsError("invalid-argument", "USER_TEXT_REQUIRED");
  }

  // Leer prompt photo_description (custom o default)
  const promptsSnap = await db.doc("config/aiPrompts").get();
  const customPrompts: AiPrompt[] = promptsSnap.exists ? (promptsSnap.data()!.prompts ?? []) : [];
  const customPhotoPrompt = customPrompts.find((p) => p.id === "photo_description");
  let promptContent = customPhotoPrompt?.content ?? DEFAULT_PROMPTS.find((p) => p.id === "photo_description")?.content ?? FALLBACK_PHOTO_PROMPT;

  // Sustituir {{userText}} con el texto escrito por el técnico
  promptContent = promptContent.replace("{{userText}}", technicianNote.trim());

  // Descargar imagen desde Cloud Storage
  const bucket: Bucket = getStorage().bucket();
  let imageBuffer: Buffer;
  try {
    const [fileBytes] = await bucket.file(storagePath).download();
    imageBuffer = fileBytes as Buffer;
  } catch (downloadErr) {
    logger.error("analyzeInspectionPhoto: error descargando imagen", { reportId, photoId, slot, error: downloadErr });
    throw new HttpsError("not-found", "PHOTO_NOT_FOUND");
  }

  // Detectar tipo MIME a partir de los primeros bytes (JPEG o PNG)
  const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/jpeg";
  const base64Image = imageBuffer.toString("base64");

  // Llamar a Gemini Vision vía REST API — con fallback automático entre modelos
  const modelsToTry = [visionModel];
  if (visionModel !== "gemini-2.5-flash") modelsToTry.push("gemini-2.5-flash");
  if (visionModel !== "gemini-2.5-flash-lite") modelsToTry.push("gemini-2.5-flash-lite");

  let description: string | null = null;
  let usedModel = visionModel;

  for (const candidate of modelsToTry) {
    try {
      description = await callGeminiVision(apiKey, candidate, promptContent, base64Image, mimeType);
      usedModel = candidate;
      break;
    } catch (geminiErr) {
      const errStatus = (geminiErr as { status?: number }).status;
      const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      logger.warn("analyzeInspectionPhoto: fallo con modelo", { candidate, errStatus, errMsg });
      if (errStatus !== 404 && errStatus !== 400) {
        logger.error("analyzeInspectionPhoto: error no-recuperable", { reportId, photoId, slot, candidate, errStatus, errMsg });
        throw new HttpsError("internal", `AI_GENERATION_FAILED: ${errMsg}`);
      }
    }
  }

  if (description === null) {
    logger.error("analyzeInspectionPhoto: todos los modelos fallaron", { reportId, photoId, slot, modelsToTry });
    throw new HttpsError("failed-precondition", "AI_NO_VALID_MODEL");
  }

  if (usedModel !== visionModel) {
    logger.warn("analyzeInspectionPhoto: se usó modelo de fallback", { requested: visionModel, used: usedModel });
  }

  return {
    description,
    model: usedModel,
    generatedAt: new Date().toISOString()
  };
});

// ─── Delete a single report and its assets ────────────────────────────────────
export const deleteReport = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) throw new HttpsError("invalid-argument", "reportId is required");

  const role = await getActiveUserRole(uid);
  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    return { deleted: false };
  }

  const report = reportSnap.data() as ReportData;
  // Solo el creador o un admin/office puede eliminar
  if (report.createdBy !== uid && !canReadAcrossTeam(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED_DELETE");
  }

  // Eliminar documentos de la subcolección photos
  const photosSnap = await reportRef.collection("photos").get();
  const batch = db.batch();
  for (const docSnap of photosSnap.docs) {
    batch.delete(docSnap.ref);
  }
  batch.delete(reportRef);
  await batch.commit();

  // Eliminar archivos de Storage (prefijos)
  const storageBucket = getBucket();
  if (storageBucket) {
    const prefixes = [
      `report-photos/${reportId}/`,
      `report-signatures/${reportId}/`,
      `leckortung-signatures/${reportId}/`,
      `report-pdfs/${reportId}/`
    ];

    for (const prefix of prefixes) {
      try {
        await storageBucket.deleteFiles({ prefix });
      } catch (err) {
        logger.warn(`Failed to delete storage prefix ${prefix}`, { error: String(err) });
      }
    }
  }

  logger.info("deleteReport", { uid, reportId });
  return { deleted: true };
});

// ─── Admin: delete all reports ────────────────────────────────────────────────
export const deleteAllReports = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const batch = db.batch();
  const snap = await db.collection("reports").get();
  let count = 0;
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count % 500 === 0) {
      await batch.commit();
    }
  }
  if (count % 500 !== 0) await batch.commit();

  logger.info("deleteAllReports", { uid, deleted: count });
  return { deleted: count };
});

// ─── Admin: seed demo clients ─────────────────────────────────────────────────
export const seedDemoClients = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  await assertAdmin(uid);

  const now = FieldValue.serverTimestamp();

  const DEMO_CLIENTS = [
    { name: "Müller", surname: "Hans", email: "hans.mueller@example.de", phone: "+49 211 123456", location: "Düsseldorf, Am Stadtgarten 12" },
    { name: "Schmidt", surname: "Anna", email: "anna.schmidt@example.de", phone: "+49 221 654321", location: "Köln, Hohenzollernring 45" },
    { name: "Weber", surname: "Klaus", email: "k.weber@example.de", phone: "+49 211 987654", location: "Düsseldorf, Königsallee 28" },
    { name: "Fischer", surname: "Maria", email: "maria.fischer@example.de", phone: "+49 201 112233", location: "Essen, Rüttenscheider Str. 9" },
    { name: "Becker", surname: "Thomas", email: "t.becker@example.de", phone: "+49 203 445566", location: "Duisburg, Königstr. 77" },
    { name: "Hoffmann", surname: "Petra", email: "p.hoffmann@example.de", phone: "+49 2161 334455", location: "Mönchengladbach, Hindenburgstr. 3" },
    { name: "Wagner", surname: "Stefan", email: "stefan.wagner@example.de", phone: "+49 202 556677", location: "Wuppertal, Friedrich-Engels-Allee 55" },
    { name: "Schneider", surname: "Lisa", email: "lisa.schneider@example.de", phone: "+49 2151 667788", location: "Krefeld, Südwall 21" },
    { name: "Braun", surname: "Michael", email: "m.braun@example.de", phone: "+49 2131 778899", location: "Neuss, Hammfelddamm 8" },
    { name: "Zimmermann", surname: "Sabine", email: "s.zimmermann@example.de", phone: "+49 2102 889900", location: "Ratingen, Düsseldorfer Str. 44" },
    { name: "Krause", surname: "Peter", email: "p.krause@example.de", phone: "+49 2365 990011", location: "Marl, Lipper Str. 16" },
    { name: "Hartmann", surname: "Julia", email: "j.hartmann@example.de", phone: "+49 2236 001122", location: "Brühl, Balthasarstr. 5" },
    { name: "Richter", surname: "Andreas", email: "a.richter@example.de", phone: "+49 2204 112233", location: "Bergisch Gladbach, Hauptstr. 30" },
    { name: "Klein", surname: "Eva", email: "e.klein@example.de", phone: "+49 2332 223344", location: "Hattingen, Bahnhofstr. 7" },
    { name: "Wolf", surname: "Martin", email: "m.wolf@example.de", phone: "+49 2129 334455", location: "Mettmann, Neanderstr. 2" }
  ];

  const TECHNICIANS = ["Max Bauer", "Felix Richter", "Jonas Keller"];
  const REPORT_TYPES = ["Leckortung Trinkwasserinstallation", "Leckortung Heizungsinstallation", "Leckortung Fußbodenheizung", "Feuchtigkeitsmessung / Schadensaufnahme"];

  const createdClients: string[] = [];

  for (let i = 0; i < DEMO_CLIENTS.length; i++) {
    const c = DEMO_CLIENTS[i];
    const clientRef = await db.collection("clients").add({
      name: c.name,
      surname: c.surname,
      principalContact: `${c.surname} ${c.name}`,
      email: c.email,
      phone: c.phone,
      location: c.location,
      createdBy: uid,
      createdAt: now,
      updatedAt: now
    });
    createdClients.push(clientRef.id);

    // 1-2 reports per client
    const numReports = i % 3 === 0 ? 2 : 1;
    for (let r = 0; r < numReports; r++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1;
      const appointmentDate = new Date(Date.now() - daysAgo * 86400000);
      appointmentDate.setHours(9 + (i % 4) * 2, 0, 0, 0);
      const technicianName = TECHNICIANS[i % TECHNICIANS.length];
      const projectNumber = `VIS-${appointmentDate.toISOString().slice(0, 10).replace(/-/g, "")}-${String(i * 10 + r + 1000).padStart(4, "0")}`;

      await db.collection("reports").add({
        clientId: clientRef.id,
        status: "finalized",
        brandTemplateId: undefined,
        companyId: undefined,
        projectInfo: {
          projectNumber,
          appointmentDate: appointmentDate.toISOString(),
          technicianName,
          locationObject: c.location,
          auftragserteilung: "Mündlich"
        },
        contacts: {
          name1: `${c.surname} ${c.name}`,
          street1: c.location.split(",")[1]?.trim() || c.location,
          city1: c.location.split(",")[0]?.trim() || "",
          phone1: c.phone,
          email: c.email
        },
        findings: { summary: `Leckortung durchgeführt. ${REPORT_TYPES[i % REPORT_TYPES.length]} abgeschlossen.` },
        templateFields: {},
        finalization: {
          finalizedAt: appointmentDate.toISOString(),
          pdfUrl: "",
          pdfPath: ""
        },
        createdBy: uid,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  logger.info("seedDemoClients", { uid, clients: createdClients.length });
  return { clients: createdClients.length };
});

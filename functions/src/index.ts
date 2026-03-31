import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";
import type { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { sha256 } from "./hash";
import { DEFAULT_TEMPLATES } from "./templates";
import { BuiltinTemplateId, ClientData, ReportData, TemplateConfig, TemplateSchemaSource, TemplateSummary, TemplateVersion } from "./types";
import { validateReportForFinalize } from "./validation";

initializeApp();
setGlobalOptions({ region: "europe-west3", maxInstances: 10 });

let db: Firestore | undefined;
let bucket: Bucket | null | undefined;

const getDb = () => {
  if (!db) {
    db = getFirestore();
  }
  return db;
};

const getBucket = () => {
  if (bucket === undefined) {
    try {
      const storage = getStorage();
      const fromEnv = process.env.FIREBASE_STORAGE_BUCKET;
      bucket = fromEnv ? storage.bucket(fromEnv) : storage.bucket();
    } catch (error) {
      logger.warn("Cloud Storage bucket is not configured; template preview/finalize will fail.", {
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

const aiSettingsRef = () => getDb().doc("appSettings/ai");

const maskApiKey = (value: string) => {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}••••`;
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
};

const getStoredAiSettings = async () => {
  const snap = await aiSettingsRef().get();
  const data = snap.data() as { geminiApiKey?: string; geminiModel?: string } | undefined;
  return {
    geminiApiKey: String(data?.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "").trim(),
    geminiModel: String(data?.geminiModel ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim()
  };
};

let pdfModulePromise: Promise<typeof import("./pdf")> | undefined;
const getPdfModule = async () => {
  if (!pdfModulePromise) {
    pdfModulePromise = import("./pdf");
  }
  return pdfModulePromise;
};

let schemaSuggestionPromise: Promise<typeof import("./schemaSuggestion")> | undefined;
const getSchemaSuggestionModule = async () => {
  if (!schemaSuggestionPromise) {
    schemaSuggestionPromise = import("./schemaSuggestion");
  }
  return schemaSuggestionPromise;
};

type Mailer = {
  transporter: import("nodemailer").Transporter;
  from: string;
};

const getMailer = async (): Promise<Mailer | null> => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || Number.isNaN(port) || !user || !pass || !from) {
    return null;
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return { transporter, from };
};

const listGeminiModelsFromApi = async (apiKey: string) => {
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GEMINI_API_KEY_NOT_CONFIGURED");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) {
    throw new HttpsError("failed-precondition", `GEMINI_REQUEST_FAILED:${response.status}`);
  }

  const payload = await response.json() as {
    models?: Array<{
      name?: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (payload.models ?? [])
    .filter((model) =>
      String(model.name ?? "").includes("gemini")
      && Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes("generateContent")
    )
    .map((model) => ({
      id: String(model.name ?? "").replace(/^models\//, ""),
      displayName: String(model.displayName ?? model.name ?? "").trim(),
      description: String(model.description ?? "").trim()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
};

const getTemplate = async (templateId: string): Promise<TemplateConfig> => {
  const db = getDb();
  const fallbackId = (templateId in DEFAULT_TEMPLATES ? templateId : "svt") as BuiltinTemplateId;
  const fallback = DEFAULT_TEMPLATES[fallbackId];

  const templateSnap = await db.doc(`templates/${templateId}`).get();
  if (!templateSnap.exists) {
    return fallback;
  }

  return {
    ...fallback,
    ...(templateSnap.data() as Partial<TemplateConfig>)
  };
};

const assertActiveUser = async (uid: string) => {
  const db = getDb();
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data();
  const role = String(data?.role ?? "");

  if (!userSnap.exists || data?.active !== true || !["technician", "admin", "office"].includes(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const assertTemplateAdmin = async (uid: string) => {
  const db = getDb();
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data();
  const role = String(data?.role ?? "");

  if (!userSnap.exists || data?.active !== true || !["admin", "office"].includes(role)) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const assertOwnReport = (uid: string, report: ReportData) => {
  if (report.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const toPdfRenderError = (error: unknown): HttpsError => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith("MAPPED_FIELD_NOT_FOUND:")) {
    return new HttpsError("failed-precondition", message);
  }

  if (message.startsWith("MAPPED_OPTION_NOT_FOUND:")) {
    return new HttpsError("failed-precondition", message);
  }

  if (message.startsWith("TEMPLATE_PDF_NOT_FOUND:")) {
    return new HttpsError("failed-precondition", message);
  }

  if (message === "STORAGE_BUCKET_NOT_CONFIGURED") {
    return new HttpsError("failed-precondition", message);
  }

  if (message.startsWith("IMAGE_FIELD_NOT_SUPPORTED:")) {
    return new HttpsError("failed-precondition", message);
  }

  if (message === "PDF_TEXT_EXTRACTION_EMPTY" || message === "SCHEMA_SUGGESTION_EMPTY") {
    return new HttpsError("failed-precondition", message);
  }

  if (message.startsWith("GEMINI_REQUEST_FAILED:") || message === "GEMINI_EMPTY_RESPONSE" || message === "GEMINI_API_KEY_NOT_CONFIGURED") {
    return new HttpsError("failed-precondition", message);
  }

  return new HttpsError("internal", "PDF_RENDER_FAILED");
};

const getTemplateVersion = async (templateRef: string, versionRef: string): Promise<TemplateVersion> => {
  const db = getDb();
  const templateVersionSnap = await db.doc(`templates/${templateRef}/versions/${versionRef}`).get();
  if (!templateVersionSnap.exists) {
    throw new HttpsError("failed-precondition", "TEMPLATE_VERSION_NOT_FOUND");
  }

  return {
    id: templateVersionSnap.id,
    ...(templateVersionSnap.data() as Omit<TemplateVersion, "id">)
  };
};

const getReportRenderSource = async (report: ReportData) => {
  if (report.templateRef && report.templateVersionRef) {
    return {
      kind: "custom" as const,
      version: await getTemplateVersion(report.templateRef, report.templateVersionRef)
    };
  }

  return {
    kind: "fixed" as const,
    template: await getTemplate(report.brandTemplateId)
  };
};

export const finalizeReport = onCall(async (request) => {
  const db = getDb();
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  await assertActiveUser(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertOwnReport(uid, report);

  if (report.status === "finalized") {
    throw new HttpsError("failed-precondition", "ALREADY_FINALIZED");
  }

  const renderSource = await getReportRenderSource(report);
  const requiredTemplateFields = renderSource.kind === "fixed"
    ? renderSource.template.requiredTemplateFields
    : renderSource.version.fieldSchema
        .filter((field) => field.required && (field.type === "text" || field.type === "textarea" || field.type === "dropdown" || field.type === "checkbox"))
        .map((field) => `templateFields.${field.id}`);
  const validationErrors = validateReportForFinalize(report, requiredTemplateFields);
  if (validationErrors.length > 0) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED", {
      errors: validationErrors
    });
  }

  const pdfModule = await getPdfModule();
  const bucket = requireBucket();
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = renderSource.kind === "fixed"
      ? await pdfModule.renderReportPdf(report, renderSource.template, bucket, { flatten: true })
      : await pdfModule.renderSchemaBasedPdf(report, renderSource.version, bucket, { flatten: true });
  } catch (error) {
    throw toPdfRenderError(error);
  }

  const pdfPath = `report-pdfs/${reportId}/final.pdf`;
  await bucket.file(pdfPath).save(Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=0, no-cache"
    }
  });

  const [pdfUrl] = await bucket.file(pdfPath).getSignedUrl({
    action: "read",
    expires: "2100-01-01"
  });

  const finalizedAt = new Date().toISOString();
  const pdfChecksum = sha256(pdfBytes);
  const previousVersion = Number(report.finalization?.pdfVersion ?? 0);
  const pdfVersion = previousVersion + 1;

  await reportRef.update({
    status: "finalized",
    updatedAt: FieldValue.serverTimestamp(),
    finalization: {
      finalizedAt,
      finalizedBy: uid,
      pdfPath,
      pdfUrl,
      pdfChecksum,
      pdfVersion
    }
  });

  logger.info("Report finalized", { reportId, uid });

  return {
    pdfUrl,
    finalizedAt
  };
});

export const previewPdf = onCall(async (request) => {
  const db = getDb();
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  await assertActiveUser(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertOwnReport(uid, report);

  const renderSource = await getReportRenderSource(report);
  const pdfModule = await getPdfModule();
  const bucket = requireBucket();
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = renderSource.kind === "fixed"
      ? await pdfModule.renderReportPdf(report, renderSource.template, bucket, { flatten: false })
      : await pdfModule.renderSchemaBasedPdf(report, renderSource.version, bucket, { flatten: false });
  } catch (error) {
    throw toPdfRenderError(error);
  }

  logger.info("Report preview generated", { reportId, uid });
  return {
    previewBase64: Buffer.from(pdfBytes).toString("base64"),
    mimeType: "application/pdf"
  };
});

export const sendReportEmail = onCall(async (request) => {
  const db = getDb();
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  const requestClientId = String(request.data?.clientId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  await assertActiveUser(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertOwnReport(uid, report);

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
  if (client.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }

  if (!client.email) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: Kunde ohne E-Mail");
  }

  const mailer = await getMailer();
  if (!mailer) {
    throw new HttpsError("failed-precondition", "SMTP_NOT_CONFIGURED");
  }

  const pdfPath = report.finalization?.pdfPath;
  if (!pdfPath) {
    throw new HttpsError("failed-precondition", "PDF_NOT_AVAILABLE");
  }

  const bucket = requireBucket();
  const [pdfBuffer] = await bucket.file(pdfPath).download();
  const sentAt = new Date().toISOString();
  const filename = `Einsatzbericht-${report.projectInfo?.projectNumber || reportId}.pdf`;

  await mailer.transporter.sendMail({
    from: mailer.from,
    to: client.email,
    subject: `Einsatzbericht ${report.projectInfo?.projectNumber || reportId}`,
    text: [
      "Guten Tag,",
      "",
      "im Anhang befindet sich Ihr Einsatzbericht.",
      "",
      `Projekt: ${report.projectInfo?.projectNumber || "-"}`,
      `Ort: ${report.projectInfo?.locationObject || "-"}`,
      "",
      "Viele Grüße"
    ].join("\n"),
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });

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

export const publishTemplateVersion = onCall({ invoker: "public" }, async (request) => {
  const db = getDb();
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const templateId = String(request.data?.templateId ?? "").trim();
  const versionId = String(request.data?.versionId ?? "").trim();
  if (!templateId || !versionId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: templateId/versionId fehlt");
  }

  await assertTemplateAdmin(uid);

  const templateRef = db.doc(`templates/${templateId}`);
  const versionRef = db.doc(`templates/${templateId}/versions/${versionId}`);
  const [templateSnap, versionSnap] = await Promise.all([templateRef.get(), versionRef.get()]);

  if (!templateSnap.exists || !versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_NOT_FOUND");
  }

  const template = templateSnap.data() as TemplateSummary;
  const version = versionSnap.data() as TemplateVersion;
  if (template.createdBy !== uid || version.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }

  if (version.status === "published") {
    throw new HttpsError("failed-precondition", "VERSION_ALREADY_PUBLISHED");
  }

  if (!version.basePdfPath || !Array.isArray(version.fieldSchema) || version.fieldSchema.length === 0) {
    throw new HttpsError("failed-precondition", "TEMPLATE_SCHEMA_INVALID");
  }

  const bucket = requireBucket();
  const [basePdf] = await bucket.file(version.basePdfPath).download().catch(() => {
    throw new HttpsError("failed-precondition", "TEMPLATE_PDF_NOT_FOUND");
  });

  try {
    const pdfModule = await getPdfModule();
    const editablePdf = await pdfModule.createEditablePdfFromSchema(basePdf, version.fieldSchema);
    const editablePdfPath = `templates/${templateId}/${versionId}/editable.pdf`;
    await bucket.file(editablePdfPath).save(Buffer.from(editablePdf), {
      contentType: "application/pdf",
      metadata: {
        cacheControl: "private, max-age=0, no-cache"
      }
    });

    const now = new Date().toISOString();
    await Promise.all([
      versionRef.update({
        editablePdfPath,
        status: "published",
        publishedAt: now,
        publishedBy: uid
      }),
      templateRef.update({
        publishedVersionId: versionId,
        status: "published",
        updatedAt: FieldValue.serverTimestamp()
      })
    ]);

    return {
      editablePdfPath,
      publishedAt: now
    };
  } catch (error) {
    throw toPdfRenderError(error);
  }
});

export const suggestTemplateSchema = onCall({ invoker: "public" }, async (request) => {
  const db = getDb();
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertTemplateAdmin(uid);

  const templateId = String(request.data?.templateId ?? "").trim();
  const versionId = String(request.data?.versionId ?? "").trim();
  const overwriteExisting = Boolean(request.data?.overwriteExisting);
  if (!templateId || !versionId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: templateId/versionId fehlt");
  }

  const templateRef = db.doc(`templates/${templateId}`);
  const versionRef = db.doc(`templates/${templateId}/versions/${versionId}`);
  const [templateSnap, versionSnap] = await Promise.all([templateRef.get(), versionRef.get()]);

  if (!templateSnap.exists || !versionSnap.exists) {
    throw new HttpsError("not-found", "TEMPLATE_NOT_FOUND");
  }

  const template = templateSnap.data() as TemplateSummary;
  const version = versionSnap.data() as TemplateVersion;
  if (template.createdBy !== uid || version.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }

  if (!version.basePdfPath) {
    throw new HttpsError("failed-precondition", "TEMPLATE_PDF_NOT_FOUND");
  }

  const bucket = requireBucket();
  const [basePdf] = await bucket.file(version.basePdfPath).download().catch(() => {
    throw new HttpsError("failed-precondition", "TEMPLATE_PDF_NOT_FOUND");
  });

  try {
    const schemaSuggestionModule = await getSchemaSuggestionModule();
    const aiSettings = await getStoredAiSettings();
    const result = await schemaSuggestionModule.suggestTemplateSchemaFromPdf(basePdf, version, overwriteExisting, {
      apiKey: aiSettings.geminiApiKey,
      model: aiSettings.geminiModel
    });
    await versionRef.update({
      fieldSchema: result.fieldSchema,
      schemaSource: result.schemaSource as TemplateSchemaSource,
      schemaGeneratedAt: result.generatedAt,
      schemaModel: result.model,
      schemaWarnings: result.warnings
    });
    await templateRef.update({
      updatedAt: FieldValue.serverTimestamp()
    });

    return result;
  } catch (error) {
    throw toPdfRenderError(error);
  }
});

export const getAiSettings = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertTemplateAdmin(uid);
  const settings = await getStoredAiSettings();

  return {
    hasApiKey: Boolean(settings.geminiApiKey),
    apiKeyHint: settings.geminiApiKey ? maskApiKey(settings.geminiApiKey) : "",
    model: settings.geminiModel
  };
});

export const listGeminiModels = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertTemplateAdmin(uid);
  const providedKey = String(request.data?.apiKey ?? "").trim();
  const settings = await getStoredAiSettings();
  const apiKey = providedKey || settings.geminiApiKey;
  const models = await listGeminiModelsFromApi(apiKey);

  return {
    models,
    selectedModel: settings.geminiModel || "gemini-2.5-flash"
  };
});

export const saveAiSettings = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  await assertTemplateAdmin(uid);

  const apiKey = String(request.data?.apiKey ?? "").trim();
  const model = String(request.data?.model ?? "").trim();
  const clearApiKey = Boolean(request.data?.clearApiKey);

  const current = await getStoredAiSettings();
  const nextApiKey = clearApiKey ? "" : apiKey || current.geminiApiKey;
  const nextModel = model || current.geminiModel || "gemini-2.5-flash";

  await aiSettingsRef().set({
    geminiApiKey: nextApiKey,
    geminiModel: nextModel,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    hasApiKey: Boolean(nextApiKey),
    apiKeyHint: nextApiKey ? maskApiKey(nextApiKey) : "",
    model: nextModel
  };
});

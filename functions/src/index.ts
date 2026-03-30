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
import { ClientData, ReportData, TemplateConfig } from "./types";
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
      logger.warn("Cloud Storage bucket is not configured; images in preview will be skipped.", {
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

let renderReportPdfPromise: Promise<typeof import("./pdf").renderReportPdf> | undefined;
const getRenderReportPdf = async () => {
  if (!renderReportPdfPromise) {
    renderReportPdfPromise = import("./pdf").then((module) => module.renderReportPdf);
  }
  return renderReportPdfPromise;
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

const getTemplate = async (templateId: string): Promise<TemplateConfig> => {
  const db = getDb();
  const fallback = DEFAULT_TEMPLATES[templateId] ?? DEFAULT_TEMPLATES.svt;

  const templateSnap = await db.doc(`templates/${templateId}`).get();
  if (!templateSnap.exists) {
    return fallback;
  }

  return {
    ...fallback,
    ...(templateSnap.data() as Partial<TemplateConfig>)
  };
};

const assertTechnician = async (uid: string) => {
  const db = getDb();
  const userSnap = await db.doc(`users/${uid}`).get();
  const data = userSnap.data();

  if (!userSnap.exists || data?.role !== "technician" || data?.active !== true) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
};

const assertOwnReport = (uid: string, report: ReportData) => {
  if (report.createdBy !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }
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

  await assertTechnician(uid);

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

  const validationErrors = validateReportForFinalize(report);
  if (validationErrors.length > 0) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED", {
      errors: validationErrors
    });
  }

  const template = await getTemplate(report.brandTemplateId);
  const renderReportPdf = await getRenderReportPdf();
  const previewBucket = getBucket();
  const pdfBytes = await renderReportPdf(report, template, previewBucket);
  const bucket = requireBucket();

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

  await assertTechnician(uid);

  const reportRef = db.doc(`reports/${reportId}`);
  const reportSnap = await reportRef.get();

  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Bericht nicht gefunden");
  }

  const report = reportSnap.data() as ReportData;
  assertOwnReport(uid, report);

  const template = await getTemplate(report.brandTemplateId);
  const renderReportPdf = await getRenderReportPdf();
  const previewBucket = getBucket();
  const pdfBytes = await renderReportPdf(report, template, previewBucket);

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

  await assertTechnician(uid);

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

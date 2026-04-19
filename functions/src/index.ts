import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";
import type { Bucket } from "@google-cloud/storage";
import type { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { sha256 } from "./hash";
import { DEFAULT_TEMPLATES } from "./templates";
import { AppointmentData, BuiltinTemplateId, ClientData, CompanySettings, InsurerData, ReportData, TemplateConfig, TemplateSummary, TemplateVersion } from "./types";
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

let pdfModulePromise: Promise<typeof import("./pdf")> | undefined;
const getPdfModule = async () => {
  if (!pdfModulePromise) {
    pdfModulePromise = import("./pdf");
  }
  return pdfModulePromise;
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

const getInsurerLogoPath = async (insurerId: string | undefined): Promise<string> => {
  if (!insurerId) {
    return "";
  }
  const snap = await getDb().doc(`insurers/${insurerId}`).get();
  if (!snap.exists) {
    return "";
  }
  return String((snap.data() as InsurerData).logoPath ?? "");
};

const getCompanyFooter = async (): Promise<string> => {
  const snap = await getDb().doc("company/settings").get();
  if (!snap.exists) {
    return "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens";
  }
  const s = snap.data() as CompanySettings;
  return s.footerText || `${s.name}, ${s.address}`;
};

const sendFcmToUser = async (uid: string, title: string, body: string): Promise<void> => {
  try {
    const tokensSnap = await getDb().collection("fcmTokens").where("uid", "==", uid).get();
    const tokens = tokensSnap.docs.map((d) => String(d.data().token ?? "")).filter(Boolean);
    if (tokens.length === 0) {
      return;
    }
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: { notification: { icon: "/icon-192.svg" }, fcmOptions: { link: "/" } }
    });
  } catch (error) {
    logger.warn("FCM send failed", { uid, error: error instanceof Error ? error.message : String(error) });
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
    const [insurerLogoPath, footerText] = await Promise.all([
      getInsurerLogoPath(report.insurerId),
      getCompanyFooter()
    ]);
    const assetOverrides = insurerLogoPath ? { insurer_logo: insurerLogoPath } : undefined;
    if (renderSource.kind === "fixed") {
      const templateWithFooter = { ...renderSource.template, footerText };
      pdfBytes = await pdfModule.renderReportPdf(report, templateWithFooter, bucket, { flatten: true });
    } else {
      pdfBytes = await pdfModule.renderSchemaBasedPdf(report, renderSource.version, bucket, { flatten: true }, assetOverrides);
    }
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
    const [insurerLogoPath, footerText] = await Promise.all([
      getInsurerLogoPath(report.insurerId),
      getCompanyFooter()
    ]);
    const assetOverrides = insurerLogoPath ? { insurer_logo: insurerLogoPath } : undefined;
    if (renderSource.kind === "fixed") {
      const templateWithFooter = { ...renderSource.template, footerText };
      pdfBytes = await pdfModule.renderReportPdf(report, templateWithFooter, bucket, { flatten: false });
    } else {
      pdfBytes = await pdfModule.renderSchemaBasedPdf(report, renderSource.version, bucket, { flatten: false }, assetOverrides);
    }
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

export const publishTemplateVersion = onCall(async (request) => {
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

// ── Insurer Management ─────────────────────────────────────────────────────

export const saveInsurer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }
  await assertTemplateAdmin(uid);

  const { id, name, logoPath, primaryColor, titleColor, active } = request.data as Partial<InsurerData> & { id?: string };
  if (!name) {
    throw new HttpsError("invalid-argument", "name is required");
  }

  const db = getDb();
  const now = new Date().toISOString();

  if (id) {
    await db.doc(`insurers/${id}`).update({ name, logoPath: logoPath ?? "", primaryColor: primaryColor ?? "#0c2a4d", titleColor: titleColor ?? "#12395f", active: active ?? true, updatedAt: now });
    return { id };
  }

  const ref = await db.collection("insurers").add({ name, logoPath: logoPath ?? "", primaryColor: primaryColor ?? "#0c2a4d", titleColor: titleColor ?? "#12395f", active: true, createdAt: now, updatedAt: now });
  return { id: ref.id };
});

// ── Calendar / Appointments ────────────────────────────────────────────────

export const createAppointment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }
  await assertTemplateAdmin(uid);

  const data = request.data as Partial<AppointmentData>;
  if (!data.title || !data.date || !data.startTime || !data.endTime || !data.assignedTo) {
    throw new HttpsError("invalid-argument", "title, date, startTime, endTime, assignedTo are required");
  }

  const db = getDb();
  const now = new Date().toISOString();

  const userSnap = await db.doc(`users/${data.assignedTo}`).get();
  const assignedToName = String(userSnap.data()?.displayName ?? data.assignedToName ?? "");

  const appointmentData: Omit<AppointmentData, "id"> = {
    title: data.title,
    description: data.description ?? "",
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    assignedTo: data.assignedTo,
    assignedToName,
    clientId: data.clientId ?? "",
    clientName: data.clientName ?? "",
    location: data.location ?? "",
    status: "scheduled",
    createdBy: uid,
    createdAt: now,
    updatedAt: now
  };

  const ref = await db.collection("appointments").add(appointmentData);

  // Send FCM notification to assigned technician
  await sendFcmToUser(
    data.assignedTo,
    "Neuer Termin",
    `${data.date} ${data.startTime} – ${data.title}`
  );

  // Send email confirmation if SMTP is configured
  const mailer = await getMailer();
  if (mailer && data.clientId) {
    try {
      const clientSnap = await db.doc(`clients/${data.clientId}`).get();
      const client = clientSnap.data() as ClientData | undefined;
      if (client?.email) {
        const icsContent = buildIcsContent(ref.id, appointmentData);
        await mailer.transporter.sendMail({
          from: mailer.from,
          to: client.email,
          subject: `Terminbestätigung: ${data.title}`,
          text: [
            "Guten Tag,",
            "",
            `Ihr Termin wurde bestätigt:`,
            `Titel: ${data.title}`,
            `Datum: ${data.date}`,
            `Uhrzeit: ${data.startTime} – ${data.endTime}`,
            data.location ? `Ort: ${data.location}` : "",
            data.description ? `Beschreibung: ${data.description}` : "",
            "",
            "Viele Grüße"
          ].filter((line) => line !== null).join("\n"),
          attachments: [{ filename: "termin.ics", content: icsContent, contentType: "text/calendar" }]
        });
        await db.doc(`appointments/${ref.id}`).update({ confirmationEmailSentAt: now });
      }
    } catch (emailError) {
      logger.warn("Appointment confirmation email failed", { error: emailError instanceof Error ? emailError.message : String(emailError) });
    }
  }

  logger.info("Appointment created", { appointmentId: ref.id, uid });
  return { id: ref.id };
});

export const updateAppointment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }
  await assertActiveUser(uid);

  const { id, ...updates } = request.data as Partial<AppointmentData> & { id: string };
  if (!id) {
    throw new HttpsError("invalid-argument", "id is required");
  }

  const db = getDb();
  const snap = await db.doc(`appointments/${id}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Termin nicht gefunden");
  }

  const existing = snap.data() as AppointmentData;
  const userSnap = await db.doc(`users/${uid}`).get();
  const userRole = String(userSnap.data()?.role ?? "");
  const isAdmin = userRole === "admin" || userRole === "office";

  if (!isAdmin && existing.assignedTo !== uid) {
    throw new HttpsError("permission-denied", "UNAUTHORIZED");
  }

  // Technicians can only update status
  const allowedUpdates = isAdmin ? updates : { status: updates.status, updatedAt: new Date().toISOString() };
  await db.doc(`appointments/${id}`).update({ ...allowedUpdates, updatedAt: FieldValue.serverTimestamp() });

  // Notify if technician changed
  if (isAdmin && updates.assignedTo && updates.assignedTo !== existing.assignedTo) {
    await sendFcmToUser(updates.assignedTo, "Termin zugewiesen", `${updates.date ?? existing.date} ${updates.startTime ?? existing.startTime} – ${updates.title ?? existing.title}`);
  }

  return { id };
});

export const deleteAppointment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }
  await assertTemplateAdmin(uid);

  const id = String(request.data?.id ?? "").trim();
  if (!id) {
    throw new HttpsError("invalid-argument", "id is required");
  }

  await getDb().doc(`appointments/${id}`).delete();
  logger.info("Appointment deleted", { appointmentId: id, uid });
  return { id };
});

export const saveFcmToken = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const token = String(request.data?.token ?? "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "token is required");
  }

  const db = getDb();
  const existing = await db.collection("fcmTokens").where("uid", "==", uid).where("token", "==", token).get();
  if (existing.empty) {
    await db.collection("fcmTokens").add({ uid, token, platform: "web", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  } else {
    await existing.docs[0].ref.update({ updatedAt: new Date().toISOString() });
  }

  return { ok: true };
});

export const sendAppointmentReminders = onSchedule(
  { schedule: "every day 07:00", timeZone: "Europe/Berlin", region: "europe-west3" },
  async () => {
    const db = getDb();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const snap = await db.collection("appointments")
      .where("date", "==", tomorrowStr)
      .where("status", "==", "scheduled")
      .get();

    for (const docSnap of snap.docs) {
      const appt = docSnap.data() as AppointmentData;
      if (appt.confirmationEmailSentAt) {
        continue;
      }
      await sendFcmToUser(
        appt.assignedTo,
        "Terminerinnerung morgen",
        `${appt.startTime} – ${appt.title}${appt.location ? ` @ ${appt.location}` : ""}`
      );
      await docSnap.ref.update({ notificationSentAt: new Date().toISOString() });
    }

    logger.info("Appointment reminders sent", { date: tomorrowStr, count: snap.size });
  }
);

function buildIcsContent(id: string, appt: Omit<AppointmentData, "id">): string {
  const dtstart = `${appt.date.replace(/-/g, "")}T${appt.startTime.replace(":", "")}00`;
  const dtend = `${appt.date.replace(/-/g, "")}T${appt.endTime.replace(":", "")}00`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//26german//Einsatzbericht//DE",
    "BEGIN:VEVENT",
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${appt.title}`,
    `DESCRIPTION:${appt.description}`,
    appt.location ? `LOCATION:${appt.location}` : "",
    `UID:${id}@26german`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
}

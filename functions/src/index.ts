import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { sha256 } from "./hash";
import { renderReportPdf } from "./pdf";
import { REPORT_TEMPLATE_ALL, REPORT_TEMPLATE_PROK } from "./templates";
import { ClientData, ReportData, UserRole } from "./types";
import { validateReportForFinalize } from "./validation";

initializeApp();
setGlobalOptions({ region: "europe-west3", maxInstances: 10 });

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
  appointmentEmailSubject: string;
  appointmentEmailBody: string;
  reportEmailSubject: string;
  reportEmailBody: string;
};

const DEFAULT_APPOINTMENT_EMAIL_SUBJECT = "Visita técnica programada - {{appointmentDate}}";
const DEFAULT_APPOINTMENT_EMAIL_BODY = [
  "Hola {{clientName}},",
  "",
  "Hemos programado una visita técnica para {{appointmentDate}}.",
  "Ubicación: {{locationObject}}",
  "Técnico asignado: {{technicianName}}",
  "",
  "Si necesitas realizar algún cambio, responde a este correo.",
  "",
  "Un saludo,",
  "{{senderName}}"
].join("\n");

const DEFAULT_REPORT_EMAIL_SUBJECT = "Informe técnico {{projectNumber}}";
const DEFAULT_REPORT_EMAIL_BODY = [
  "Hola {{clientName}},",
  "",
  "Adjuntamos el informe técnico de la visita realizada.",
  "",
  "Proyecto: {{projectNumber}}",
  "Ubicación: {{locationObject}}",
  "Técnico: {{technicianName}}",
  "",
  "Un saludo,",
  "{{senderName}}"
].join("\n");

const getEmailTemplateConfig = (data?: Record<string, unknown> | null): EmailTemplateConfig => ({
  appointmentEmailSubject: String(data?.appointmentEmailSubject ?? DEFAULT_APPOINTMENT_EMAIL_SUBJECT),
  appointmentEmailBody: String(data?.appointmentEmailBody ?? DEFAULT_APPOINTMENT_EMAIL_BODY),
  reportEmailSubject: String(data?.reportEmailSubject ?? DEFAULT_REPORT_EMAIL_SUBJECT),
  reportEmailBody: String(data?.reportEmailBody ?? DEFAULT_REPORT_EMAIL_BODY)
});

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

  return new Intl.DateTimeFormat("es-ES", {
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
    auth: { user, pass }
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

export const finalizeReport = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "UNAUTHORIZED");
  }

  const reportId = String(request.data?.reportId ?? "").trim();
  if (!reportId) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED: reportId fehlt");
  }

  await getActiveUserRole(uid);

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

  const template = report.projectInfo.auftragserteilung?.trim()
    ? REPORT_TEMPLATE_ALL
    : REPORT_TEMPLATE_PROK;

  const validationErrors = validateReportForFinalize(report, template.requiredTemplateFields);
  if (validationErrors.length > 0) {
    throw new HttpsError("invalid-argument", "VALIDATION_FAILED", {
      errors: validationErrors
    });
  }

  const storageBucket = requireBucket();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderReportPdf(report, template, storageBucket, { flatten: true });
  } catch (error) {
    throw toPdfRenderError(error);
  }

  const pdfPath = `report-pdfs/${reportId}/final.pdf`;
  await storageBucket.file(pdfPath).save(Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=0, no-cache"
    }
  });

  const [pdfUrl] = await storageBucket.file(pdfPath).getSignedUrl({
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

  const template = report.projectInfo.auftragserteilung?.trim()
    ? REPORT_TEMPLATE_ALL
    : REPORT_TEMPLATE_PROK;

  const storageBucket = requireBucket();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderReportPdf(report, template, storageBucket, { flatten: false });
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
  const tokens = {
    clientName: client.principalContact?.trim() || clientFullName || client.email || "",
    appointmentDate: formatAppointmentDate(report.projectInfo?.appointmentDate),
    locationObject: report.projectInfo?.locationObject || client.location || "",
    technicianName: report.projectInfo?.technicianName || report.signature?.technicianName || "",
    projectNumber: report.projectInfo?.projectNumber || reportId,
    senderName,
    recipientEmail: client.email || ""
  };
  const subject = fillTemplate(templateConfig.reportEmailSubject, tokens).trim() || fillTemplate(DEFAULT_REPORT_EMAIL_SUBJECT, tokens);
  const text = fillTemplate(templateConfig.reportEmailBody, tokens).trim() || fillTemplate(DEFAULT_REPORT_EMAIL_BODY, tokens);

  await mailer.transporter.sendMail({
    from: mailer.from,
    to: client.email,
    subject,
    text,
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

  const duration = String(report.templateFields?.visitDurationMinutes ?? "").trim() || "60";
  const sentAt = new Date().toISOString();

  await mailer.transporter.sendMail({
    from: mailer.from,
    to: client.email,
    subject: `Visita programada ${report.projectInfo?.projectNumber || reportId}`,
    text: [
      "Hola,",
      "",
      "Te confirmamos la visita programada.",
      "",
      `Cliente: ${client.name} ${client.surname}`.trim(),
      `Contacto: ${client.principalContact || "-"}`,
      `Ubicación: ${report.projectInfo?.locationObject || client.location || "-"}`,
      `Fecha y hora: ${appointment}`,
      `Duración estimada: ${duration} min`,
      "",
      "Gracias."
    ].join("\n")
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

  const { host, port, user, pass, from, appointmentEmailSubject, appointmentEmailBody, reportEmailSubject, reportEmailBody } = request.data as {
    host: string;
    port: number;
    user: string;
    pass?: string;
    from?: string;
    appointmentEmailSubject?: string;
    appointmentEmailBody?: string;
    reportEmailSubject?: string;
    reportEmailBody?: string;
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
    appointmentEmailSubject: String(appointmentEmailSubject ?? DEFAULT_APPOINTMENT_EMAIL_SUBJECT),
    appointmentEmailBody: String(appointmentEmailBody ?? DEFAULT_APPOINTMENT_EMAIL_BODY),
    reportEmailSubject: String(reportEmailSubject ?? DEFAULT_REPORT_EMAIL_SUBJECT),
    reportEmailBody: String(reportEmailBody ?? DEFAULT_REPORT_EMAIL_BODY),
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

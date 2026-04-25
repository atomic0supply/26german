import { ClientData, ReportListItem } from "../types";

export type ClientWorkspaceTab = "summary" | "agenda" | "reports";

export const getClientFullName = (client?: Pick<ClientData, "name" | "surname"> | null) =>
  client ? [client.name, client.surname].map((value) => value.trim()).filter(Boolean).join(" ") : "";

export const getClientPrimaryLabel = (client: ClientData) =>
  getClientFullName(client) || client.principalContact || client.email || client.location || client.id;

export const searchClients = (clients: ClientData[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return clients;
  }

  return clients.filter((client) =>
    [
      client.name,
      client.surname,
      client.principalContact,
      client.email,
      client.phone,
      client.location
    ].some((value) => value.toLowerCase().includes(normalized))
  );
};

export const getReportCountByClientId = (reports: ReportListItem[]) =>
  reports.reduce<Record<string, number>>((acc, report) => {
    if (report.clientId) {
      acc[report.clientId] = (acc[report.clientId] ?? 0) + 1;
    }
    return acc;
  }, {});

export const getVisitCountByClientId = (reports: ReportListItem[]) =>
  reports.reduce<Record<string, number>>((acc, report) => {
    if (report.clientId && report.appointmentDate) {
      acc[report.clientId] = (acc[report.clientId] ?? 0) + 1;
    }
    return acc;
  }, {});

export const getClientReports = (reports: ReportListItem[], clientId?: string) =>
  reports
    .filter((report) => report.clientId && report.clientId === clientId)
    .sort((left, right) => {
      const leftDate = left.updatedAt || "";
      const rightDate = right.updatedAt || "";
      return rightDate.localeCompare(leftDate);
    });

export const splitClientVisits = (reports: ReportListItem[], nowIso: string) => {
  const visits = reports
    .filter((report) => report.appointmentDate)
    .sort((left, right) => {
      const leftDate = left.appointmentDate ?? left.updatedAt;
      const rightDate = right.appointmentDate ?? right.updatedAt;
      return rightDate.localeCompare(leftDate) || right.updatedAt.localeCompare(left.updatedAt);
    });

  return visits.reduce(
    (acc, report) => {
      const appointmentDate = report.appointmentDate ?? "";
      if (appointmentDate && appointmentDate <= nowIso) {
        acc.past.push(report);
      } else {
        acc.upcoming.push(report);
      }
      return acc;
    },
    { past: [] as ReportListItem[], upcoming: [] as ReportListItem[] }
  );
};

export const getClientLastActivity = (client: ClientData, reports: ReportListItem[]) => {
  const newestReport = reports[0];
  const lastTouch = newestReport?.appointmentDate || newestReport?.updatedAt || client.updatedAt;
  return lastTouch || client.updatedAt;
};

export const canOpenPdfForReport = (report: ReportListItem) =>
  report.status === "finalized" && Boolean(report.finalization?.pdfUrl);

export const canSendReportEmail = (report: ReportListItem, client: ClientData | null) =>
  report.status === "finalized" && Boolean(report.clientId && client?.email?.trim());

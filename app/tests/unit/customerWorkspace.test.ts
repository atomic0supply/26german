import { describe, expect, it } from "vitest";
import {
  canOpenPdfForReport,
  canSendReportEmail,
  getClientReports,
  searchClients,
  splitClientVisits
} from "../../src/lib/customerWorkspace";
import { ClientData, ReportListItem } from "../../src/types";

const client: ClientData = {
  id: "client-1",
  name: "Ana",
  surname: "Lopez",
  principalContact: "Ana Lopez",
  email: "ana@example.com",
  phone: "+34123456789",
  location: "Madrid",
  createdBy: "user-1",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-20T10:00:00.000Z"
};

const makeReport = (overrides: Partial<ReportListItem> = {}): ReportListItem => ({
  id: "report-1",
  createdBy: "user-1",
  projectNumber: "PR-001",
  objectLabel: "Calle Mayor 1",
  clientId: client.id,
  appointmentDate: "2026-04-15T09:00:00.000Z",
  technicianName: "Technician",
  status: "draft",
  updatedAt: "2026-04-15T11:00:00.000Z",
  ...overrides
});

describe("customerWorkspace helpers", () => {
  it("filters clients by any searchable field", () => {
    const results = searchClients([client], "madrid");
    expect(results).toHaveLength(1);
    expect(searchClients([client], "nobody")).toHaveLength(0);
  });

  it("returns reports sorted by latest update first", () => {
    const newest = makeReport({ id: "newest", updatedAt: "2026-04-20T11:00:00.000Z" });
    const oldest = makeReport({ id: "oldest", updatedAt: "2026-04-10T11:00:00.000Z" });

    expect(getClientReports([oldest, newest], client.id).map((report) => report.id)).toEqual(["newest", "oldest"]);
  });

  it("splits visits into past and upcoming groups", () => {
    const past = makeReport({ id: "past", appointmentDate: "2026-04-15T09:00:00.000Z" });
    const upcoming = makeReport({ id: "upcoming", appointmentDate: "2026-04-30T09:00:00.000Z" });

    const result = splitClientVisits([past, upcoming], "2026-04-22T12:00:00.000Z");

    expect(result.past.map((report) => report.id)).toEqual(["past"]);
    expect(result.upcoming.map((report) => report.id)).toEqual(["upcoming"]);
  });

  it("enables PDF and email actions only for finalized reports with the required data", () => {
    const finalized = makeReport({
      status: "finalized",
      finalization: {
        pdfUrl: "https://example.com/report.pdf",
        finalizedAt: "2026-04-16T10:00:00.000Z"
      }
    });

    expect(canOpenPdfForReport(finalized)).toBe(true);
    expect(canSendReportEmail(finalized, client)).toBe(true);
    expect(canOpenPdfForReport(makeReport())).toBe(false);
    expect(canSendReportEmail(finalized, { ...client, email: "" })).toBe(false);
  });
});

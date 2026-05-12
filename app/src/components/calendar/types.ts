export type VisitStatus = "scheduled" | "draft" | "done";

export interface VisitItem {
  id: string;
  title: string;
  address: string;
  clientLabel?: string;
  clientEmail?: string;
  partnerLabel?: string;
  technician: string;
  when: string;
  durationMinutes?: string;
  notificationRecipient?: string;
  notificationSentAt?: string;
  status: VisitStatus;
  reportId?: string;
}

export type CalendarView = "week" | "month" | "agenda";

export type CalendarStatusFilter = "all" | VisitStatus;

import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="empty-panel">
    <strong>{title}</strong>
    <p>{description}</p>
    {action}
  </div>
);

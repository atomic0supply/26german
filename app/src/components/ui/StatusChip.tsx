interface StatusChipProps {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: string;
}

export const StatusChip = ({ tone = "neutral", children }: StatusChipProps) => (
  <span className={`status-chip status-chip--${tone}`}>{children}</span>
);

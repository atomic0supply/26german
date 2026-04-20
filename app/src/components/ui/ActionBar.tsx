import { ReactNode } from "react";

interface ActionBarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  aside?: ReactNode;
}

export const ActionBar = ({ primary, secondary, aside }: ActionBarProps) => (
  <div className="action-bar">
    <div className="action-bar__cluster">
      {secondary}
      {primary}
    </div>
    {aside && <div className="action-bar__aside">{aside}</div>}
  </div>
);

import { ReactNode } from "react";

interface ModuleHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: ReactNode;
}

export const ModuleHeader = ({ title, description, badge, actions }: ModuleHeaderProps) => {
  return (
    <header className="module-header surface">
      <div className="module-header__copy">
        {badge && <span className="module-header__badge">{badge}</span>}
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="module-header__actions">{actions}</div>}
    </header>
  );
};

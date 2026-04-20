import { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const SectionCard = ({ title, eyebrow, description, actions, children, className }: SectionCardProps) => (
  <section className={className ? `section-card ${className}` : "section-card"}>
    <header className="section-card__header">
      <div className="section-card__copy">
        {eyebrow && <span className="section-card__eyebrow">{eyebrow}</span>}
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="section-card__actions">{actions}</div>}
    </header>
    <div className="section-card__body">{children}</div>
  </section>
);

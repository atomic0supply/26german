import { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

interface SharedIconButtonProps {
  label: string;
  icon: ReactNode;
  description?: string;
  title?: string;
  tone?: "default" | "danger" | "accent";
}

type IconButtonAsButton = SharedIconButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type IconButtonAsLink = SharedIconButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

type IconButtonProps = IconButtonAsButton | IconButtonAsLink;

const isLinkProps = (props: IconButtonProps): props is IconButtonAsLink => typeof props.href === "string";

export const IconButton = (props: IconButtonProps) => {
  const { label, icon, description, title, tone = "default" } = props;
  const baseClassName = [
    "icon-button",
    tone === "danger" ? "icon-button--danger" : "",
    tone === "accent" ? "icon-button--accent" : ""
  ].filter(Boolean).join(" ");

  if (isLinkProps(props)) {
    const {
      className: linkClassName,
      children: _children,
      label: _label,
      icon: _icon,
      description: _description,
      title: _title,
      tone: _tone,
      ...anchorProps
    } = props;
    return (
      <a {...anchorProps} className={[baseClassName, linkClassName].filter(Boolean).join(" ")} aria-label={label} title={title ?? label}>
        <span className="icon-button__icon" aria-hidden="true">{icon}</span>
        <span className="icon-button__copy">
          <span className="icon-button__label">{label}</span>
          {description ? <small className="icon-button__description">{description}</small> : null}
        </span>
      </a>
    );
  }

  const {
    className: buttonClassName,
    children: _children,
    type,
    label: _label,
    icon: _icon,
    description: _description,
    title: _title,
    tone: _tone,
    ...buttonProps
  } = props;
  const buttonType = type === "submit" || type === "reset" || type === "button" ? type : "button";
  return (
    <button
      {...buttonProps}
      type={buttonType}
      className={[baseClassName, buttonClassName].filter(Boolean).join(" ")}
      aria-label={label}
      title={title ?? label}
    >
      <span className="icon-button__icon" aria-hidden="true">{icon}</span>
      <span className="icon-button__copy">
        <span className="icon-button__label">{label}</span>
        {description ? <small className="icon-button__description">{description}</small> : null}
      </span>
    </button>
  );
};

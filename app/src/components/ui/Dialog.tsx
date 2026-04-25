import { ReactNode, useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide" | "narrow";
}

export const Dialog = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "default"
}: DialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-root" role="presentation">
      <button type="button" className="dialog-backdrop" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`dialog-panel dialog-panel--${size}`}
      >
        <header className="dialog-panel__header">
          <div className="dialog-panel__copy">
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="dialog-panel__close ghost" aria-label="Close dialog" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="dialog-panel__body">{children}</div>
        {footer ? <footer className="dialog-panel__footer">{footer}</footer> : null}
      </div>
    </div>
  );
};

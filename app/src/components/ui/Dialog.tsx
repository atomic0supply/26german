import { ReactNode, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide" | "narrow";
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    const previousActive = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element inside the panel, or the panel itself.
    const focusFirst = () => {
      const root = panelRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? root).focus();
    };
    const focusTimer = window.setTimeout(focusFirst, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("data-focus-skip")
      );
      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="dialog-root" role="presentation">
          <motion.button
            type="button"
            className="dialog-backdrop"
            aria-label="Close dialog"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`dialog-panel dialog-panel--${size}`}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="dialog-panel__header">
              <div className="dialog-panel__copy">
                <h3>{title}</h3>
                {description ? <p>{description}</p> : null}
              </div>
              <button type="button" className="dialog-panel__close ghost" aria-label="Close dialog" onClick={onClose}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="dialog-panel__body">{children}</div>
            {footer ? <footer className="dialog-panel__footer">{footer}</footer> : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

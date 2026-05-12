import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Language, translate } from "../../i18n";

type SaveState = "idle" | "dirty" | "saving" | "saved";

interface SaveStatusBadgeProps {
  state: SaveState;
  lastSavedAt: string;
  errorMessage?: string;
  language: Language;
  isOnline: boolean;
  onRetry?: () => void;
}

const formatRelative = (iso: string, language: Language): string => {
  if (!iso) return translate(language, "noch nicht gespeichert", "todavía sin guardar");
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 5) return translate(language, "gerade eben", "hace un instante");
  if (diff < 60) return translate(language, `vor ${diff} s`, `hace ${diff} s`);
  const mins = Math.floor(diff / 60);
  if (mins < 60) return translate(language, `vor ${mins} min`, `hace ${mins} min`);
  const hours = Math.floor(mins / 60);
  return translate(language, `vor ${hours} h`, `hace ${hours} h`);
};

export const SaveStatusBadge = ({
  state,
  lastSavedAt,
  errorMessage,
  language,
  isOnline,
  onRetry,
}: SaveStatusBadgeProps) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const t = (de: string, es: string) => translate(language, de, es);

  let variant: "ok" | "warning" | "saving" | "error" | "offline";
  let icon: React.ReactNode;
  let label: string;
  let interactive = false;

  if (!isOnline) {
    variant = "offline";
    icon = <CloudOff size={14} aria-hidden="true" />;
    label = t("Offline · lokal gesichert", "Sin conexión · guardado en local");
  } else if (errorMessage) {
    variant = "error";
    icon = <RefreshCw size={14} aria-hidden="true" />;
    label = t("Speichern fehlgeschlagen · erneut versuchen", "Error al guardar · reintentar");
    interactive = true;
  } else if (state === "saving") {
    variant = "saving";
    icon = (
      <motion.span
        style={{ display: "inline-flex" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 size={14} aria-hidden="true" />
      </motion.span>
    );
    label = t("Speichert…", "Guardando…");
  } else if (state === "dirty") {
    variant = "warning";
    icon = <AlertTriangle size={14} aria-hidden="true" />;
    label = t("Bearbeitung – Auto-Speichern…", "Editando – guardando…");
  } else {
    variant = "ok";
    icon = <Check size={14} aria-hidden="true" />;
    label = t(`Gespeichert · ${formatRelative(lastSavedAt, language)}`, `Guardado · ${formatRelative(lastSavedAt, language)}`);
  }

  const className = `save-status-badge save-status-badge--${variant}`;
  const content = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={variant + label}
        className="save-status-badge__inner"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {icon}
        <span>{label}</span>
      </motion.span>
    </AnimatePresence>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        onClick={onRetry}
        title={errorMessage}
        role="status"
        aria-live="assertive"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} role="status" aria-live="polite">
      {content}
    </div>
  );
};

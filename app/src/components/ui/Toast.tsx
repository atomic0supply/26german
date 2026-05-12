import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, PartyPopper, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info" | "celebrate";

export interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <Check size={16} strokeWidth={3} aria-hidden="true" />,
  error: <X size={16} strokeWidth={3} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
  celebrate: <PartyPopper size={16} aria-hidden="true" />,
};

const ToastItem = ({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) => {
  useEffect(() => {
    const exitTimer = setTimeout(() => onDismiss(message.id), 4000);
    return () => clearTimeout(exitTimer);
  }, [message.id, onDismiss]);

  const isCelebrate = message.tone === "celebrate";

  return (
    <motion.div
      className={`toast toast--${message.tone}`}
      role="status"
      aria-live="polite"
      onClick={() => onDismiss(message.id)}
      initial={{ opacity: 0, y: 14, scale: isCelebrate ? 0.8 : 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: isCelebrate
          ? { type: "spring", stiffness: 380, damping: 18 }
          : { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
      }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
      layout
    >
      <span className="toast__icon">{ICONS[message.tone]}</span>
      <span className="toast__text">{message.text}</span>
    </motion.div>
  );
};

export const Toast = ({ messages, onDismiss }: ToastProps) => {
  return (
    <div className="toast-container" aria-label="Notifications">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};

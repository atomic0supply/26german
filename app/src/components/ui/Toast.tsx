import { useEffect, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  text: string;
  tone: ToastTone;
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<ToastTone, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ"
};

const ToastItem = ({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss after 4 s
    const exitTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(message.id), 300);
    }, 4000);
    return () => { clearTimeout(enterTimer); clearTimeout(exitTimer); };
  }, [message.id, onDismiss]);

  return (
    <div
      className={`toast toast--${message.tone} ${visible ? "toast--visible" : ""}`}
      role="status"
      aria-live="polite"
      onClick={() => { setVisible(false); setTimeout(() => onDismiss(message.id), 300); }}
    >
      <span className="toast__icon">{ICONS[message.tone]}</span>
      <span className="toast__text">{message.text}</span>
    </div>
  );
};

export const Toast = ({ messages, onDismiss }: ToastProps) => {
  if (messages.length === 0) return null;
  return (
    <div className="toast-container" aria-label="Notifications">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

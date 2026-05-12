import { useEffect, useRef } from "react";

export interface ShortcutBinding {
  /** Single key (case-insensitive) or special key like "ArrowLeft", "Escape", "k". */
  key: string;
  /** Require Cmd (mac) or Ctrl (other). */
  mod?: boolean;
  /** Require Alt/Option. */
  alt?: boolean;
  /** Require Shift. */
  shift?: boolean;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
};

const matches = (event: KeyboardEvent, binding: ShortcutBinding): boolean => {
  const mod = event.metaKey || event.ctrlKey;
  if (binding.mod && !mod) return false;
  if (!binding.mod && mod) return false;
  if (Boolean(binding.alt) !== event.altKey) return false;
  if (Boolean(binding.shift) !== event.shiftKey) return false;
  return event.key.toLowerCase() === binding.key.toLowerCase();
};

/**
 * Bind a global keyboard shortcut. When `binding.mod` is false, the shortcut
 * is suppressed while focus is in an editable element so typing keeps working.
 */
export const useKeyboardShortcut = (
  binding: ShortcutBinding,
  handler: (event: KeyboardEvent) => void,
  enabled: boolean = true
) => {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matches(event, binding)) return;
      if (!binding.mod && isEditableTarget(event.target)) return;
      event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [binding.key, binding.mod, binding.alt, binding.shift, enabled]);
};

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Command, Search } from "lucide-react";

export interface CommandPaletteItem {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  icon?: ReactNode;
  keywords?: string;
  onRun: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  placeholder?: string;
}

const score = (item: CommandPaletteItem, query: string): number => {
  if (!query) return 1;
  const haystack = `${item.label} ${item.hint ?? ""} ${item.group ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  const q = query.toLowerCase();
  if (haystack.includes(q)) return 100 - haystack.indexOf(q);
  // fuzzy fallback: all query chars appear in order
  let idx = 0;
  for (const ch of q) {
    const next = haystack.indexOf(ch, idx);
    if (next === -1) return 0;
    idx = next + 1;
  }
  return 1;
};

export const CommandPalette = ({ open, onClose, items, placeholder }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return items
      .map((item) => ({ item, score: score(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(filtered.length - 1, prev + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[activeIndex];
        if (item) {
          item.onRun();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(`[data-cp-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && (
        <div className="command-palette-root" role="presentation">
          <motion.button
            type="button"
            className="command-palette-backdrop"
            aria-label="Close command palette"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          />
          <motion.div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="command-palette__header">
              <Search size={16} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder ?? "Type a command…"}
                aria-label="Command search"
                className="command-palette__input"
              />
              <kbd className="command-palette__kbd">
                <Command size={11} aria-hidden="true" /> K
              </kbd>
            </header>
            <div className="command-palette__list" ref={listRef}>
              {filtered.length === 0 ? (
                <div className="command-palette__empty">No matches</div>
              ) : (
                filtered.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    data-cp-index={index}
                    className={`command-palette__item${index === activeIndex ? " command-palette__item--active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      item.onRun();
                      onClose();
                    }}
                  >
                    {item.icon && <span className="command-palette__icon">{item.icon}</span>}
                    <span className="command-palette__label">
                      <span>{item.label}</span>
                      {item.group && <small>{item.group}</small>}
                    </span>
                    {item.hint && <span className="command-palette__hint">{item.hint}</span>}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

import { TemplateFieldSchema } from "../../types";

interface TemplateToolPanelProps {
  tool: TemplateFieldSchema["type"] | null;
  zoom: number;
  visiblePage: number | "all";
  pagesCount: number;
  onToolChange: (tool: TemplateFieldSchema["type"] | null) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onVisiblePageChange: (value: number | "all") => void;
  t: (deValue: string, esValue: string) => string;
}

const TOOLBAR_ITEMS: Array<{ type: TemplateFieldSchema["type"]; label: string }> = [
  { type: "text", label: "Text" },
  { type: "textarea", label: "Textarea" },
  { type: "checkbox", label: "Checkbox" },
  { type: "dropdown", label: "Dropdown" },
  { type: "image", label: "Image" },
  { type: "signature", label: "Signature" }
];

export const TemplateToolPanel = ({
  tool,
  zoom,
  visiblePage,
  pagesCount,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onVisiblePageChange,
  t
}: TemplateToolPanelProps) => {
  return (
    <section className="stack">
      <article className="card stack template-tool-panel">
        <h3>{t("Werkzeuge", "Herramientas")}</h3>
        <p className="template-library-hint">
          {tool
            ? t("Klicke auf die Seite, um das Feld zu platzieren.", "Haz clic en la página para colocar el campo.")
            : t("Wähle ein Werkzeug und klicke dann auf das PDF.", "Elige una herramienta y luego haz clic sobre el PDF.")}
        </p>
        <div className="template-tool-grid">
          {TOOLBAR_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              className={tool === item.type ? "tab active" : "tab"}
              onClick={() => onToolChange(item.type)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </article>

      <article className="card stack template-tool-panel">
        <h3>{t("Vista", "Vista")}</h3>
        <div className="row">
          <button type="button" className="ghost" onClick={onZoomOut}>
            -
          </button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button type="button" className="ghost" onClick={onZoomIn}>
            +
          </button>
          <button type="button" className="ghost" onClick={onZoomReset}>
            100%
          </button>
        </div>
        <label>
          {t("Seite filtern", "Filtrar página")}
          <select
            value={String(visiblePage)}
            onChange={(event) => onVisiblePageChange(event.target.value === "all" ? "all" : Number(event.target.value))}
          >
            <option value="all">{t("Alle Seiten", "Todas las páginas")}</option>
            {Array.from({ length: pagesCount }).map((_, index) => (
              <option key={index} value={index}>
                {t("Seite", "Página")} {index + 1}
              </option>
            ))}
          </select>
        </label>
      </article>
    </section>
  );
};

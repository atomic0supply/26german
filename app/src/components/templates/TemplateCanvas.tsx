import { MouseEvent as ReactMouseEvent, MutableRefObject } from "react";
import { TemplateFieldSchema, TemplateVersion } from "../../types";
import { TemplateFieldOverlay } from "./TemplateFieldOverlay";

type RenderedPage = {
  index: number;
  src: string;
  width: number;
  height: number;
};

interface TemplateCanvasProps {
  pages: RenderedPage[];
  visiblePage: number | "all";
  zoom: number;
  activeVersion: TemplateVersion | null;
  selectedFieldId: string;
  draggingFieldId: string;
  pageRefs: MutableRefObject<Record<number, HTMLDivElement | null>>;
  onPlaceField: (pageIndex: number, event: ReactMouseEvent<HTMLDivElement>) => void;
  onSelectField: (field: TemplateFieldSchema) => void;
  onStartDrag: (event: ReactMouseEvent<HTMLElement>, field: TemplateFieldSchema, mode: "move" | "resize") => void;
  t: (deValue: string, esValue: string) => string;
}

export const TemplateCanvas = ({
  pages,
  visiblePage,
  zoom,
  activeVersion,
  selectedFieldId,
  draggingFieldId,
  pageRefs,
  onPlaceField,
  onSelectField,
  onStartDrag,
  t
}: TemplateCanvasProps) => {
  const visiblePages = pages.filter((page) => visiblePage === "all" || page.index === visiblePage);

  if (pages.length === 0) {
    return (
      <article className="card stack template-canvas-empty">
        <h3>{t("Canvas", "Lienzo")}</h3>
        <p className="empty-state">
          {t(
            "Lade zuerst ein Basis-PDF hoch, um mit dem Platzieren von Feldern zu beginnen.",
            "Sube primero un PDF base para empezar a colocar campos."
          )}
        </p>
      </article>
    );
  }

  return (
    <section className="template-canvas-stack">
      {visiblePages.map((page) => (
        <article key={page.index} className="template-page-card">
          <div className="template-page-title-row">
            <div className="template-page-title">
              {t("Seite", "Página")} {page.index + 1}
            </div>
            <small>
              {activeVersion?.fieldSchema.filter((field) => field.page === page.index).length ?? 0} {t("Felder", "campos")}
            </small>
          </div>
          <div
            ref={(node) => {
              if (pageRefs.current) {
                pageRefs.current[page.index] = node;
              }
            }}
            className="template-page-surface"
            style={{ width: page.width * zoom, height: page.height * zoom }}
            onClick={(event) => onPlaceField(page.index, event)}
          >
            <img src={page.src} alt={`page-${page.index + 1}`} draggable={false} style={{ width: page.width * zoom, height: page.height * zoom }} />
            {activeVersion?.fieldSchema
              .filter((field) => field.page === page.index)
              .map((field) => (
                <TemplateFieldOverlay
                  key={field.id}
                  field={field}
                  selected={selectedFieldId === field.id}
                  dragging={draggingFieldId === field.id}
                  onSelect={onSelectField}
                  onStartDrag={onStartDrag}
                />
              ))}
          </div>
        </article>
      ))}
    </section>
  );
};

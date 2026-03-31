import { MouseEvent as ReactMouseEvent } from "react";
import { TemplateFieldSchema } from "../../types";

interface TemplateFieldOverlayProps {
  field: TemplateFieldSchema;
  selected: boolean;
  dragging: boolean;
  onSelect: (field: TemplateFieldSchema) => void;
  onStartDrag: (event: ReactMouseEvent<HTMLElement>, field: TemplateFieldSchema, mode: "move" | "resize") => void;
}

export const TemplateFieldOverlay = ({
  field,
  selected,
  dragging,
  onSelect,
  onStartDrag
}: TemplateFieldOverlayProps) => {
  return (
    <div
      className={[
        "template-field",
        `field-type-${field.type}`,
        field.generatedByAi ? "field-ai-generated" : "",
        selected ? "active" : "",
        dragging ? "dragging" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      title={
        field.generatedByAi
          ? `${field.label}${typeof field.aiConfidence === "number" ? ` · AI ${Math.round(field.aiConfidence * 100)}%` : " · AI"}`
          : field.label
      }
      style={{
        left: `${field.rect.x * 100}%`,
        top: `${field.rect.y * 100}%`,
        width: `${field.rect.width * 100}%`,
        height: `${field.rect.height * 100}%`
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(field);
      }}
    >
      <button type="button" className="template-field-grip" onMouseDown={(event) => onStartDrag(event, field, "move")}>
        {field.generatedByAi ? "AI" : field.type}
      </button>
      <span>{field.label}</span>
      <button type="button" className="resize-handle" onMouseDown={(event) => onStartDrag(event, field, "resize")} />
    </div>
  );
};

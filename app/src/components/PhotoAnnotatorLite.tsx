import { useEffect, useMemo, useRef, useState } from "react";
import { Language, translate } from "../i18n";

export type PhotoAnnotationShape = "pin" | "circle" | "rect" | "arrow";

export interface PhotoAnnotation {
  id: string;
  x: number;
  y: number;
  note?: string;
  type?: PhotoAnnotationShape;
  width?: number;
  height?: number;
  endX?: number;
  endY?: number;
  rotation?: number;
}

interface PhotoAnnotatorLiteProps {
  imageUrl: string;
  annotations: PhotoAnnotation[];
  language: Language;
  disabled?: boolean;
  onChange: (annotations: PhotoAnnotation[]) => void;
}

type AnnotationInteractionMode = "move" | "resize" | "arrow-end";

interface AnnotationInteraction {
  pointerId: number;
  annotationId: string;
  mode: AnnotationInteractionMode;
  startAnnotation: PhotoAnnotation;
  startPoint: { x: number; y: number };
}

const DEFAULT_SIZE = 0.16;
const DEFAULT_HEIGHT = 0.1;
const PIN_SIZE = 0.05;
const MIN_SIZE = 0.03;
const MAX_SIZE = 0.7;
const EDGE_PADDING = 0.02;
const HANDLE_RADIUS = 1.7;
const SHAPE_STROKE = "#0f6b8d";
const SHAPE_FILL = "rgba(15, 107, 141, 0.16)";
const SHAPE_FILL_ACTIVE = "rgba(15, 107, 141, 0.22)";

const clamp = (value: number, min = EDGE_PADDING, max = 1 - EDGE_PADDING) => Math.min(max, Math.max(min, value));
const clampSize = (value: number, min = MIN_SIZE, max = MAX_SIZE) => Math.min(max, Math.max(min, value));

const toolLabel = (language: Language, tool: PhotoAnnotationShape) => {
  if (tool === "circle") return translate(language, "Círculo", "Kreis");
  if (tool === "rect") return translate(language, "Rectángulo", "Rechteck");
  if (tool === "arrow") return translate(language, "Flecha", "Pfeil");
  return translate(language, "Punto", "Punkt");
};

const toolGlyph = (tool: PhotoAnnotationShape) => {
  if (tool === "circle") return "O";
  if (tool === "rect") return "[]";
  if (tool === "arrow") return "->";
  return "+";
};

const getArrowEndpointNormalized = (annotation: Pick<PhotoAnnotation, "x" | "y" | "width" | "rotation">) => {
  const length = annotation.width ?? DEFAULT_SIZE;
  const rotation = ((annotation.rotation ?? 35) * Math.PI) / 180;
  return {
    x: clamp(annotation.x + Math.cos(rotation) * length),
    y: clamp(annotation.y + Math.sin(rotation) * length)
  };
};

const buildArrowHead = (x1: number, y1: number, x2: number, y2: number) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 3.4;
  const left = `${x2 - size * Math.cos(angle - Math.PI / 6)},${y2 - size * Math.sin(angle - Math.PI / 6)}`;
  const right = `${x2 - size * Math.cos(angle + Math.PI / 6)},${y2 - size * Math.sin(angle + Math.PI / 6)}`;
  return `${x2},${y2} ${left} ${right}`;
};

const rotatePoint = (cx: number, cy: number, x: number, y: number, rotation: number) => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - cx;
  const dy = y - cy;

  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  };
};

const normalizeArrow = (annotation: PhotoAnnotation): PhotoAnnotation => {
  const x = clamp(annotation.x);
  const y = clamp(annotation.y);
  const width = clampSize(Number(annotation.width ?? DEFAULT_SIZE));
  const rotation = Number(annotation.rotation ?? 35);
  const endpoint = getArrowEndpointNormalized({ x, y, width, rotation });

  return {
    ...annotation,
    x,
    y,
    type: "arrow",
    width,
    height: Math.max(MIN_SIZE, Number(annotation.height ?? DEFAULT_HEIGHT)),
    endX: endpoint.x,
    endY: endpoint.y,
    rotation
  };
};

const normalizeAnnotation = (annotation: PhotoAnnotation): PhotoAnnotation => {
  const type = annotation.type ?? "pin";
  const width = clampSize(Number(annotation.width ?? (type === "pin" ? PIN_SIZE : DEFAULT_SIZE)));
  const height = clampSize(Number(annotation.height ?? (type === "pin" ? PIN_SIZE : DEFAULT_HEIGHT)));
  const normalized: PhotoAnnotation = {
    id: annotation.id,
    x: clamp(Number(annotation.x ?? 0.5)),
    y: clamp(Number(annotation.y ?? 0.5)),
    note: annotation.note ?? "",
    type,
    width,
    height,
    endX: clamp(Number(annotation.endX ?? Number(annotation.x ?? 0.5) + 0.15)),
    endY: clamp(Number(annotation.endY ?? Number(annotation.y ?? 0.5) + 0.1)),
    rotation: Number(annotation.rotation ?? 0)
  };

  if (type === "arrow") {
    return normalizeArrow(normalized);
  }

  return normalized;
};

const ensureShapeInsideFrame = (annotation: PhotoAnnotation): PhotoAnnotation => {
  if (annotation.type === "arrow") {
    return normalizeArrow(annotation);
  }

  const halfWidth = (annotation.width ?? DEFAULT_SIZE) / 2;
  const halfHeight = (annotation.height ?? DEFAULT_HEIGHT) / 2;

  return normalizeAnnotation({
    ...annotation,
    x: clamp(annotation.x, EDGE_PADDING + halfWidth, 1 - EDGE_PADDING - halfWidth),
    y: clamp(annotation.y, EDGE_PADDING + halfHeight, 1 - EDGE_PADDING - halfHeight)
  });
};

const syncArrowWithEndpoint = (annotation: PhotoAnnotation, endX: number, endY: number): PhotoAnnotation => {
  const dx = endX - annotation.x;
  const dy = endY - annotation.y;
  const length = clampSize(Math.sqrt(dx * dx + dy * dy));
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;

  return normalizeArrow({
    ...annotation,
    width: length,
    rotation,
    endX,
    endY
  });
};

const getCanvasPoint = (
  coordinates: { clientX: number; clientY: number },
  element: SVGSVGElement | null
) => {
  if (!element) {
    return { x: 0.5, y: 0.5 };
  }

  const bounds = element.getBoundingClientRect();
  return {
    x: clamp((coordinates.clientX - bounds.left) / bounds.width),
    y: clamp((coordinates.clientY - bounds.top) / bounds.height)
  };
};

export const PhotoAnnotatorLite = ({
  imageUrl,
  annotations,
  language,
  disabled = false,
  onChange
}: PhotoAnnotatorLiteProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<AnnotationInteraction | null>(null);

  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedTool, setSelectedTool] = useState<PhotoAnnotationShape>("arrow");

  const normalizedAnnotations = useMemo(
    () => annotations.map(normalizeAnnotation),
    [annotations]
  );

  const selectedIndex = normalizedAnnotations.findIndex((annotation) => annotation.id === selectedId);
  const selected = selectedIndex >= 0 ? normalizedAnnotations[selectedIndex] : null;

  useEffect(() => {
    if (!normalizedAnnotations.length) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }

    if (!selected || !normalizedAnnotations.some((annotation) => annotation.id === selected.id)) {
      setSelectedId(normalizedAnnotations[normalizedAnnotations.length - 1].id);
    }
  }, [normalizedAnnotations, selected, selectedId]);

  useEffect(() => {
    if (!selectedId || disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onChange(normalizedAnnotations.filter((annotation) => annotation.id !== selectedId));
        setSelectedId("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, normalizedAnnotations, onChange, selectedId]);

  const pushUpdate = (next: PhotoAnnotation[]) => {
    onChange(next.map(normalizeAnnotation));
  };

  const replaceAnnotation = (annotationId: string, nextAnnotation: PhotoAnnotation) => {
    pushUpdate(
      normalizedAnnotations.map((annotation) =>
        annotation.id === annotationId ? nextAnnotation : annotation
      )
    );
  };

  const updateSelected = (patch: Partial<PhotoAnnotation>) => {
    if (!selected) {
      return;
    }

    const nextAnnotation =
      selected.type === "arrow"
        ? normalizeArrow({
            ...selected,
            ...patch
          })
        : ensureShapeInsideFrame({
            ...selected,
            ...patch
          });

    replaceAnnotation(selected.id, nextAnnotation);
  };

  const addShapeAtPoint = (x: number, y: number) => {
    if (disabled) {
      return;
    }

    const nextBase: PhotoAnnotation = {
      id: crypto.randomUUID(),
      x,
      y,
      type: selectedTool,
      width: selectedTool === "pin" ? PIN_SIZE : DEFAULT_SIZE,
      height: selectedTool === "pin" ? PIN_SIZE : DEFAULT_HEIGHT,
      rotation: selectedTool === "arrow" ? 25 : 0
    };

    const next =
      selectedTool === "arrow"
        ? normalizeArrow(nextBase)
        : ensureShapeInsideFrame(nextBase);

    pushUpdate([...normalizedAnnotations, next]);
    setSelectedId(next.id);
  };

  const handleCanvasAdd = (event: React.MouseEvent<SVGRectElement>) => {
    if (disabled) {
      return;
    }

    const point = getCanvasPoint({ clientX: event.clientX, clientY: event.clientY }, overlayRef.current);
    addShapeAtPoint(point.x, point.y);
  };

  const startInteraction = (
    event: React.PointerEvent<SVGElement>,
    annotation: PhotoAnnotation,
    mode: AnnotationInteractionMode
  ) => {
    if (disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedId(annotation.id);

    overlayRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      annotationId: annotation.id,
      mode,
      startAnnotation: annotation,
      startPoint: getCanvasPoint({ clientX: event.clientX, clientY: event.clientY }, overlayRef.current)
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point = getCanvasPoint({ clientX: event.clientX, clientY: event.clientY }, overlayRef.current);
    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;
    const base = interaction.startAnnotation;

    if (interaction.mode === "move") {
      if (base.type === "arrow") {
        const moved = normalizeArrow({
          ...base,
          x: base.x + dx,
          y: base.y + dy
        });
        replaceAnnotation(base.id, moved);
        return;
      }

      replaceAnnotation(
        base.id,
        ensureShapeInsideFrame({
          ...base,
          x: base.x + dx,
          y: base.y + dy
        })
      );
      return;
    }

    if (interaction.mode === "arrow-end" && base.type === "arrow") {
      replaceAnnotation(base.id, syncArrowWithEndpoint(base, point.x, point.y));
      return;
    }

    if (interaction.mode === "resize") {
      if (base.type === "circle") {
        const radius = clampSize(Math.max(Math.abs(point.x - base.x), Math.abs(point.y - base.y)) * 2);
        replaceAnnotation(
          base.id,
          ensureShapeInsideFrame({
            ...base,
            width: radius,
            height: radius
          })
        );
        return;
      }

      if (base.type === "pin") {
        const size = clampSize(Math.max(Math.abs(point.x - base.x), Math.abs(point.y - base.y)) * 2, PIN_SIZE, 0.2);
        replaceAnnotation(
          base.id,
          ensureShapeInsideFrame({
            ...base,
            width: size,
            height: size
          })
        );
        return;
      }

      replaceAnnotation(
        base.id,
        ensureShapeInsideFrame({
          ...base,
          width: clampSize(Math.abs(point.x - base.x) * 2),
          height: clampSize(Math.abs(point.y - base.y) * 2)
        })
      );
    }
  };

  const stopInteraction = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    interactionRef.current = null;

    if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const removeSelected = () => {
    if (!selected) {
      return;
    }

    pushUpdate(normalizedAnnotations.filter((annotation) => annotation.id !== selected.id));
    setSelectedId("");
  };

  const clearAll = () => {
    pushUpdate([]);
    setSelectedId("");
  };

  const renderShape = (annotation: PhotoAnnotation) => {
    const active = annotation.id === selectedId;
    const accent = SHAPE_STROKE;
    const fill = active ? SHAPE_FILL_ACTIVE : SHAPE_FILL;
    const cx = annotation.x * 100;
    const cy = annotation.y * 100;
    const width = (annotation.width ?? DEFAULT_SIZE) * 100;
    const height = (annotation.height ?? DEFAULT_HEIGHT) * 100;
    const rotation = annotation.rotation ?? 0;
    const arrowEndpoint = getArrowEndpointNormalized(annotation);
    const arrowEndX = arrowEndpoint.x * 100;
    const arrowEndY = arrowEndpoint.y * 100;
    const resizeHandle = rotatePoint(cx, cy, cx + width / 2, cy + height / 2, rotation);

    if (annotation.type === "arrow") {
      return (
        <g key={annotation.id} className={active ? "annotator__shape annotator__shape--active" : "annotator__shape"}>
          <line
            x1={cx}
            y1={cy}
            x2={arrowEndX}
            y2={arrowEndY}
            stroke={accent}
            strokeWidth={active ? 2.2 : 1.8}
            strokeLinecap="round"
            onPointerDown={(event) => startInteraction(event, annotation, "move")}
          />
          <polygon points={buildArrowHead(cx, cy, arrowEndX, arrowEndY)} fill={accent} />
          <circle cx={cx} cy={cy} r={1.3} fill="#ffffff" stroke={accent} strokeWidth={0.65} />
          <circle
            className="annotator__handle"
            cx={arrowEndX}
            cy={arrowEndY}
            r={HANDLE_RADIUS}
            fill="#ffffff"
            stroke={accent}
            strokeWidth={0.7}
            onPointerDown={(event) => startInteraction(event, annotation, "arrow-end")}
          />
          <circle
            className="annotator__handle annotator__handle--origin"
            cx={cx}
            cy={cy}
            r={HANDLE_RADIUS}
            fill={active ? accent : "#ffffff"}
            stroke={accent}
            strokeWidth={0.7}
            onPointerDown={(event) => startInteraction(event, annotation, "move")}
          />
          {active && (
            <text x={cx + 1.8} y={cy - 2} className="annotator__hint-text">
              {t("Arrastra el extremo", "Ende ziehen")}
            </text>
          )}
        </g>
      );
    }

    if (annotation.type === "circle") {
      return (
        <g key={annotation.id} className={active ? "annotator__shape annotator__shape--active" : "annotator__shape"}>
          <ellipse
            cx={cx}
            cy={cy}
            rx={width / 2}
            ry={height / 2}
            fill={fill}
            stroke={accent}
            strokeWidth={active ? 2 : 1.6}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            onPointerDown={(event) => startInteraction(event, annotation, "move")}
          />
          <circle
            className="annotator__handle"
            cx={resizeHandle.x}
            cy={resizeHandle.y}
            r={HANDLE_RADIUS}
            fill="#ffffff"
            stroke={accent}
            strokeWidth={0.7}
            onPointerDown={(event) => startInteraction(event, annotation, "resize")}
          />
        </g>
      );
    }

    if (annotation.type === "rect") {
      return (
        <g key={annotation.id} className={active ? "annotator__shape annotator__shape--active" : "annotator__shape"}>
          <rect
            x={cx - width / 2}
            y={cy - height / 2}
            width={width}
            height={height}
            rx={2.6}
            fill={fill}
            stroke={accent}
            strokeWidth={active ? 2 : 1.6}
            transform={`rotate(${rotation} ${cx} ${cy})`}
            onPointerDown={(event) => startInteraction(event, annotation, "move")}
          />
          <circle
            className="annotator__handle"
            cx={resizeHandle.x}
            cy={resizeHandle.y}
            r={HANDLE_RADIUS}
            fill="#ffffff"
            stroke={accent}
            strokeWidth={0.7}
            onPointerDown={(event) => startInteraction(event, annotation, "resize")}
          />
        </g>
      );
    }

    return (
      <g key={annotation.id} className={active ? "annotator__shape annotator__shape--active" : "annotator__shape"}>
        <circle
          cx={cx}
          cy={cy}
          r={Math.max(2.8, width * 24)}
          fill={fill}
          stroke={accent}
          strokeWidth={active ? 2 : 1.6}
          onPointerDown={(event) => startInteraction(event, annotation, "move")}
        />
        <line x1={cx - 2.6} y1={cy} x2={cx + 2.6} y2={cy} stroke={accent} strokeWidth={0.7} />
        <line x1={cx} y1={cy - 2.6} x2={cx} y2={cy + 2.6} stroke={accent} strokeWidth={0.7} />
        <circle
          className="annotator__handle"
          cx={cx + Math.max(3.4, width * 24)}
          cy={cy + Math.max(3.4, width * 24)}
          r={HANDLE_RADIUS}
          fill="#ffffff"
            stroke={accent}
            strokeWidth={0.7}
            onPointerDown={(event) => startInteraction(event, annotation, "resize")}
          />
      </g>
    );
  };

  return (
    <div className="annotator">
      <div className="annotator__topbar">
        <div className="annotator__tool-picker" role="toolbar" aria-label={t("Herramientas de marcado", "Werkzeuge für Markierungen")}>
          {(["arrow", "rect", "circle", "pin"] as PhotoAnnotationShape[]).map((tool) => (
            <button
              key={tool}
              type="button"
              className={selectedTool === tool ? "ghost annotator__tool active" : "ghost annotator__tool"}
              disabled={disabled}
              onClick={() => setSelectedTool(tool)}
            >
              <span className="annotator__tool-glyph" aria-hidden="true">{toolGlyph(tool)}</span>
              <span>{toolLabel(language, tool)}</span>
            </button>
          ))}
        </div>

        <div className="annotator__actions">
          <button type="button" className="ghost annotator__action" disabled={disabled || !selected} onClick={removeSelected}>
            {t("Borrar seleccionada", "Auswahl löschen")}
          </button>
          <button type="button" className="ghost annotator__action" disabled={disabled || normalizedAnnotations.length === 0} onClick={clearAll}>
            {t("Limpiar foto", "Foto leeren")}
          </button>
        </div>
      </div>

      <div className={disabled ? "annotator__canvas annotator__canvas--disabled" : "annotator__canvas"}>
        <img src={imageUrl} alt="" draggable={false} />
        <svg
          ref={overlayRef}
          className="annotator__overlay"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          onPointerMove={handlePointerMove}
          onPointerUp={stopInteraction}
          onPointerCancel={stopInteraction}
        >
          <rect className="annotator__hit-area" x="0" y="0" width="100" height="100" fill="transparent" onClick={handleCanvasAdd} />
          {normalizedAnnotations.map(renderShape)}
        </svg>
      </div>

      <div className="annotator__toolbar">
        {selected ? (
          <small>
            {t(
              "Arrastra la marca para moverla y usa el asa para ajustarla.",
              "Markierung ziehen zum Verschieben und Griff zum Anpassen verwenden."
            )}
          </small>
        ) : (
          <small>
            {t(
              "Selecciona una marca para moverla, borrarla o ajustar tamaño y rotación.",
              "Markierung auswählen, um sie zu verschieben, zu löschen oder Größe und Drehung anzupassen."
            )}
          </small>
        )}
      </div>
    </div>
  );
};

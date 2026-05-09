import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Language, translate } from "../i18n";

// ── Types ──────────────────────────────────────────────────────────────────────
export type PhotoAnnotationShape = "arrow" | "rect" | "circle" | "pin" | "pen" | "text";

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
  color?: string;
  strokeWidth?: number;
  points?: Array<{ x: number; y: number }>;
  text?: string;
}

interface PhotoAnnotatorLiteProps {
  imageUrl: string;
  annotations: PhotoAnnotation[];
  language: Language;
  disabled?: boolean;
  onChange: (annotations: PhotoAnnotation[]) => void;
}

type ActiveTool = "select" | "arrow" | "rect" | "circle" | "pin" | "pen" | "text";
type InteractionMode = "move" | "resize" | "arrow-end";

interface ActiveInteraction {
  pointerId: number;
  annotationId: string;
  mode: InteractionMode;
  startAnnotation: PhotoAnnotation;
  startPoint: { x: number; y: number };
}

// ── Constants ──────────────────────────────────────────────────────────────────
const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];
const DEFAULT_COLOR = "#ef4444";
const DEFAULT_W = 0.13;
const DEFAULT_H = 0.09;
const PIN_SZ = 0.04;
const MIN_SZ = 0.03;
const MAX_SZ = 0.75;
const PAD = 0.02;
const HNDL = 1.4;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const clamp = (v: number, lo = PAD, hi = 1 - PAD) => Math.min(hi, Math.max(lo, v));
const clampSz = (v: number, lo = MIN_SZ, hi = MAX_SZ) => Math.min(hi, Math.max(lo, v));

// ── Icons (Lucide-style inline SVG) ───────────────────────────────────────────
const Ic = {
  select: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>,
  arrow:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  rect:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>,
  circle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/></svg>,
  pen:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  pin:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/></svg>,
  text:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  undo:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>,
  redo:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>,
  trash:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  clear:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>,
  zoomIn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
  zoomOut:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
};

// ── Geometry helpers ───────────────────────────────────────────────────────────
const arrowEndpoint = (a: Pick<PhotoAnnotation, "x" | "y" | "width" | "rotation">) => {
  const len = a.width ?? DEFAULT_W;
  const rad = ((a.rotation ?? 35) * Math.PI) / 180;
  return { x: clamp(a.x + Math.cos(rad) * len), y: clamp(a.y + Math.sin(rad) * len) };
};

const arrowHead = (x1: number, y1: number, x2: number, y2: number) => {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const sz = 1.9;
  const l = `${x2 - sz * Math.cos(ang - Math.PI / 7)},${y2 - sz * Math.sin(ang - Math.PI / 7)}`;
  const r = `${x2 - sz * Math.cos(ang + Math.PI / 7)},${y2 - sz * Math.sin(ang + Math.PI / 7)}`;
  return `${x2},${y2} ${l} ${r}`;
};

const normalizeArrow = (a: PhotoAnnotation): PhotoAnnotation => {
  const x = clamp(a.x); const y = clamp(a.y);
  const width = clampSz(a.width ?? DEFAULT_W);
  const rotation = a.rotation ?? 35;
  const ep = arrowEndpoint({ x, y, width, rotation });
  return { ...a, x, y, type: "arrow", width, height: Math.max(MIN_SZ, a.height ?? DEFAULT_H), endX: ep.x, endY: ep.y, rotation };
};

const normalizeAnnotation = (a: PhotoAnnotation): PhotoAnnotation => {
  const type = a.type ?? "pin";
  const base: PhotoAnnotation = {
    id: a.id, x: clamp(a.x ?? 0.5), y: clamp(a.y ?? 0.5),
    note: a.note ?? "", type,
    width: clampSz(a.width ?? (type === "pin" ? PIN_SZ : DEFAULT_W)),
    height: clampSz(a.height ?? (type === "pin" ? PIN_SZ : DEFAULT_H)),
    endX: clamp(a.endX ?? (a.x ?? 0.5) + 0.15),
    endY: clamp(a.endY ?? (a.y ?? 0.5) + 0.1),
    rotation: a.rotation ?? 0,
    color: a.color ?? DEFAULT_COLOR,
    strokeWidth: a.strokeWidth ?? 1.8,
    points: a.points, text: a.text ?? ""
  };
  return type === "arrow" ? normalizeArrow(base) : base;
};

const syncArrowEnd = (a: PhotoAnnotation, ex: number, ey: number): PhotoAnnotation => {
  const dx = ex - a.x; const dy = ey - a.y;
  return normalizeArrow({ ...a, width: clampSz(Math.sqrt(dx * dx + dy * dy)), rotation: (Math.atan2(dy, dx) * 180) / Math.PI, endX: ex, endY: ey });
};

const keepInside = (a: PhotoAnnotation): PhotoAnnotation => {
  if (a.type === "arrow") return normalizeArrow(a);
  const hw = (a.width ?? DEFAULT_W) / 2; const hh = (a.height ?? DEFAULT_H) / 2;
  return normalizeAnnotation({ ...a, x: clamp(a.x, PAD + hw, 1 - PAD - hw), y: clamp(a.y, PAD + hh, 1 - PAD - hh) });
};

const svgPoint = (e: { clientX: number; clientY: number }, svg: SVGSVGElement | null) => {
  if (!svg) return { x: 0.5, y: 0.5 };
  const b = svg.getBoundingClientRect();
  return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) };
};

const smoothPath = (pts: Array<{ x: number; y: number }>) => {
  if (pts.length < 2) return "";
  const s = pts.map(p => [p.x * 100, p.y * 100]);
  if (pts.length === 2) return `M ${s[0][0]} ${s[0][1]} L ${s[1][0]} ${s[1][1]}`;
  let d = `M ${s[0][0]} ${s[0][1]}`;
  for (let i = 1; i < s.length - 1; i++) {
    const mx = (s[i][0] + s[i + 1][0]) / 2;
    const my = (s[i][1] + s[i + 1][1]) / 2;
    d += ` Q ${s[i][0]} ${s[i][1]} ${mx} ${my}`;
  }
  d += ` L ${s[s.length - 1][0]} ${s[s.length - 1][1]}`;
  return d;
};

const rotHandle = (cx: number, cy: number, w: number, h: number, rot: number) => {
  const r = (rot * Math.PI) / 180;
  return { x: cx + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r), y: cy + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r) };
};

// ── Component ──────────────────────────────────────────────────────────────────
export const PhotoAnnotatorLite = ({ imageUrl, annotations, language, disabled = false, onChange }: PhotoAnnotatorLiteProps) => {
  const t = (es: string, de: string) => translate(language, de, es);

  // ── Tool state ──
  const [tool, setTool] = useState<ActiveTool>("arrow");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState<"sm" | "md" | "lg">("md");

  // ── Annotation + history state ──
  const [localAnn, setLocalAnn] = useState<PhotoAnnotation[]>(() => annotations.map(normalizeAnnotation));
  const [history, setHistory] = useState<PhotoAnnotation[][]>(() => [annotations.map(normalizeAnnotation)]);
  const [histIdx, setHistIdx] = useState(0);
  const isInternalRef = useRef(false);
  const histIdxRef = useRef(0);
  useEffect(() => { histIdxRef.current = histIdx; }, [histIdx]);

  // ── Selection ──
  const [selectedId, setSelectedId] = useState("");

  // ── Refs ──
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const localAnnRef = useRef(localAnn);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { localAnnRef.current = localAnn; }, [localAnn]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── Pen / text ──
  const [penPath, setPenPath] = useState<Array<{ x: number; y: number }> | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; text: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // ── Zoom / pan ──
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const isSpaceDownRef = useRef(false);
  const isPanRef = useRef(false);
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const isPanning = isPanRef.current;

  // ── Sync external changes ──
  useEffect(() => {
    if (isInternalRef.current) { isInternalRef.current = false; return; }
    const n = annotations.map(normalizeAnnotation);
    setLocalAnn(n);
    setHistory([n]);
    setHistIdx(0);
    histIdxRef.current = 0;
    setSelectedId("");
  }, [annotations]);

  // ── History helpers ──
  const strokeWidth = useMemo(() => strokeSize === "sm" ? 1 : strokeSize === "lg" ? 3 : 1.8, [strokeSize]);

  const pushToOnChange = useCallback((n: PhotoAnnotation[]) => {
    isInternalRef.current = true;
    onChange(n);
  }, [onChange]);

  const liveUpdate = useCallback((next: PhotoAnnotation[]) => {
    const n = next.map(normalizeAnnotation);
    setLocalAnn(n);
    pushToOnChange(n);
  }, [pushToOnChange]);

  const commitUpdate = useCallback((next: PhotoAnnotation[]) => {
    const n = next.map(normalizeAnnotation);
    setLocalAnn(n);
    setHistory(prev => [...prev.slice(0, histIdxRef.current + 1), n]);
    setHistIdx(prev => { histIdxRef.current = prev + 1; return prev + 1; });
    pushToOnChange(n);
  }, [pushToOnChange]);

  const undo = useCallback(() => {
    if (histIdxRef.current === 0) return;
    setHistory(prev => {
      const ni = histIdxRef.current - 1;
      const p = prev[ni];
      setHistIdx(ni);
      histIdxRef.current = ni;
      setLocalAnn(p);
      setSelectedId("");
      pushToOnChange(p);
      return prev;
    });
  }, [pushToOnChange]);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (histIdxRef.current >= prev.length - 1) return prev;
      const ni = histIdxRef.current + 1;
      const n = prev[ni];
      setHistIdx(ni);
      histIdxRef.current = ni;
      setLocalAnn(n);
      pushToOnChange(n);
      return prev;
    });
  }, [pushToOnChange]);

  // ── Keyboard ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inInput = tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA";
      if (e.code === "Space" && !inInput) {
        e.preventDefault();
        isSpaceDownRef.current = true;
        setIsSpaceDown(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !inInput && !disabled) {
        const sid = selectedIdRef.current;
        if (!sid) return;
        e.preventDefault();
        const next = localAnnRef.current.filter(a => a.id !== sid);
        commitUpdate(next);
        setSelectedId("");
      }
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey) && !inInput) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { isSpaceDownRef.current = false; setIsSpaceDown(false); }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [disabled, commitUpdate, undo, redo]);

  // ── Pan handlers (outer div) ──
  const onWrapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSpaceDownRef.current) return;
    isPanRef.current = true;
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: panX, py: panY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onWrapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanRef.current || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.mx;
    const dy = e.clientY - panStartRef.current.my;
    const wrap = canvasWrapRef.current;
    if (wrap) {
      const mx = ((zoom - 1) / 2) * wrap.offsetWidth;
      const my = ((zoom - 1) / 2) * wrap.offsetHeight;
      setPanX(Math.min(mx, Math.max(-mx, panStartRef.current.px + dx / zoom)));
      setPanY(Math.min(my, Math.max(-my, panStartRef.current.py + dy / zoom)));
    }
  };
  const onWrapPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanRef.current) {
      isPanRef.current = false;
      panStartRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(z => { const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * f)); if (nz === 1) { setPanX(0); setPanY(0); } return nz; });
  };

  // ── SVG interaction helpers ──
  const startInteraction = (e: React.PointerEvent<SVGElement>, a: PhotoAnnotation, mode: InteractionMode) => {
    if (disabled || isSpaceDownRef.current) return;
    e.preventDefault(); e.stopPropagation();
    setSelectedId(a.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = { pointerId: e.pointerId, annotationId: a.id, mode, startAnnotation: a, startPoint: svgPoint(e, overlayRef.current) };
  };

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || isSpaceDownRef.current) return;
    if (tool === "pen") {
      e.preventDefault();
      overlayRef.current?.setPointerCapture(e.pointerId);
      setPenPath([svgPoint(e, overlayRef.current)]);
      return;
    }
    if (tool === "text") {
      const pt = svgPoint(e, overlayRef.current);
      setPendingText({ x: pt.x, y: pt.y, text: "" });
      setTimeout(() => textInputRef.current?.focus(), 30);
    }
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    if (tool === "pen" && penPath) {
      e.preventDefault();
      setPenPath(prev => prev ? [...prev, svgPoint(e, overlayRef.current)] : null);
      return;
    }
    const ix = interactionRef.current;
    if (!ix || ix.pointerId !== e.pointerId) return;
    e.preventDefault();
    const pt = svgPoint(e, overlayRef.current);
    const dx = pt.x - ix.startPoint.x;
    const dy = pt.y - ix.startPoint.y;
    const b = ix.startAnnotation;

    if (ix.mode === "move") {
      const moved = b.type === "arrow" ? normalizeArrow({ ...b, x: b.x + dx, y: b.y + dy }) : keepInside({ ...b, x: b.x + dx, y: b.y + dy });
      liveUpdate(localAnnRef.current.map(a => a.id === b.id ? moved : a));
      return;
    }
    if (ix.mode === "arrow-end") {
      liveUpdate(localAnnRef.current.map(a => a.id === b.id ? syncArrowEnd(b, pt.x, pt.y) : a));
      return;
    }
    if (ix.mode === "resize") {
      let next: PhotoAnnotation;
      if (b.type === "circle") {
        const r = clampSz(Math.max(Math.abs(pt.x - b.x), Math.abs(pt.y - b.y)) * 2);
        next = keepInside({ ...b, width: r, height: r });
      } else if (b.type === "pin") {
        const s = clampSz(Math.max(Math.abs(pt.x - b.x), Math.abs(pt.y - b.y)) * 2, PIN_SZ, 0.2);
        next = keepInside({ ...b, width: s, height: s });
      } else {
        next = keepInside({ ...b, width: clampSz(Math.abs(pt.x - b.x) * 2), height: clampSz(Math.abs(pt.y - b.y) * 2) });
      }
      liveUpdate(localAnnRef.current.map(a => a.id === b.id ? next : a));
    }
  };

  const onSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // Finalize pen
    if (tool === "pen" && penPath) {
      if (penPath.length >= 3) {
        const ann: PhotoAnnotation = {
          id: crypto.randomUUID(), x: penPath[0].x, y: penPath[0].y,
          type: "pen", points: penPath, color, strokeWidth, width: 0, height: 0
        };
        commitUpdate([...localAnnRef.current, ann]);
        setSelectedId(ann.id);
      }
      setPenPath(null);
      overlayRef.current?.releasePointerCapture?.(e.pointerId);
      return;
    }
    // Finalize drag
    const ix = interactionRef.current;
    if (ix && ix.pointerId === e.pointerId) {
      commitUpdate([...localAnnRef.current]);
      interactionRef.current = null;
      overlayRef.current?.releasePointerCapture?.(e.pointerId);
    }
  };

  const onHitAreaClick = (e: React.MouseEvent<SVGRectElement>) => {
    if (disabled || tool === "pen" || tool === "text" || isSpaceDownRef.current) return;
    if (tool === "select") { setSelectedId(""); return; }
    const pt = svgPoint(e, overlayRef.current);
    const shapeType = tool as PhotoAnnotationShape;
    const base: PhotoAnnotation = {
      id: crypto.randomUUID(), x: pt.x, y: pt.y, type: shapeType,
      width: shapeType === "pin" ? PIN_SZ : DEFAULT_W,
      height: shapeType === "pin" ? PIN_SZ : DEFAULT_H,
      rotation: shapeType === "arrow" ? 25 : 0,
      color, strokeWidth
    };
    const next = shapeType === "arrow" ? normalizeArrow(base) : keepInside(base);
    commitUpdate([...localAnnRef.current, next]);
    setSelectedId(next.id);
  };

  const confirmText = () => {
    if (!pendingText?.text.trim()) { setPendingText(null); return; }
    const fontSize = strokeSize === "sm" ? 3.5 : strokeSize === "lg" ? 7 : 5;
    const ann: PhotoAnnotation = {
      id: crypto.randomUUID(), x: pendingText.x, y: pendingText.y,
      type: "text", text: pendingText.text, color, strokeWidth: fontSize, width: 0, height: 0
    };
    commitUpdate([...localAnnRef.current, ann]);
    setSelectedId(ann.id);
    setPendingText(null);
  };

  // ── Shape renderer ─────────────────────────────────────────────────────────
  const renderShape = (a: PhotoAnnotation) => {
    const active = a.id === selectedId;
    const c = a.color ?? DEFAULT_COLOR;
    const sw = a.strokeWidth ?? 2.5;
    const asw = active ? sw + 0.6 : sw;
    const fill = `${c}28`;
    const fillA = `${c}4a`;
    const cx = a.x * 100; const cy = a.y * 100;
    const w = (a.width ?? DEFAULT_W) * 100;
    const h = (a.height ?? DEFAULT_H) * 100;
    const rot = a.rotation ?? 0;
    const mv = { onPointerDown: (ev: React.PointerEvent<SVGElement>) => startInteraction(ev, a, "move"), style: { cursor: "move" } as React.CSSProperties };

    if (a.type === "pen" && a.points) {
      const d = smoothPath(a.points);
      return (
        <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
          {active && <path d={d} fill="none" stroke="transparent" strokeWidth={sw + 8} style={{ cursor: "move" }} onPointerDown={(ev) => startInteraction(ev, a, "move")} />}
          <path d={d} fill="none" stroke={c} strokeWidth={asw} strokeLinecap="round" strokeLinejoin="round" {...mv} />
        </g>
      );
    }

    if (a.type === "text") {
      const fs = sw;
      return (
        <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
          <text x={cx} y={cy} fill={c} fontSize={fs} fontWeight="800" fontFamily="Manrope, system-ui, sans-serif"
            paintOrder="stroke" stroke="rgba(0,0,0,0.5)" strokeWidth={0.6}
            style={{ cursor: "move", userSelect: "none" } as React.CSSProperties}
            onPointerDown={(ev) => startInteraction(ev, a, "move")}>
            {a.text}
          </text>
          {active && (
            <rect x={cx - 0.5} y={cy - fs - 0.5} width={((a.text?.length ?? 0) * fs * 0.6) + 1} height={fs + 1.5}
              fill="transparent" stroke={c} strokeWidth={0.5} strokeDasharray="1.2,0.8" rx={0.4}
              style={{ pointerEvents: "none" }} />
          )}
        </g>
      );
    }

    const ep = arrowEndpoint(a);
    const ex = ep.x * 100; const ey = ep.y * 100;
    const rh = rotHandle(cx, cy, w, h, rot);

    if (a.type === "arrow") {
      return (
        <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
          <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="transparent" strokeWidth={asw + 8} style={{ cursor: "move" }} onPointerDown={(ev) => startInteraction(ev, a, "move")} />
          <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={c} strokeWidth={asw} strokeLinecap="round" style={{ cursor: "move" }} onPointerDown={(ev) => startInteraction(ev, a, "move")} />
          <polygon points={arrowHead(cx, cy, ex, ey)} fill={c} />
          {active && <circle cx={cx} cy={cy} r={HNDL} fill={c} stroke="rgba(255,255,255,0.7)" strokeWidth={0.5} style={{ cursor: "grab" }} onPointerDown={(ev) => startInteraction(ev, a, "move")} />}
          {active && <circle cx={ex} cy={ey} r={HNDL} fill="#fff" stroke={c} strokeWidth={0.6} style={{ cursor: "nwse-resize" }} onPointerDown={(ev) => startInteraction(ev, a, "arrow-end")} />}
        </g>
      );
    }
    if (a.type === "circle") {
      return (
        <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
          <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={active ? fillA : fill} stroke={c} strokeWidth={asw} transform={`rotate(${rot} ${cx} ${cy})`} {...mv} />
          {active && <circle cx={rh.x} cy={rh.y} r={HNDL} fill="#fff" stroke={c} strokeWidth={0.8} style={{ cursor: "nwse-resize" }} onPointerDown={(ev) => startInteraction(ev, a, "resize")} />}
        </g>
      );
    }
    if (a.type === "rect") {
      return (
        <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={1.8} fill={active ? fillA : fill} stroke={c} strokeWidth={asw} transform={`rotate(${rot} ${cx} ${cy})`} {...mv} />
          {active && <circle cx={rh.x} cy={rh.y} r={HNDL} fill="#fff" stroke={c} strokeWidth={0.8} style={{ cursor: "nwse-resize" }} onPointerDown={(ev) => startInteraction(ev, a, "resize")} />}
        </g>
      );
    }
    // Pin (default)
    const pr = Math.max(2.5, w * 24);
    return (
      <g key={a.id} className={active ? "ann-sh ann-sh--active" : "ann-sh"}>
        <circle cx={cx} cy={cy} r={pr} fill={active ? fillA : fill} stroke={c} strokeWidth={asw} {...mv} />
        <line x1={cx - pr * 0.55} y1={cy} x2={cx + pr * 0.55} y2={cy} stroke={c} strokeWidth={0.7} style={{ pointerEvents: "none" }} />
        <line x1={cx} y1={cy - pr * 0.55} x2={cx} y2={cy + pr * 0.55} stroke={c} strokeWidth={0.7} style={{ pointerEvents: "none" }} />
        {active && <circle cx={cx + pr * 1.15} cy={cy + pr * 1.15} r={HNDL} fill="#fff" stroke={c} strokeWidth={0.8} style={{ cursor: "nwse-resize" }} onPointerDown={(ev) => startInteraction(ev, a, "resize")} />}
      </g>
    );
  };

  const canUndo = histIdx > 0;
  const canRedo = histIdx < history.length - 1;
  const selected = localAnn.find(a => a.id === selectedId);

  const getCursor = () => {
    if (isSpaceDown) return isPanning ? "grabbing" : "grab";
    if (tool === "pen") return "crosshair";
    if (tool === "text") return "text";
    if (tool === "select") return "default";
    return "crosshair";
  };

  const TOOLS: Array<{ id: ActiveTool; icon: React.ReactNode; tip: string }> = [
    { id: "arrow",  icon: Ic.arrow,  tip: t("Flecha",      "Pfeil") },
    { id: "rect",   icon: Ic.rect,   tip: t("Rectángulo",  "Rechteck") },
    { id: "circle", icon: Ic.circle, tip: t("Círculo",     "Kreis") },
    { id: "pin",    icon: Ic.pin,    tip: t("Punto",       "Punkt") },
    { id: "pen",    icon: Ic.pen,    tip: t("Lápiz",       "Stift") },
    { id: "text",   icon: Ic.text,   tip: t("Texto",       "Text") },
  ];

  return (
    <div className="ann">
      {/* ── Floating toolbar ───────────────────────────────────────────── */}
      {!disabled && (
        <div className="ann__toolbar" role="toolbar">
          {/* Tools */}
          <div className="ann__tgroup">
            {TOOLS.map(({ id, icon, tip }) => (
              <button key={id} type="button" className={`ann__tbtn ${tool === id ? "active" : ""}`}
                onClick={() => setTool(id)} title={tip} aria-label={tip} aria-pressed={tool === id}>
                {icon}
              </button>
            ))}
          </div>

          <span className="ann__tsep" />

          {/* Color swatches */}
          <div className="ann__tgroup">
            {PRESET_COLORS.map(pc => (
              <button key={pc} type="button"
                className={`ann__color ${color === pc ? "active" : ""}`}
                style={{ background: pc, ...(pc === "#ffffff" ? { border: "1.5px solid rgba(0,0,0,0.18)" } : {}) }}
                onClick={() => setColor(pc)} title={pc} />
            ))}
            <label className="ann__color-custom" title={t("Color personalizado", "Benutzerdefinierte Farbe")}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} />
              <span className="ann__color-custom-ring" />
            </label>
          </div>

          <span className="ann__tsep" />

          {/* Stroke size */}
          <div className="ann__tgroup">
            {(["sm", "md", "lg"] as const).map((s, i) => (
              <button key={s} type="button"
                className={`ann__tbtn ann__szbn ${strokeSize === s ? "active" : ""}`}
                onClick={() => setStrokeSize(s)}
                title={s === "sm" ? t("Fino", "Dünn") : s === "lg" ? t("Grueso", "Dick") : t("Medio", "Mittel")}>
                <span className="ann__szdot" style={{ width: 6 + i * 4, height: 6 + i * 4 }} />
              </button>
            ))}
          </div>

          <span className="ann__tsep" />

          {/* Undo / Redo */}
          <div className="ann__tgroup">
            <button type="button" className="ann__tbtn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">{Ic.undo}</button>
            <button type="button" className="ann__tbtn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">{Ic.redo}</button>
          </div>

          <span className="ann__tsep" />

          {/* Delete */}
          <div className="ann__tgroup">
            <button type="button" className="ann__tbtn ann__tbtn--danger" onClick={() => { if (selected) { commitUpdate(localAnn.filter(a => a.id !== selectedId)); setSelectedId(""); } }} disabled={!selected} title={t("Borrar seleccionada", "Auswahl löschen") + " (Del)"}>{Ic.trash}</button>
            <button type="button" className="ann__tbtn ann__tbtn--danger" onClick={() => { commitUpdate([]); setSelectedId(""); }} disabled={localAnn.length === 0} title={t("Borrar todo", "Alles löschen")}>{Ic.clear}</button>
          </div>
        </div>
      )}

      {/* ── Canvas ─────────────────────────────────────────────────────── */}
      <div ref={canvasWrapRef}
        className={`ann__wrap ${disabled ? "ann__wrap--off" : ""}`}
        style={{ cursor: getCursor() }}
        onPointerDown={onWrapPointerDown}
        onPointerMove={onWrapPointerMove}
        onPointerUp={onWrapPointerUp}
        onWheel={onWheel}>

        <div className="ann__inner"
          style={{ transform: zoom !== 1 ? `scale(${zoom}) translate(${panX}px, ${panY}px)` : undefined, transformOrigin: "center center" }}>

          <img src={imageUrl} alt="" draggable={false} className="ann__img" />

          {/* Pending text input */}
          {pendingText && (
            <div style={{ position: "absolute", left: `${pendingText.x * 100}%`, top: `${pendingText.y * 100}%`, transform: "translate(-50%, -50%)", zIndex: 20 }}>
              <input ref={textInputRef} className="ann__textfield"
                type="text" value={pendingText.text}
                placeholder={t("Escribe y pulsa Enter", "Text eingeben + Enter")}
                onChange={e => setPendingText(p => p ? { ...p, text: e.target.value } : null)}
                onKeyDown={e => { if (e.key === "Enter") confirmText(); if (e.key === "Escape") setPendingText(null); }}
                onBlur={confirmText}
                style={{ color, fontSize: strokeSize === "sm" ? "11px" : strokeSize === "lg" ? "20px" : "15px", fontWeight: 800 }}
              />
            </div>
          )}

          {/* SVG overlay */}
          <svg ref={overlayRef} className="ann__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
            onPointerDown={onSvgPointerDown} onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp} onPointerCancel={onSvgPointerUp}>
            <rect x="0" y="0" width="100" height="100" fill="transparent"
              style={{ cursor: tool === "select" ? "default" : tool === "pen" || tool === "text" ? "crosshair" : "crosshair" }}
              onClick={onHitAreaClick} />
            {localAnn.map(renderShape)}
            {penPath && penPath.length >= 2 && (
              <path d={smoothPath(penPath)} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
            )}
          </svg>
        </div>

        {/* Zoom badge */}
        {zoom > 1.05 && <div className="ann__zoom-badge">{Math.round(zoom * 100)}%</div>}

        {/* Zoom controls */}
        <div className="ann__zoom-ctrl">
          <button type="button" className="ann__zoom-btn" title={t("Acercar", "Vergrößern")}
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.25))}>{Ic.zoomIn}</button>
          <button type="button" className="ann__zoom-btn" title={t("Alejar", "Verkleinern")}
            onClick={() => setZoom(z => { const nz = Math.max(MIN_ZOOM, z * 0.8); if (nz <= 1.05) { setPanX(0); setPanY(0); return 1; } return nz; })}>{Ic.zoomOut}</button>
          {zoom > 1.05 && (
            <button type="button" className="ann__zoom-btn ann__zoom-btn--reset" title={t("Restablecer zoom", "Zoom zurücksetzen")}
              onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}>1:1</button>
          )}
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      {!disabled && (
        <div className="ann__status">
          {isSpaceDown
            ? <span>🤚 {t("Modo paneo · arrastra para mover", "Pan-Modus · ziehen zum Verschieben")}</span>
            : tool === "pen"
            ? <span>✏️ {t("Dibuja libremente · suelta para confirmar", "Freihand zeichnen · loslassen zum Bestätigen")}</span>
            : tool === "text"
            ? <span>T {t("Haz clic para añadir texto", "Klicken um Text hinzuzufügen")}</span>
            : selected
            ? <span>↕ {t("Arrastra para mover · asa para redimensionar · Supr para borrar", "Ziehen zum Verschieben · Griff zum Skalieren · Entf zum Löschen")}</span>
            : <span>+ {t("Clic para añadir · Scroll para zoom · Espacio+arrastra para paneo", "Klick zum Hinzufügen · Scroll Zoom · Leertaste+Ziehen Pan")} {localAnn.length > 0 && `· ${localAnn.length} ${t("marca(s)", "Markierung(en)")}`}</span>
          }
        </div>
      )}
    </div>
  );
};

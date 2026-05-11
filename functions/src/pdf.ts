import type { Bucket } from "@google-cloud/storage";
import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFFont,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb
} from "pdf-lib";
import {
  CompanyId,
  ReportData,
  TemplateConfig,
  TemplateFieldRect,
  TemplateFieldSchema,
  TemplateFieldSource,
  TemplateFieldType,
  TemplateVersion
} from "./types";
import { COMPANIES, LECKORTUNG_HINWEIS_TEXT } from "./templates";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type RenderOptions = {
  flatten?: boolean;
};

// Coordenadas de imagen para cada slot de foto (espacio a la DERECHA de los campos de texto)
// Los campos de texto están en x:76-218; las imágenes van de x:228 a x:570
interface PhotoSlotGeometry {
  pageIndex: number; // índice de página 0-based
  x: number;
  y: number;
  width: number;
  height: number;
}

type PhotoAnnotationShape = "pin" | "circle" | "rect" | "arrow" | "pen" | "text";

interface PhotoAnnotation {
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

// Coordenadas extraídas directamente de los campos AcroForm de template-prok15.pdf / template-all15.pdf.
// Cada bloque: imagen a la DERECHA (x:228, ancho:342); campos de texto a la izquierda (x≈76).
// y = doc_bottom (esquina inferior de la foto), height = ort_top − doc_bottom.
const PHOTO_SLOT_GEOMETRY: Record<number, PhotoSlotGeometry> = {
  // Página 1 (índice 1) — bild1, bild2
  1:  { pageIndex: 1, x: 228, y: 416, width: 342, height: 167 },
  2:  { pageIndex: 1, x: 228, y: 184, width: 342, height: 168 },
  // Página 2 (índice 2) — bild3, bild4, bild5
  3:  { pageIndex: 2, x: 228, y: 570, width: 342, height: 167 },
  4:  { pageIndex: 2, x: 228, y: 339, width: 342, height: 169 },
  5:  { pageIndex: 2, x: 228, y: 108, width: 342, height: 167 },
  // Página 3 (índice 3) — bild6, bild7, bild8
  6:  { pageIndex: 3, x: 228, y: 581, width: 342, height: 157 },
  7:  { pageIndex: 3, x: 228, y: 339, width: 342, height: 167 },
  8:  { pageIndex: 3, x: 228, y: 107, width: 342, height: 168 },
  // Página 4 (índice 4) — bild9, bild10, bild11
  9:  { pageIndex: 4, x: 228, y: 570, width: 342, height: 168 },
  10: { pageIndex: 4, x: 228, y: 342, width: 342, height: 167 },
  11: { pageIndex: 4, x: 228, y: 112, width: 342, height: 167 },
  // Página 5 (índice 5) — bild12, bild13, bild14
  12: { pageIndex: 5, x: 228, y: 570, width: 342, height: 168 },
  13: { pageIndex: 5, x: 228, y: 342, width: 342, height: 166 },
  14: { pageIndex: 5, x: 228, y: 114, width: 342, height: 165 },
};

// Posición del logo en la esquina superior derecha de cada página (A4: 595 × 842 pt)
const LOGO_RECT = { x: 415, y: 770, width: 150, height: 58 };

// Coordenadas del campo de firma del cliente en template-LECKORTUNG.pdf
// Campo signature_10ubdv: x=71 y=206 w=227 h=98 (página única, índice 0)
const LECKORTUNG_CUSTOMER_SIGNATURE_RECT = { pageIndex: 0, x: 71, y: 206, width: 227, height: 98 };

// ---------------------------------------------------------------------------
// Utilidades de valor
// ---------------------------------------------------------------------------
const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number")  return value !== 0;
  if (typeof value === "string") {
    const n = value.trim().toLowerCase();
    return n === "1" || n === "true" || n === "yes" || n === "ja";
  }
  return false;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => toText(v)).filter(Boolean).join(", ");
  return "";
};

const getValueByPath = (source: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((cur, seg) => {
    if (!cur || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[seg];
  }, source);

// Rutas de campos que contienen fechas ISO y deben formatearse como DD.MM.YYYY en el PDF
const DATE_PATHS = new Set([
  "projectInfo.appointmentDate",
  "billing.workDate",
]);

// Rutas que provienen de `datetime-local` y deben conservar también HH:MM
const DATE_TIME_PATHS = new Set([
  "projectInfo.appointmentDate",
]);

/**
 * Convierte un valor de fecha ISO (`2026-05-11` o `2026-05-11T12:28[:00]`) al
 * formato alemán que espera el AcroForm.
 *  - Si `includeTime` y el valor trae componente horaria → `DD.MM.YYYY HH:MM`.
 *  - En otro caso → `DD.MM.YYYY`.
 */
const formatDateForPdf = (raw: unknown, includeTime = false): string => {
  if (!raw || typeof raw !== "string") return "";
  const [datePart, timePartRaw] = raw.includes("T") ? raw.split("T") : [raw, ""];
  const parts = datePart.split("-");
  if (parts.length !== 3) return raw;
  const [year, month, day] = parts;
  const formattedDate = `${day}.${month}.${year}`;
  if (!includeTime || !timePartRaw) return formattedDate;
  // timePartRaw puede ser `HH:MM` o `HH:MM:SS`; nos quedamos con HH:MM
  const hhmm = timePartRaw.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? `${formattedDate} ${hhmm}` : formattedDate;
};

const clamp = (value: number, min = 0.02, max = 0.98) => Math.min(max, Math.max(min, value));

const normalizeAnnotation = (annotation: PhotoAnnotation): PhotoAnnotation => ({
  id: annotation.id,
  x: clamp(Number(annotation.x ?? 0.5)),
  y: clamp(Number(annotation.y ?? 0.5)),
  note: typeof annotation.note === "string" ? annotation.note : "",
  type: annotation.type ?? "pin",
  width: Math.max(0.03, Number(annotation.width ?? 0.16)),
  height: Math.max(0.03, Number(annotation.height ?? 0.1)),
  endX: clamp(Number(annotation.endX ?? Number(annotation.x ?? 0.5) + 0.15)),
  endY: clamp(Number(annotation.endY ?? Number(annotation.y ?? 0.5) + 0.1)),
  rotation: Number(annotation.rotation ?? 0),
  color: typeof annotation.color === "string" ? annotation.color : undefined,
  strokeWidth: typeof annotation.strokeWidth === "number" ? annotation.strokeWidth : undefined,
  points: Array.isArray(annotation.points) ? annotation.points : undefined,
  text: typeof annotation.text === "string" ? annotation.text : undefined,
});

// Convert a #rrggbb hex color to a pdf-lib RGB color (with fallback).
const hexToRgbColor = (hex: string | undefined, fallback = rgb(0.93, 0.27, 0.27)) => {
  if (!hex) return fallback;
  const h = hex.replace("#", "");
  if (h.length !== 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
  return rgb(r / 255, g / 255, b / 255);
};

// Build a quadratic-bezier smooth SVG path from normalized points,
// scaled to the PDF area dimensions (origin top-left, y-down for drawSvgPath).
const smoothPathForPdf = (
  pts: Array<{ x: number; y: number }>,
  w: number,
  h: number
): string => {
  if (pts.length < 2) return "";
  const s = pts.map((p) => [p.x * w, p.y * h] as [number, number]);
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

const readPhotoAnnotations = (report: ReportData, slot: number): PhotoAnnotation[] => {
  const raw = report.templateFields?.[`photoAnnotation:${slot}`];
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PhotoAnnotation[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item.id === "string")
      .map(normalizeAnnotation);
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
const loadBytesFromBucket = async (bucket: Bucket, path: string): Promise<Uint8Array | null> => {
  if (!path) return null;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [bytes] = await file.download();
  return bytes;
};

const sanitizeSchemaFieldId = (value: string, index: number, seen: Set<string>): string => {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `field_${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
};

const inferFieldLabel = (fieldName: string): string =>
  fieldName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fieldName;

const signatureNamePattern = /(signature|sign|firma|unterschrift)/i;
const imageNamePattern = /(image|img|photo|foto|bild)/i;

const inferTemplateFieldType = (field: PDFField): TemplateFieldType => {
  const fieldName = field.getName();

  if (field instanceof PDFCheckBox) {
    return "checkbox";
  }

  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    return "dropdown";
  }

  if (field instanceof PDFTextField) {
    return field.isMultiline() ? "textarea" : "text";
  }

  if (field instanceof PDFButton) {
    if (signatureNamePattern.test(fieldName)) {
      return "signature";
    }
    if (imageNamePattern.test(fieldName)) {
      return "image";
    }
  }

  if (signatureNamePattern.test(fieldName)) {
    return "signature";
  }

  if (imageNamePattern.test(fieldName)) {
    return "image";
  }

  return "text";
};

const inferTemplateFieldSource = (type: TemplateFieldType): TemplateFieldSource => {
  if (type === "signature") {
    return "signature";
  }

  if (type === "image") {
    return "image";
  }

  return "acroform";
};

const getFieldOptions = (field: PDFField): string[] => {
  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    return field.getOptions();
  }

  return [];
};

const getDefaultFieldValue = (field: PDFField): string => {
  if (field instanceof PDFTextField) {
    return field.getText() ?? "";
  }

  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    try {
      const selected = (field as unknown as { getSelected?: () => string[] }).getSelected?.() ?? [];
      return selected.join(", ");
    } catch {
      return "";
    }
  }

  return "";
};

const getFieldRectAndPage = (field: PDFField, pdf: PDFDocument): { page: number; rect: TemplateFieldRect } => {
  const widgets = ((field as unknown as {
    acroField?: { getWidgets?: () => Array<{ getRectangle?: () => TemplateFieldRect; dict?: { get?: (name: unknown) => unknown } }> };
  }).acroField?.getWidgets?.() ?? []);
  const firstWidget = widgets[0];
  const rect = firstWidget?.getRectangle?.() ?? { x: 0, y: 0, width: 0, height: 0 };
  const pageRef = firstWidget?.dict?.get?.(PDFName.of("P"));
  const pageIndex = pdf.getPages().findIndex((page) => {
    const candidate = page as unknown as { ref?: unknown };
    return candidate.ref === pageRef;
  });

  return {
    page: pageIndex >= 0 ? pageIndex + 1 : 1,
    rect
  };
};

export const extractTemplateFieldSchema = async (templatePdf: Uint8Array): Promise<TemplateFieldSchema[]> => {
  const pdf = await PDFDocument.load(templatePdf, { ignoreEncryption: true });
  const fields = pdf.getForm().getFields();
  const seenIds = new Set<string>();

  return fields
    .map((field, index) => {
      const type = inferTemplateFieldType(field);
      const includeInForm = type !== "image";
      const { page, rect } = getFieldRectAndPage(field, pdf);

      return {
        id: sanitizeSchemaFieldId(field.getName(), index, seenIds),
        type,
        source: inferTemplateFieldSource(type),
        label: inferFieldLabel(field.getName()),
        page,
        rect,
        required: false,
        includeInForm,
        options: getFieldOptions(field),
        defaultValue: getDefaultFieldValue(field),
        helpText: "",
        pdfFieldName: field.getName(),
        pdfFieldType: field.constructor.name,
        sortOrder: index
      } satisfies TemplateFieldSchema;
    })
    .filter((field) => field.type !== "image" || field.includeInForm === false);
};

// ---------------------------------------------------------------------------
// Relleno de campos AcroForm
// ---------------------------------------------------------------------------


const getOptionalField = (form: ReturnType<PDFDocument["getForm"]>, fieldName: string): PDFField | null => {
  try {
    return form.getField(fieldName);
  } catch {
    return null;
  }
};

/**
 * Marca o desmarca un checkbox AcroForm de forma robusta:
 *  - Intenta primero el API estándar de pdf-lib (`check()` / `uncheck()`).
 *  - Si falla, recurre al low-level: lee el valor "On" real de la appearance
 *    dictionary del widget (puede ser /Yes, /On, /Ja, /1, etc.) y lo asigna
 *    directamente al `/V` del campo.
 */
const setCheckboxValue = (field: PDFCheckBox, on: boolean) => {
  try {
    if (on) field.check();
    else field.uncheck();
    return;
  } catch { /* fallback */ }

  try {
    const acro = (field as unknown as { acroField?: { setValue?: (v: unknown) => void; getWidgets?: () => Array<unknown> } }).acroField;
    if (!acro) return;

    if (!on) {
      acro.setValue?.(PDFName.of("Off"));
      return;
    }

    // Buscar el primer valor "On" disponible en los appearance streams
    const widgets = acro.getWidgets?.() ?? [];
    let onName: string | null = null;
    for (const widget of widgets) {
      const w = widget as { dict?: { get?: (n: unknown) => unknown } };
      const apEntry = w.dict?.get?.(PDFName.of("AP"));
      const apDict = apEntry as { get?: (n: unknown) => unknown } | undefined;
      const nDict = apDict?.get?.(PDFName.of("N")) as { keys?: () => Array<unknown> } | undefined;
      const keys = nDict?.keys?.() ?? [];
      for (const k of keys) {
        const keyName = (k as { decodeText?: () => string }).decodeText?.() ?? String(k);
        if (keyName && keyName !== "Off") {
          onName = keyName;
          break;
        }
      }
      if (onName) break;
    }
    acro.setValue?.(PDFName.of(onName ?? "Yes"));
  } catch { /* ignorar */ }
};

const assignFieldValue = (field: PDFField, value: unknown) => {
  if (field instanceof PDFCheckBox) {
    setCheckboxValue(field, toBoolean(value));
    return;
  }

  if (field instanceof PDFTextField) {
    // Detectar si el widget del campo es "alto" (área de texto/textarea)
    let maxWidgetHeight = 0;
    try {
      const widgets = (field as unknown as {
        acroField?: { getWidgets?: () => Array<{ getRectangle?: () => { height?: number } }> }
      }).acroField?.getWidgets?.() ?? [];
      for (const w of widgets) {
        const rect = w.getRectangle?.();
        if (rect?.height && rect.height > maxWidgetHeight) maxWidgetHeight = rect.height;
      }
    } catch { /* ignorar */ }

    const tall = maxWidgetHeight >= 30; // umbral para considerar el campo como textarea
    const isMultiline = field.isMultiline() || tall;

    if (isMultiline) {
      field.enableMultiline();
      // Texto largo (Einsatzbericht, notas…): font muy pequeño para que quepa con wrapping
      field.setFontSize(7);
    } else {
      field.setFontSize(8);
    }
    field.setText(toText(value));
    return;
  }

  if (field instanceof PDFDropdown) {
    const text = toText(value);
    if (!text) { field.clear(); return; }
    const options = field.getOptions();
    if (!options.includes(text)) field.enableEditing();
    field.select(text);
    return;
  }

  if (field instanceof PDFOptionList) {
    const text = toText(value);
    if (!text) { field.clear(); return; }
    const options = field.getOptions();
    if (!options.includes(text)) throw new Error(`MAPPED_OPTION_NOT_FOUND:${field.getName()}:${text}`);
    field.select(text);
    return;
  }

  if (field instanceof PDFRadioGroup) {
    const text = toText(value);
    if (!text) { field.clear(); return; }
    const options = field.getOptions();
    if (!options.includes(text)) throw new Error(`MAPPED_OPTION_NOT_FOUND:${field.getName()}:${text}`);
    field.select(text);
  }
};

// Rellena todos los campos del fieldMap principal
// Estadísticas de aplicación de campos AcroForm: alimentadas por la pipeline
// `applyAllAcroFormFields` para diagnosticar al final qué campos del FIELD_MAP
// se escribieron y cuáles faltan en el PDF.
interface ApplyStats {
  written: number;
  missing: string[];
}

const applyFieldMap = (
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  template: TemplateConfig,
  options: { optional?: boolean; stats?: ApplyStats } = {}
) => {
  const mapping = options.optional ? template.optionalFieldMap : template.fieldMap;
  if (!mapping) {
    return;
  }

  for (const [logicalPath, target] of Object.entries(mapping)) {
    const rawValue = getValueByPath(report, logicalPath);
    // Formatear fechas ISO; las que vienen de datetime-local conservan hora
    const value = DATE_PATHS.has(logicalPath)
      ? formatDateForPdf(rawValue, DATE_TIME_PATHS.has(logicalPath))
      : rawValue;
    const targets = Array.isArray(target) ? target : [target];
    for (const fieldName of targets) {
      const field = getOptionalField(form, fieldName);
      if (!field) {
        options.stats?.missing.push(fieldName);
        // Campos opcionales: silencio. Campos requeridos: error fast — un
        // mapping roto en el FIELD_MAP es un bug de configuración y debe ser
        // detectado, no enmascarado.
        if (!options.optional) {
          throw new Error(`MAPPED_FIELD_NOT_FOUND:${fieldName}`);
        }
        continue;
      }
      try {
        assignFieldValue(field, value);
        if (options.stats) options.stats.written += 1;
      } catch (assignErr) {
        // Campos opcionales con error de escritura (p. ej. campo creado
        // programáticamente pero sin /DA): solo advertir, no abortar.
        if (options.optional) {
          options.stats?.missing.push(fieldName);
          console.warn(`[PDF] assignFieldValue optional "${fieldName}":`, assignErr instanceof Error ? assignErr.message : assignErr);
        } else {
          throw assignErr;
        }
      }
    }
  }
};

// Técnicas: el array de strings (almacenado en report.techniques) se mapea a
// los checkboxes AcroForm `Eingesetzte_*` del PDF.
// La key es el valor exacto que guarda el formulario web (ver
// `TECHNIQUE_OPTIONS` en app/src/constants.ts); el value es el nombre real del
// campo AcroForm en template-all15.pdf / template-prok15.pdf.
const TECHNIQUE_CHECKBOX_MAP: Record<string, string> = {
  "Sichtprüfung":            "Eingesetzte_Sichtprüfung",
  "Feuchtemessung":          "Eingesetzte_Feuchtemessung",
  "Druckprobe":              "Eingesetzte_Druckprobe",
  "Thermografie":            "Eingesetzte_Thermografie",
  "Elektroakustik":          "Eingesetzte_Elektroakustik",
  "Leitungsortung":          "Eingesetzte_Leitungsortung",
  "Tracergas":               "Eingesetzte_Tracergas",
  "Rohrkamera":              "Eingesetzte_Rohrkamera",
  "Endoskopie":              "Eingesetzte_Endoskopie",
  "Färbemittel":             "Eingesetzte_Farbstoff",
  "Spülung":                 "Eingesetzte_Spülung",
  "Leitfähigkeit":           "Eingesetzte_Leitfähigkeit",
  "Dusch-Simulation":        "Eingesetzte_Dusch-Simulation",
  "Rauchgas":                "Eingesetzte_Rauchgas",
  "Niederschlagssimulation": "Eingesetzte_Niederschlags",
  "IQM-Messtechnik":         "Eingesetzte_IQM-Messtechnik",
  "Datenlogger":             "Eingesetzte_Datenlogger",
  "Positionsortung":         "Eingesetzte_Positionsortung",
  "Pegelmessung":            "Eingesetzte_Pegelmessung",
  "Sonst_Information":       "Eingesetzte_Sonst_Information"
};

const applyTechniques = (
  form: ReturnType<PDFDocument["getForm"]>,
  techniques: string[],
  options: { stats?: ApplyStats } = {}
) => {
  for (const [webValue, fieldName] of Object.entries(TECHNIQUE_CHECKBOX_MAP)) {
    const shouldCheck = techniques.includes(webValue);
    const field = getOptionalField(form, fieldName);
    if (!field) {
      options.stats?.missing.push(fieldName);
      continue;
    }
    if (!(field instanceof PDFCheckBox)) {
      console.warn(`[PDF][techniques] campo "${fieldName}" no es un checkbox (${field.constructor.name})`);
      continue;
    }
    setCheckboxValue(field, shouldCheck);
    if (options.stats) options.stats.written += 1;
  }
};

// Ergebnis: "ja" se maneja en el FIELD_MAP; "nien" es el inverso de causeFound
const applyFindingsResult = (
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  options: { stats?: ApplyStats } = {}
) => {
  const field = getOptionalField(form, "Ergebnis_nien");
  if (!field) {
    options.stats?.missing.push("Ergebnis_nien");
    return;
  }
  if (field instanceof PDFCheckBox) {
    setCheckboxValue(field, !report.findings.causeFound);
    if (options.stats) options.stats.written += 1;
  }
};

// Fotos: campos de texto (Ort y Dokumentation) por slot
const applyPhotoTextFields = (
  form: ReturnType<PDFDocument["getForm"]>,
  photos: ReportData["photos"],
  options: { stats?: ApplyStats } = {}
) => {
  for (let slot = 1; slot <= 14; slot++) {
    const photo = photos.find((p) => p.slot === slot);
    const ortField = slot === 2 ? "textarea_44uzoj" : `${slot}_bild_ortder`;
    const docField = `${slot}_bild_doku`;

    const ort = getOptionalField(form, ortField);
    if (ort instanceof PDFTextField) {
      ort.enableMultiline();
      ort.setFontSize(6);
      ort.setText(photo?.location ?? "");
      if (options.stats) options.stats.written += 1;
    } else if (!ort) {
      options.stats?.missing.push(ortField);
    }

    const doc = getOptionalField(form, docField);
    if (doc instanceof PDFTextField) {
      doc.enableMultiline();
      doc.setFontSize(6);
      doc.setText(photo?.documentation ?? "");
      if (options.stats) options.stats.written += 1;
    } else if (!doc) {
      options.stats?.missing.push(docField);
    }
  }
};

// ---------------------------------------------------------------------------
// Pipeline unificada: aplica TODAS las escrituras AcroForm de un report builtin
// (FIELD_MAP + OPTIONAL_FIELD_MAP + Ergebnis_nien + Eingesetzte_* + fotos).
// Devuelve estadísticas para logging diagnóstico.
// ---------------------------------------------------------------------------
const applyAllAcroFormFields = (
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  template: TemplateConfig
): ApplyStats => {
  const stats: ApplyStats = { written: 0, missing: [] };

  applyFieldMap(form, report, template, { stats });
  applyFieldMap(form, report, template, { optional: true, stats });
  applyFindingsResult(form, report, { stats });
  applyTechniques(form, report.techniques ?? [], { stats });
  applyPhotoTextFields(form, report.photos ?? [], { stats });

  return stats;
};

// ---------------------------------------------------------------------------
// Inserción de imágenes
// ---------------------------------------------------------------------------
const embedImageBytes = async (pdf: PDFDocument, path: string, bytes: Uint8Array) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
};

const drawArrow = (
  page: ReturnType<PDFDocument["getPages"]>[number],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  strokeColor: ReturnType<typeof rgb>,
  sw: number
) => {
  const thickness = Math.max(0.8, sw * 0.55);
  page.drawLine({
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    thickness,
    color: strokeColor
  });

  const angle = Math.atan2(endY - startY, endX - startX);
  const len = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
  const size = Math.max(4, Math.min(10, len * 0.28));
  const leftX = endX - size * Math.cos(angle - Math.PI / 6);
  const leftY = endY - size * Math.sin(angle - Math.PI / 6);
  const rightX = endX - size * Math.cos(angle + Math.PI / 6);
  const rightY = endY - size * Math.sin(angle + Math.PI / 6);

  page.drawLine({ start: { x: endX, y: endY }, end: { x: leftX, y: leftY }, thickness, color: strokeColor });
  page.drawLine({ start: { x: endX, y: endY }, end: { x: rightX, y: rightY }, thickness, color: strokeColor });
};

const getPdfArrowEndpoint = (
  annotation: PhotoAnnotation,
  area: { x: number; y: number; width: number; height: number }
) => {
  const startX = area.x + annotation.x * area.width;
  const startY = area.y + area.height - annotation.y * area.height;
  const rotation = ((annotation.rotation ?? 35) * Math.PI) / 180;
  const length = (annotation.width ?? 0.16) * area.width;

  return {
    startX,
    startY,
    endX: startX + Math.cos(rotation) * length,
    endY: startY - Math.sin(rotation) * length
  };
};

const drawPhotoAnnotations = async (
  page: ReturnType<PDFDocument["getPages"]>[number],
  slot: number,
  report: ReportData,
  area: { x: number; y: number; width: number; height: number },
  pdf: PDFDocument,
  boldFont: PDFFont
) => {
  const annotations = readPhotoAnnotations(report, slot);
  if (annotations.length === 0) return;

  for (const annotation of annotations) {
    const strokeColor = hexToRgbColor(annotation.color);
    // Keep fill as a lightly tinted version of the stroke color (20% opacity overlay)
    const sw = annotation.strokeWidth ?? 1.8;
    const borderWidth = Math.max(0.7, sw * 0.55);

    const centerX = area.x + annotation.x * area.width;
    const centerY = area.y + area.height - annotation.y * area.height;
    const shapeWidth = (annotation.width ?? 0.13) * area.width;
    const shapeHeight = (annotation.height ?? 0.09) * area.height;
    const rotation = annotation.rotation ?? 0;

    if (annotation.type === "pen") {
      const pts = annotation.points;
      if (!pts || pts.length < 2) continue;
      const svgPath = smoothPathForPdf(pts, area.width, area.height);
      // drawSvgPath: origin (x,y) is top-left of the coordinate space; pdf-lib flips y internally
      page.drawSvgPath(svgPath, {
        x: area.x,
        y: area.y + area.height,
        borderColor: strokeColor,
        borderWidth,
        color: undefined,
        opacity: 0
      });
    } else if (annotation.type === "text") {
      if (!annotation.text?.trim()) continue;
      // Limitar font size de anotaciones: mínimo 5pt, máximo 11pt
      const fontSize = Math.max(5, Math.min(11, sw * 1.2));
      page.drawText(annotation.text, {
        x: centerX,
        y: centerY,
        size: fontSize,
        font: boldFont,
        color: strokeColor
      });
    } else if (annotation.type === "circle") {
      page.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: shapeWidth / 2,
        yScale: shapeHeight / 2,
        color: strokeColor,
        opacity: 0.12,
        borderColor: strokeColor,
        borderWidth,
        rotate: degrees(-rotation)
      });
    } else if (annotation.type === "rect") {
      page.drawRectangle({
        x: centerX - shapeWidth / 2,
        y: centerY - shapeHeight / 2,
        width: shapeWidth,
        height: shapeHeight,
        color: strokeColor,
        opacity: 0.12,
        borderColor: strokeColor,
        borderWidth,
        rotate: degrees(-rotation)
      });
    } else if (annotation.type === "arrow") {
      const { startX, startY, endX, endY } = getPdfArrowEndpoint(annotation, area);
      drawArrow(page, startX, startY, endX, endY, strokeColor, sw);
    } else {
      // pin: small crosshair dot
      const r = Math.max(3, shapeWidth * 0.5);
      page.drawEllipse({
        x: centerX, y: centerY,
        xScale: r, yScale: r,
        color: strokeColor, opacity: 0.18,
        borderColor: strokeColor, borderWidth
      });
      page.drawLine({ start: { x: centerX - r * 0.6, y: centerY }, end: { x: centerX + r * 0.6, y: centerY }, thickness: borderWidth * 0.7, color: strokeColor });
      page.drawLine({ start: { x: centerX, y: centerY - r * 0.6 }, end: { x: centerX, y: centerY + r * 0.6 }, thickness: borderWidth * 0.7, color: strokeColor });
    }
  }
};

// Dibuja foto en el slot correspondiente (a la derecha de los campos de texto)
const drawPhotoImages = async (
  pdf: PDFDocument,
  photos: ReportData["photos"],
  bucket: Bucket,
  report: ReportData
) => {
  const pages = pdf.getPages();

  // Embed font once for all text annotations across all photos
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const photo of photos) {
    const geo = PHOTO_SLOT_GEOMETRY[photo.slot];
    if (!geo || !photo.storagePath) continue;

    const page = pages[geo.pageIndex];
    if (!page) continue;

    const bytes = await loadBytesFromBucket(bucket, photo.storagePath);
    if (!bytes) continue;

    try {
      const image = await embedImageBytes(pdf, photo.storagePath, bytes);
      const imgW = image.width;
      const imgH = image.height;

      // Ajustar manteniendo proporción dentro del área disponible
      const scaleW = geo.width  / imgW;
      const scaleH = geo.height / imgH;
      const scale  = Math.min(scaleW, scaleH);
      const drawW  = imgW * scale;
      const drawH  = imgH * scale;

      // Centrar dentro del área
      const drawX = geo.x + (geo.width  - drawW) / 2;
      const drawY = geo.y + (geo.height - drawH) / 2;

      page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
      await drawPhotoAnnotations(page, photo.slot, report, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH
      }, pdf, boldFont);
    } catch {
      // imagen corrupta o formato no soportado — continuar con las demás
    }
  }
};

// Dibuja el logo de la empresa en la esquina superior derecha de todas las páginas
const drawCompanyLogo = async (
  pdf: PDFDocument,
  companyId: CompanyId | undefined,
  bucket: Bucket
) => {
  if (!companyId) return;

  const company = COMPANIES[companyId];
  if (!company) return;

  const bytes = await loadBytesFromBucket(bucket, company.logoStoragePath);
  if (!bytes) return;

  try {
    const image = await embedImageBytes(pdf, company.logoStoragePath, bytes);
    const imgW = image.width;
    const imgH = image.height;

    const scaleW = LOGO_RECT.width  / imgW;
    const scaleH = LOGO_RECT.height / imgH;
    const scale  = Math.min(scaleW, scaleH);
    const drawW  = imgW * scale;
    const drawH  = imgH * scale;

    // Alinear a la derecha dentro del área reservada
    const drawX = LOGO_RECT.x + (LOGO_RECT.width  - drawW);
    const drawY = LOGO_RECT.y;

    for (const page of pdf.getPages()) {
      page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
    }
  } catch {
    // logo no disponible o formato no soportado — continuar sin logo
  }
};

// ---------------------------------------------------------------------------
// Firma: dibujada en posición fija (página 1, parte inferior derecha)
// ---------------------------------------------------------------------------
const SIGNATURE_RECT = { pageIndex: 0, x: 320, y: 80, width: 200, height: 60 };

const drawSignature = async (
  pdf: PDFDocument,
  signature: ReportData["signature"],
  bucket: Bucket
) => {
  if (!signature.storagePath) return;

  const bytes = await loadBytesFromBucket(bucket, signature.storagePath);
  if (!bytes) return;

  try {
    const image = await embedImageBytes(pdf, signature.storagePath, bytes);
    const page = pdf.getPages()[SIGNATURE_RECT.pageIndex];
    if (!page) return;

    const imgW = image.width;
    const imgH = image.height;
    const scaleW = SIGNATURE_RECT.width  / imgW;
    const scaleH = SIGNATURE_RECT.height / imgH;
    const scale  = Math.min(scaleW, scaleH);

    page.drawImage(image, {
      x:      SIGNATURE_RECT.x,
      y:      SIGNATURE_RECT.y,
      width:  imgW * scale,
      height: imgH * scale
    });
  } catch { /* ignorar */ }
};

const drawSignatureAtRects = async (
  pdf: PDFDocument,
  signature: ReportData["signature"],
  bucket: Bucket,
  rects: Array<{ page: number; rect: TemplateFieldRect }>
) => {
  if (!signature.storagePath || rects.length === 0) {
    return;
  }

  const bytes = await loadBytesFromBucket(bucket, signature.storagePath);
  if (!bytes) {
    return;
  }

  try {
    const image = await embedImageBytes(pdf, signature.storagePath, bytes);
    const pages = pdf.getPages();

    for (const item of rects) {
      const page = pages[item.page - 1];
      if (!page) {
        continue;
      }

      const scaleW = item.rect.width / image.width;
      const scaleH = item.rect.height / image.height;
      const scale = Math.min(scaleW, scaleH);

      page.drawImage(image, {
        x: item.rect.x,
        y: item.rect.y,
        width: image.width * scale,
        height: image.height * scale
      });
    }
  } catch {
    // ignore invalid signature formats
  }
};

const applyDynamicFieldSchema = async (
  pdf: PDFDocument,
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  version: TemplateVersion,
  bucket: Bucket
) => {
  const signatureRects: Array<{ page: number; rect: TemplateFieldRect }> = [];

  for (const fieldSchema of version.fieldSchema) {
    if (!fieldSchema.pdfFieldName) {
      continue;
    }

    if (fieldSchema.type === "signature" || fieldSchema.source === "signature") {
      signatureRects.push({ page: fieldSchema.page, rect: fieldSchema.rect });
      continue;
    }

    if (fieldSchema.type === "image") {
      continue;
    }

    const field = getOptionalField(form, fieldSchema.pdfFieldName);
    if (!field) {
      continue;
    }

    const rawValue = report.templateFields?.[fieldSchema.id];
    const value = rawValue === undefined || rawValue === null || rawValue === ""
      ? fieldSchema.defaultValue
      : rawValue;

    assignFieldValue(field, value);
  }

  await drawSignatureAtRects(pdf, report.signature, bucket, signatureRects);
};

// Firma del cliente en formulario LECKORTUNG (campo signature_10ubdv)
const drawLeckortungCustomerSignature = async (
  pdf: PDFDocument,
  templateFields: ReportData["templateFields"],
  bucket: Bucket
) => {
  const signaturePath = String(templateFields?.customerSignaturePath ?? "").trim();
  if (!signaturePath) return;

  const bytes = await loadBytesFromBucket(bucket, signaturePath);
  if (!bytes) return;

  try {
    const image = await embedImageBytes(pdf, signaturePath, bytes);
    const rect = LECKORTUNG_CUSTOMER_SIGNATURE_RECT;
    const page = pdf.getPages()[rect.pageIndex];
    if (!page) return;

    const scaleW = rect.width  / image.width;
    const scaleH = rect.height / image.height;
    const scale  = Math.min(scaleW, scaleH);

    page.drawImage(image, {
      x:      rect.x,
      y:      rect.y,
      width:  image.width  * scale,
      height: image.height * scale
    });
  } catch { /* ignorar */ }
};

// ---------------------------------------------------------------------------
// Aplanado seguro: elimina los campos Button del formulario antes de flatten
// para evitar que pdf-lib falle cuando un campo de firma/botón no tiene
// un appearance stream definido (PDF_RENDER_FAILED en esos casos).
// ---------------------------------------------------------------------------
const flattenSafe = (form: ReturnType<PDFDocument["getForm"]>) => {
  // Quitar los PDFButton del AcroForm antes de flatten para no crashear
  for (const field of form.getFields()) {
    if (field instanceof PDFButton) {
      try {
        // Eliminar cada widget del campo de la página correspondiente
        const widgets = (field as unknown as {
          acroField?: { getWidgets?: () => Array<{ P?: unknown }> }
        }).acroField?.getWidgets?.() ?? [];
        for (const widget of widgets) {
          // Marcar el widget como oculto para que no aparezca en el PDF plano
          try {
            (widget as unknown as { setHidden?: (v: boolean) => void }).setHidden?.(true);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
  }

  // Nota: NO llamamos a `form.updateFieldAppearances()` global aquí.
  // Esa función regenera TODOS los appearance streams usando el /DA original
  // del template, lo cual pisa el `setFontSize` que aplicamos a los campos de
  // fotos y al Einsatzbericht. Las apariencias individuales ya quedan al día
  // porque `setText()` y `setCheckboxValue()` regeneran cada widget al
  // asignar valor.
  try {
    form.flatten();
  } catch {
    // Si flatten falla por algún campo problemático, el PDF sigue siendo válido
    // con los campos de texto ya rellenados; simplemente no se aplana.
  }
};

// ---------------------------------------------------------------------------
// Fila extra de Abrechnung: el PDF tiene 3 filas dibujadas pero solo la fila
// central (Y=696) tiene campos AcroForm rellenables. Para soportar un segundo
// técnico que también haya estado en obra, creamos programáticamente los 3
// campos de la fila inferior (Y=683) si no existen ya.
//
// Coordenadas verificadas con pdftk sobre template-prok15.pdf y template-all15.pdf
// (idénticos en este bloque). Página 7 (índice 0-based: 6).
// ---------------------------------------------------------------------------
const EXTRA_ARBEITSZEIT_ROW: Array<{
  name: string;
  rect: { x: number; y: number; width: number; height: number };
}> = [
  { name: "Abrechnung_Arbeitszeit_2_date", rect: { x: 135, y: 683, width: 131, height: 11 } },
  { name: "Abrechnung_Arbeitszeit_2_von",  rect: { x: 432, y: 683, width: 62,  height: 11 } },
  { name: "Abrechnung_Arbeitszeit_2_bis",  rect: { x: 497, y: 683, width: 68,  height: 11 } }
];

const ensureExtraArbeitszeitRow = (
  pdf: PDFDocument,
  form: ReturnType<PDFDocument["getForm"]>
) => {
  const pages = pdf.getPages();
  const targetPage = pages[6]; // página 7 (1-based) = índice 6
  if (!targetPage) return;

  for (const { name, rect } of EXTRA_ARBEITSZEIT_ROW) {
    // Idempotente: si el PDF ya incluye estos campos en el futuro, no los duplicamos.
    if (getOptionalField(form, name)) continue;
    try {
      const tf = form.createTextField(name);
      // addToPage DEBE ir antes que setFontSize: es addToPage quien
      // establece la entrada /DA (default appearance) del campo.
      // Si se llama setFontSize antes, pdf-lib lanza "No /DA entry found".
      tf.addToPage(targetPage, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderWidth: 0
      });
      tf.setFontSize(8);
    } catch (err) {
      console.warn(`[PDF] ensureExtraArbeitszeitRow: no se pudo crear el campo "${name}":`, err instanceof Error ? err.message : err);
    }
  }
};

/**
 * Devuelve una copia del report lista para la generación del PDF:
 *  - Resuelve el override del bloque MessortObjekt (name2/street2/... > name1/street1/...).
 *  - Para la plantilla LECKORTUNG, fuerza el texto fijo del bloque
 *    "Wichtiger Hinweis AUFTRAG" en `templateFields.hinweis` (no editable).
 */
const resolveMessortObjektOverride = (report: ReportData): ReportData => {
  const c = report.contacts;
  const pick = (overrideValue: string | undefined, baseValue: string | undefined) => {
    const o = (overrideValue ?? "").trim();
    return o ? overrideValue ?? "" : baseValue ?? "";
  };

  const baseResolved: ReportData = {
    ...report,
    contacts: {
      ...c,
      name1:   pick(c.name2,   c.name1),
      street1: pick(c.street2, c.street1),
      city1:   pick(c.city2,   c.city1),
      phone1:  pick(c.phone2,  c.phone1),
      mobile1: pick(c.mobile2, c.mobile1),
    }
  };

  // LECKORTUNG: el Hinweis siempre lleva el mismo texto legal/AGB
  if (baseResolved.brandTemplateId === "leckortung") {
    return {
      ...baseResolved,
      templateFields: {
        ...baseResolved.templateFields,
        hinweis: LECKORTUNG_HINWEIS_TEXT,
      }
    };
  }

  return baseResolved;
};

// ---------------------------------------------------------------------------
// Función principal de renderizado
// ---------------------------------------------------------------------------
export const renderReportPdf = async (
  report: ReportData,
  template: TemplateConfig,
  bucket: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  // 1. Cargar plantilla desde Storage
  const templateBytes = await loadBytesFromBucket(bucket, template.pdfTemplatePath);
  if (!templateBytes) {
    throw new Error(`TEMPLATE_PDF_NOT_FOUND:${template.pdfTemplatePath}`);
  }

  const pdf  = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdf.getForm();

  // 1.5. Asegurar que los campos del 2º técnico existen (creados programáticamente
  // si no están en el PDF). Debe ir ANTES de applyAllAcroFormFields para que
  // applyFieldMap los encuentre vía OPTIONAL_FIELD_MAP.
  ensureExtraArbeitszeitRow(pdf, form);

  // 1.6. Resolver override del bloque MessortObjekt (name2/street2/... > name1/street1/...)
  const resolvedReport = resolveMessortObjektOverride(report);

  // 2. Pipeline unificada: FIELD_MAP + OPTIONAL + Ergebnis_nien + técnicas + fotos-texto
  const stats = applyAllAcroFormFields(form, resolvedReport, template);
  console.log(
    `[PDF] AcroForm aplicado: written=${stats.written} missing=${stats.missing.length}` +
      (stats.missing.length > 0 ? ` samples=${JSON.stringify(stats.missing.slice(0, 10))}` : "")
  );

  // 3. Imágenes de fotos (dibujadas sobre las páginas)
  await drawPhotoImages(pdf, resolvedReport.photos ?? [], bucket, resolvedReport);

  // 4. Logo de empresa (esquina superior derecha de todas las páginas)
  await drawCompanyLogo(pdf, resolvedReport.companyId, bucket);

  // 5. Firma técnica (SVT) / Firma del cliente (LECKORTUNG)
  if (resolvedReport.brandTemplateId === "leckortung") {
    await drawLeckortungCustomerSignature(pdf, resolvedReport.templateFields, bucket);
  } else {
    await drawSignature(pdf, resolvedReport.signature, bucket);
  }

  // 6. Aplanar si es versión final
  if (options.flatten) {
    flattenSafe(form);
  }

  return pdf.save();
};

// Wrapper de compatibilidad: los tests antiguos inyectan los bytes del PDF
export const fillReportPdfTemplate = async (
  templatePdf: Uint8Array,
  report: ReportData,
  template: TemplateConfig,
  bucket: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(templatePdf, { ignoreEncryption: true });
  const form = pdf.getForm();

  // Asegurar la fila extra del 2º técnico antes del mapping (idempotente).
  ensureExtraArbeitszeitRow(pdf, form);

  const resolvedReport = resolveMessortObjektOverride(report);

  // Pipeline unificada — misma que renderReportPdf, garantiza que los tests
  // ejerciten exactamente la misma ruta de escritura AcroForm que producción.
  applyAllAcroFormFields(form, resolvedReport, template);

  await drawPhotoImages(pdf, resolvedReport.photos ?? [], bucket, resolvedReport);
  await drawCompanyLogo(pdf, resolvedReport.companyId, bucket);
  await drawSignature(pdf, resolvedReport.signature, bucket);

  if (options.flatten) {
    form.flatten();
  }

  return pdf.save();
};

export const fillDynamicReportPdfTemplate = async (
  templatePdf: Uint8Array,
  report: ReportData,
  version: TemplateVersion,
  bucket: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(templatePdf, { ignoreEncryption: true });
  const form = pdf.getForm();

  await applyDynamicFieldSchema(pdf, form, report, version, bucket);
  await drawCompanyLogo(pdf, report.companyId, bucket);

  if (options.flatten) {
    form.flatten();
  }

  return pdf.save();
};

export const renderDynamicReportPdf = async (
  report: ReportData,
  version: TemplateVersion,
  bucket: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  const templateBytes = await loadBytesFromBucket(bucket, version.basePdfPath);
  if (!templateBytes) {
    throw new Error(`TEMPLATE_PDF_NOT_FOUND:${version.basePdfPath}`);
  }

  return fillDynamicReportPdfTemplate(templateBytes, report, version, bucket, options);
};

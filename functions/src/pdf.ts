import type { Bucket } from "@google-cloud/storage";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField
} from "pdf-lib";
import { CompanyId, ReportData, TemplateConfig } from "./types";
import { COMPANIES } from "./templates";

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

const PHOTO_SLOT_GEOMETRY: Record<number, PhotoSlotGeometry> = {
  // Página 2 (índice 1) — bild1
  1: { pageIndex: 1, x: 228, y: 98,  width: 342, height: 165 },
  // Página 3 (índice 2) — bild2, bild3, bild4
  2: { pageIndex: 2, x: 228, y: 571, width: 342, height: 166 },
  3: { pageIndex: 2, x: 228, y: 353, width: 342, height: 164 },
  4: { pageIndex: 2, x: 228, y: 108, width: 342, height: 164 },
  // Página 4 (índice 3) — bild5, bild6, bild7
  5: { pageIndex: 3, x: 228, y: 571, width: 342, height: 166 },
  6: { pageIndex: 3, x: 228, y: 354, width: 342, height: 164 },
  7: { pageIndex: 3, x: 228, y: 122, width: 342, height: 165 },
  // Página 5 (índice 4) — bild8, bild9
  8: { pageIndex: 4, x: 228, y: 572, width: 342, height: 165 },
  9: { pageIndex: 4, x: 228, y: 353, width: 342, height: 164 }
};

// Posición del logo en la esquina superior derecha de cada página (A4: 595 × 842 pt)
const LOGO_RECT = { x: 415, y: 770, width: 150, height: 58 };

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

// ---------------------------------------------------------------------------
// Relleno de campos AcroForm
// ---------------------------------------------------------------------------
const getFieldOrThrow = (form: ReturnType<PDFDocument["getForm"]>, fieldName: string): PDFField => {
  try {
    return form.getField(fieldName);
  } catch {
    throw new Error(`MAPPED_FIELD_NOT_FOUND:${fieldName}`);
  }
};

const assignFieldValue = (field: PDFField, value: unknown) => {
  if (field instanceof PDFCheckBox) {
    toBoolean(value) ? field.check() : field.uncheck();
    return;
  }

  if (field instanceof PDFTextField) {
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
const applyFieldMap = (
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  template: TemplateConfig
) => {
  for (const [logicalPath, target] of Object.entries(template.fieldMap)) {
    const value = getValueByPath(report, logicalPath);
    const targets = Array.isArray(target) ? target : [target];
    for (const fieldName of targets) {
      const field = getFieldOrThrow(form, fieldName);
      assignFieldValue(field, value);
    }
  }
};

// Técnicas: el array de strings se mapea a checkboxes individuales del PDF
const TECHNIQUE_CHECKBOX_MAP: Record<string, string> = {
  "Sichtprüfung":  "Sichtprüfung",
  "Feuchtemessung":"Feuchtemessung",
  "Druckprobe":    "Druckprobe",
  "Thermografie":  "Thermografie",
  "Elektroakustik":"Elektroakustik",
  "Leitungsortung":"Leitungsortung",
  "Tracergas":     "Tracergas",
  "Rohrkamera":    "Rohrkamera",
  "Endoskopie":    "Endoskopie",
  "Färbemittel":   "Färbemittel",
  "Spülung":       "Spülung",
  "Leitfähigkeit": "Leitfähigkeit"
};

const applyTechniques = (
  form: ReturnType<PDFDocument["getForm"]>,
  techniques: string[]
) => {
  for (const [label, fieldName] of Object.entries(TECHNIQUE_CHECKBOX_MAP)) {
    try {
      const field = form.getField(fieldName);
      if (field instanceof PDFCheckBox) {
        techniques.includes(label) ? field.check() : field.uncheck();
      }
    } catch {
      // campo no encontrado — ignorar silenciosamente
    }
  }
};

// Fotos: campos de texto (Ort y Dokumentation) por slot
const applyPhotoTextFields = (
  form: ReturnType<PDFDocument["getForm"]>,
  photos: ReportData["photos"]
) => {
  for (let slot = 1; slot <= 9; slot++) {
    const photo = photos.find((p) => p.slot === slot);
    const ortField   = `bild${slot}_OrtderAufnahme`;
    const docField   = `bild${slot}_Dokumentation`;

    try {
      const ort = form.getField(ortField);
      if (ort instanceof PDFTextField) ort.setText(photo?.location ?? "");
    } catch { /* ignorar */ }

    try {
      const doc = form.getField(docField);
      if (doc instanceof PDFTextField) doc.setText(photo?.documentation ?? "");
    } catch { /* ignorar */ }
  }
};

// ---------------------------------------------------------------------------
// Inserción de imágenes
// ---------------------------------------------------------------------------
const embedImageBytes = async (pdf: PDFDocument, path: string, bytes: Uint8Array) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
};

// Dibuja foto en el slot correspondiente (a la derecha de los campos de texto)
const drawPhotoImages = async (
  pdf: PDFDocument,
  photos: ReportData["photos"],
  bucket: Bucket
) => {
  const pages = pdf.getPages();

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

  // 2. Rellenar campos AcroForm estándar
  applyFieldMap(form, report, template);

  // 3. Técnicas (array → checkboxes individuales)
  applyTechniques(form, report.techniques ?? []);

  // 4. Campos de texto de fotos (Ort + Dokumentation)
  applyPhotoTextFields(form, report.photos ?? []);

  // 5. Imágenes de fotos (dibujadas sobre las páginas)
  await drawPhotoImages(pdf, report.photos ?? [], bucket);

  // 6. Logo de empresa (esquina superior derecha de todas las páginas)
  await drawCompanyLogo(pdf, report.companyId, bucket);

  // 7. Firma (dibujada en posición fija, página 1)
  await drawSignature(pdf, report.signature, bucket);

  // 8. Aplanar si es versión final
  if (options.flatten) {
    form.flatten();
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

  applyFieldMap(form, report, template);
  applyTechniques(form, report.techniques ?? []);
  applyPhotoTextFields(form, report.photos ?? []);
  await drawPhotoImages(pdf, report.photos ?? [], bucket);
  await drawCompanyLogo(pdf, report.companyId, bucket);
  await drawSignature(pdf, report.signature, bucket);

  if (options.flatten) {
    form.flatten();
  }

  return pdf.save();
};

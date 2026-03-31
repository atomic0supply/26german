import { TemplateFieldRect, TemplateFieldSchema, TemplateFieldSource, TemplateFieldType, TemplateSchemaSource, TemplateVersion } from "./types";

type TextRun = {
  text: string;
  rect: TemplateFieldRect;
};

type PageContext = {
  page: number;
  width: number;
  height: number;
  lines: TextRun[];
  markers: string[];
};

type SuggestionEnvelope = {
  summary: string;
  warnings: string[];
  fields: TemplateFieldSchema[];
};

type SuggestTemplateSchemaResult = {
  fieldSchema: TemplateFieldSchema[];
  summary: string;
  model: string;
  generatedAt: string;
  warnings: string[];
  schemaSource: TemplateSchemaSource;
};

type GeminiConfig = {
  apiKey?: string;
  model?: string;
};

const DEFAULT_MODEL = "gemini-2.5-flash";
const LINE_Y_TOLERANCE = 0.012;
const DEFAULT_FIELD_SIZE: Record<TemplateFieldType, { width: number; height: number }> = {
  text: { width: 0.24, height: 0.035 },
  textarea: { width: 0.3, height: 0.09 },
  checkbox: { width: 0.015, height: 0.015 },
  dropdown: { width: 0.22, height: 0.04 },
  image: { width: 0.22, height: 0.14 },
  signature: { width: 0.24, height: 0.08 }
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Math.round(value * 1000) / 1000;

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const transliterate = (value: string) =>
  value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue");

const toSnakeCase = (value: string) => {
  const normalized = transliterate(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();

  return normalized || "field";
};

const uniqueId = (baseId: string, seen: Set<string>) => {
  let candidate = baseId;
  let counter = 2;
  while (seen.has(candidate)) {
    candidate = `${baseId}_${counter}`;
    counter += 1;
  }
  seen.add(candidate);
  return candidate;
};

const parseDropdownOptions = (value: string): string[] => {
  const options = value
    .split(/[,/|;]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);

  return [...new Set(options)];
};

const guessMarkers = (text: string): string[] => {
  const lower = text.toLowerCase();
  const markers: string[] = [];

  if (/\b(datum|date|fecha)\b/.test(lower)) markers.push("date");
  if (/\b(unterschrift|signature|firma)\b/.test(lower)) markers.push("signature");
  if (/\b(foto|bild|image|imagen)\b/.test(lower)) markers.push("image");
  if (/\b(telefon|phone|tel\.?)\b/.test(lower)) markers.push("phone");
  if (/\b(e-?mail|correo)\b/.test(lower)) markers.push("email");
  if (/\b(ja|nein|yes|no)\b/.test(lower)) markers.push("boolean");
  if (/[:_]{1,}$/.test(text.trim())) markers.push("label");
  if (/\/|,/.test(text) && /\b(ja|nein|yes|no)\b/.test(lower)) markers.push("choice");

  return markers;
};

const buildRectFromLabel = (labelRect: TemplateFieldRect, type: TemplateFieldType): TemplateFieldRect => {
  const size = DEFAULT_FIELD_SIZE[type];
  const x = clamp(labelRect.x + labelRect.width + 0.02, 0.02, 1 - size.width);
  const y = clamp(labelRect.y - (type === "textarea" ? 0.005 : 0), 0.01, 1 - size.height);

  return {
    x: round(x),
    y: round(y),
    width: round(size.width),
    height: round(size.height)
  };
};

const normalizeRect = (rect: TemplateFieldRect, type: TemplateFieldType): TemplateFieldRect => {
  const minimum = DEFAULT_FIELD_SIZE[type];
  const width = clamp(rect.width || minimum.width, minimum.width, 1);
  const height = clamp(rect.height || minimum.height, minimum.height, 1);
  const x = clamp(rect.x, 0, 1 - width);
  const y = clamp(rect.y, 0, 1 - height);

  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height)
  };
};

const inferTypeFromLabel = (label: string): TemplateFieldType => {
  const lower = label.toLowerCase();
  if (/\b(unterschrift|signature|firma)\b/.test(lower)) {
    return "signature";
  }
  if (/\b(foto|bild|image|imagen)\b/.test(lower)) {
    return "image";
  }
  if (/\b(ja|nein|yes|no)\b/.test(lower)) {
    return "checkbox";
  }
  if (/\/|,/.test(label) && /\b(ja|nein|yes|no)\b/.test(lower)) {
    return "dropdown";
  }
  if (label.length > 55) {
    return "textarea";
  }
  return "text";
};

const inferSource = (type: TemplateFieldType, source?: string): TemplateFieldSource => {
  if (source === "image" || source === "signature" || source === "dynamic") {
    return source;
  }
  if (type === "image") {
    return "image";
  }
  if (type === "signature") {
    return "signature";
  }
  return "dynamic";
};

const sanitizeField = (field: Partial<TemplateFieldSchema>, seen: Set<string>): TemplateFieldSchema | null => {
  const label = normalizeText(String(field.label ?? ""));
  if (!label) {
    return null;
  }

  const rawType = String(field.type ?? inferTypeFromLabel(label)) as TemplateFieldType;
  const type = (["text", "textarea", "checkbox", "dropdown", "image", "signature"] as TemplateFieldType[]).includes(rawType)
    ? rawType
    : inferTypeFromLabel(label);
  const id = uniqueId(toSnakeCase(String(field.id ?? label)), seen);
  const rect = normalizeRect(field.rect ?? buildRectFromLabel({ x: 0.08, y: 0.08, width: 0.2, height: 0.025 }, type), type);
  const options = type === "dropdown"
    ? parseDropdownOptions(Array.isArray(field.options) ? field.options.join("|") : String(field.options ?? ""))
    : [];
  const effectiveType = type === "dropdown" && options.length < 2 ? "text" : type;

  return {
    id,
    type: effectiveType,
    source: inferSource(effectiveType, typeof field.source === "string" ? field.source : undefined),
    label,
    page: Number.isInteger(field.page) && Number(field.page) >= 0 ? Number(field.page) : 0,
    rect,
    required: Boolean(field.required),
    options: effectiveType === "dropdown" ? options : [],
    defaultValue: typeof field.defaultValue === "string" ? field.defaultValue : effectiveType === "image" ? "1" : "",
    helpText: typeof field.helpText === "string" ? field.helpText : "",
    aiConfidence: typeof field.aiConfidence === "number" ? clamp(field.aiConfidence, 0, 1) : undefined,
    aiReason: typeof field.aiReason === "string" ? field.aiReason : undefined,
    generatedByAi: true
  };
};

const sanitizeFields = (
  fields: Partial<TemplateFieldSchema>[],
  pageCount: number,
  existingFields: TemplateFieldSchema[],
  overwriteExisting: boolean
) => {
  const seen = new Set<string>((overwriteExisting ? [] : existingFields).map((field) => toSnakeCase(field.id)));
  const nextFields = fields
    .map((field) => sanitizeField(field, seen))
    .filter((field): field is TemplateFieldSchema => Boolean(field))
    .map((field) => ({
      ...field,
      page: clamp(field.page, 0, Math.max(0, pageCount - 1))
    }));

  if (overwriteExisting) {
    return nextFields;
  }

  return [
    ...existingFields,
    ...nextFields
  ];
};

const groupTextRuns = (runs: TextRun[]): TextRun[] => {
  const ordered = [...runs].sort((left, right) => {
    const yDelta = Math.abs(left.rect.y - right.rect.y);
    if (yDelta < LINE_Y_TOLERANCE) {
      return left.rect.x - right.rect.x;
    }
    return left.rect.y - right.rect.y;
  });

  const lines: TextRun[] = [];
  for (const run of ordered) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.rect.y - run.rect.y) < LINE_Y_TOLERANCE) {
      last.text = normalizeText(`${last.text} ${run.text}`);
      const right = Math.max(last.rect.x + last.rect.width, run.rect.x + run.rect.width);
      const bottom = Math.max(last.rect.y + last.rect.height, run.rect.y + run.rect.height);
      last.rect = {
        x: Math.min(last.rect.x, run.rect.x),
        y: Math.min(last.rect.y, run.rect.y),
        width: round(right - Math.min(last.rect.x, run.rect.x)),
        height: round(bottom - Math.min(last.rect.y, run.rect.y))
      };
      continue;
    }

    lines.push({
      text: run.text,
      rect: { ...run.rect }
    });
  }

  return lines;
};

type PdfJsModule = {
  getDocument: (options: Record<string, unknown>) => { promise: Promise<{
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
      getViewport: (options: { scale: number }) => { width: number; height: number };
      getTextContent: () => Promise<{ items: unknown[] }>;
    }>;
  }> };
};

const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;
let pdfJsLoader: () => Promise<PdfJsModule> = async () => dynamicImport("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsModule>;

export const setPdfJsLoaderForTests = (loader: (() => Promise<PdfJsModule>) | null) => {
  pdfJsLoader = loader ?? (async () => dynamicImport("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsModule>);
};

const extractPdfContext = async (bytes: Uint8Array): Promise<PageContext[]> => {
  const pdfjs = await pdfJsLoader();
  const document = await pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false
  }).promise;

  const contexts: PageContext[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const runs: TextRun[] = textContent.items.flatMap((item) => {
      const candidate = item as { str?: string; transform?: number[]; width?: number; height?: number };
      const text = normalizeText(candidate.str ?? "");
      if (!text || !Array.isArray(candidate.transform) || candidate.transform.length < 6) {
        return [];
      }

      const width = candidate.width ?? 0;
      const height = candidate.height ?? 0;
      const x = round(candidate.transform[4] / viewport.width);
      const y = round(1 - ((candidate.transform[5] + height) / viewport.height));

      return [{
        text,
        rect: {
          x: clamp(x, 0, 1),
          y: clamp(y, 0, 1),
          width: round(clamp(width / viewport.width, 0.01, 1)),
          height: round(clamp(height / viewport.height, 0.008, 1))
        }
      }];
    });

    const lines = groupTextRuns(runs).filter((line) => line.text.length > 1);
    contexts.push({
      page: pageNumber - 1,
      width: viewport.width,
      height: viewport.height,
      lines,
      markers: [...new Set(lines.flatMap((line) => guessMarkers(line.text)))]
    });
  }

  return contexts;
};

const buildHeuristicSchema = (pages: PageContext[]): SuggestionEnvelope => {
  const fields: Partial<TemplateFieldSchema>[] = [];

  for (const page of pages) {
    for (const line of page.lines) {
      const text = line.text;
      const normalized = text.toLowerCase();
      if (text.length < 2 || text.length > 90) {
        continue;
      }

      const markerSet = new Set(guessMarkers(text));
      const type = inferTypeFromLabel(text);
      const shouldCreateField =
        markerSet.has("label") ||
        markerSet.has("signature") ||
        markerSet.has("image") ||
        markerSet.has("phone") ||
        markerSet.has("email") ||
        /\b(nummer|name|adresse|street|ort|stadt|mail|telefon|claim|objekt|projekt)\b/.test(normalized);

      if (!shouldCreateField) {
        continue;
      }

      fields.push({
        id: toSnakeCase(text),
        label: text.replace(/[:_]+$/, "").trim(),
        page: page.page,
        type,
        source: inferSource(type),
        rect: buildRectFromLabel(line.rect, type),
        required: /\*/.test(text),
        options: type === "dropdown" ? parseDropdownOptions(text) : [],
        defaultValue: type === "image" ? String(fields.filter((entry) => entry.type === "image").length + 1) : "",
        helpText: "",
        aiConfidence: 0.46,
        aiReason: "Fallback heuristic based on nearby label text."
      });
    }
  }

  return {
    summary: `Heuristic draft created from ${pages.length} PDF page(s).`,
    warnings: ["GEMINI_UNAVAILABLE_USING_HEURISTICS"],
    fields: fields as TemplateFieldSchema[]
  };
};

const buildPrompt = (pages: PageContext[]) => {
  const compactPages = pages.map((page) => ({
    page: page.page,
    size: { width: Math.round(page.width), height: Math.round(page.height) },
    markers: page.markers,
    lines: page.lines.slice(0, 220).map((line) => ({
      text: line.text,
      rect: line.rect
    }))
  }));

  return `
You are generating a PDF form field schema from extracted PDF text and geometry.
Return strict JSON with this shape:
{
  "summary": string,
  "warnings": string[],
  "fields": [
    {
      "id": string,
      "type": "text" | "textarea" | "checkbox" | "dropdown" | "image" | "signature",
      "source": "dynamic" | "image" | "signature",
      "label": string,
      "page": number,
      "rect": { "x": number, "y": number, "width": number, "height": number },
      "required": boolean,
      "options": string[],
      "defaultValue": string,
      "helpText": string,
      "aiConfidence": number,
      "aiReason": string
    }
  ]
}

Rules:
- Coordinates must be normalized between 0 and 1 with top-left origin.
- Be conservative. Only emit checkbox, image, signature, or dropdown when the document strongly suggests that type.
- For labels that likely expect free text, emit text or textarea.
- Prefer one field per visible business label, not decorative headings.
- Generate stable ASCII snake_case ids.
- Keep labels close to the original PDF text.
- If you are unsure, choose text.
- Dropdowns must have at least 2 options.

PDF page extraction:
${JSON.stringify(compactPages)}
  `.trim();
};

const callGemini = async (pages: PageContext[], config?: GeminiConfig): Promise<{ envelope: SuggestionEnvelope; model: string }> => {
  const apiKey = String(config?.apiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  const model = String(config?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(pages) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GEMINI_REQUEST_FAILED:${response.status}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  const parsed = JSON.parse(text) as Partial<SuggestionEnvelope>;
  return {
    envelope: {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Gemini generated a draft schema.",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => String(item)) : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields as TemplateFieldSchema[] : []
    },
    model
  };
};

export const suggestTemplateSchemaFromPdf = async (
  basePdf: Uint8Array,
  version: Pick<TemplateVersion, "fieldSchema">,
  overwriteExisting: boolean,
  config?: GeminiConfig
): Promise<SuggestTemplateSchemaResult> => {
  const pages = await extractPdfContext(basePdf);
  const hasMeaningfulText = pages.some((page) => page.lines.length >= 3);
  if (!hasMeaningfulText) {
    throw new Error("PDF_TEXT_EXTRACTION_EMPTY");
  }

  let envelope: SuggestionEnvelope;
  let model = String(config?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  let schemaSource: TemplateSchemaSource = overwriteExisting ? "ai" : "mixed";

  try {
    const result = await callGemini(pages, config);
    envelope = result.envelope;
    model = result.model;
  } catch (error) {
    envelope = buildHeuristicSchema(pages);
    model = "heuristic-fallback";
    schemaSource = overwriteExisting ? "ai" : "mixed";
    envelope.warnings = [
      ...envelope.warnings,
      error instanceof Error ? error.message : String(error)
    ];
  }

  const fieldSchema = sanitizeFields(envelope.fields, pages.length, version.fieldSchema ?? [], overwriteExisting);
  if (fieldSchema.length === 0) {
    throw new Error("SCHEMA_SUGGESTION_EMPTY");
  }

  return {
    fieldSchema,
    summary: envelope.summary,
    model,
    generatedAt: new Date().toISOString(),
    warnings: envelope.warnings,
    schemaSource
  };
};

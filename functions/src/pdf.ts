import type { Bucket } from "@google-cloud/storage";
import {
  ImageAlignment,
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFTextField,
  rgb
} from "pdf-lib";
import { ReportData, TemplateConfig, TemplateFieldSchema, TemplateVersion } from "./types";

type RenderOptions = {
  flatten?: boolean;
};

type SchemaTemplateInput = Pick<TemplateVersion, "editablePdfPath" | "fieldSchema">;
type AssetOverrides = Record<string, string>;

const normalizeTargets = (target: string | string[]): string[] => (Array.isArray(target) ? target : [target]);

const getValueByPath = (source: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "ja";
  }

  return false;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(", ");
  }

  return "";
};

const getFieldOrThrow = (form: ReturnType<PDFDocument["getForm"]>, fieldName: string): PDFField => {
  try {
    return form.getField(fieldName);
  } catch {
    throw new Error(`MAPPED_FIELD_NOT_FOUND:${fieldName}`);
  }
};

const assignMappedValue = (field: PDFField, value: unknown) => {
  if (field instanceof PDFCheckBox) {
    if (toBoolean(value)) {
      field.check();
    } else {
      field.uncheck();
    }
    return;
  }

  if (field instanceof PDFTextField) {
    field.setText(toText(value));
    return;
  }

  if (field instanceof PDFDropdown) {
    const text = toText(value);
    if (!text) {
      field.clear();
      return;
    }

    const options = field.getOptions();
    if (!options.includes(text)) {
      field.enableEditing();
    }

    field.select(text);
    return;
  }

  if (field instanceof PDFOptionList) {
    const text = toText(value);
    if (!text) {
      field.clear();
      return;
    }

    const options = field.getOptions();
    if (!options.includes(text)) {
      throw new Error(`MAPPED_OPTION_NOT_FOUND:${field.getName()}:${text}`);
    }

    field.select(text);
    return;
  }

  if (field instanceof PDFRadioGroup) {
    const text = toText(value);
    if (!text) {
      field.clear();
      return;
    }

    const options = field.getOptions();
    if (!options.includes(text)) {
      throw new Error(`MAPPED_OPTION_NOT_FOUND:${field.getName()}:${text}`);
    }

    field.select(text);
  }
};

const loadBinaryFromBucket = async (bucket: Bucket, path: string): Promise<Uint8Array | null> => {
  if (!path) {
    return null;
  }

  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }

  const [bytes] = await file.download();
  return bytes;
};

const embedImage = async (pdf: PDFDocument, path: string, bytes: Uint8Array) => {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return pdf.embedJpg(bytes);
  }
  return pdf.embedPng(bytes);
};

const assignMappedImage = async (
  form: ReturnType<PDFDocument["getForm"]>,
  pdf: PDFDocument,
  fieldName: string,
  imagePath: string,
  bucket?: Bucket
) => {
  const field = getFieldOrThrow(form, fieldName);

  if (!imagePath || !bucket) {
    return;
  }

  const bytes = await loadBinaryFromBucket(bucket, imagePath);
  if (!bytes) {
    return;
  }

  const image = await embedImage(pdf, imagePath, bytes);

  if (field instanceof PDFButton) {
    field.setImage(image, ImageAlignment.Center);
    return;
  }

  if (field instanceof PDFTextField) {
    field.setImage(image);
    return;
  }

  throw new Error(`IMAGE_FIELD_NOT_SUPPORTED:${fieldName}`);
};

const applyFixedFieldMappings = (
  form: ReturnType<PDFDocument["getForm"]>,
  report: ReportData,
  template: TemplateConfig
) => {
  Object.entries(template.fieldMap).forEach(([logicalPath, target]) => {
    const value = getValueByPath(report, logicalPath);
    normalizeTargets(target).forEach((fieldName) => {
      const field = getFieldOrThrow(form, fieldName);
      assignMappedValue(field, value);
    });
  });
};

const applyFixedImageMappings = async (
  form: ReturnType<PDFDocument["getForm"]>,
  pdf: PDFDocument,
  report: ReportData,
  template: TemplateConfig,
  bucket?: Bucket
) => {
  for (const [photoSlot, target] of Object.entries(template.imageFieldMap)) {
    const photo = report.photos.find((entry) => String(entry.slot) === photoSlot);
    for (const fieldName of normalizeTargets(target)) {
      await assignMappedImage(form, pdf, fieldName, photo?.storagePath ?? "", bucket);
    }
  }

  for (const fieldName of normalizeTargets(template.signatureField)) {
    await assignMappedImage(form, pdf, fieldName, report.signature.storagePath ?? "", bucket);
  }
};

const getSchemaFieldValue = (
  report: ReportData,
  field: TemplateFieldSchema,
  assetOverrides?: AssetOverrides
): unknown => {
  if (field.source === "signature") {
    return report.signature.storagePath ?? "";
  }

  if (field.source === "insurer_logo") {
    return assetOverrides?.[field.id] ?? "";
  }

  if (field.source === "image") {
    if (assetOverrides?.[field.id]) {
      return assetOverrides[field.id];
    }
    const explicit = report.templateAssetPaths?.[field.id] ?? "";
    if (explicit) {
      return explicit;
    }

    const preferredSlot = Number(field.defaultValue || field.id.match(/\d+/)?.[0] || "");
    if (!Number.isNaN(preferredSlot) && preferredSlot > 0) {
      return report.photos.find((photo) => photo.slot === preferredSlot)?.storagePath ?? "";
    }

    return "";
  }

  return report.templateFields[field.id] ?? field.defaultValue ?? "";
};

const applySchemaFieldMappings = async (
  form: ReturnType<PDFDocument["getForm"]>,
  pdf: PDFDocument,
  report: ReportData,
  schema: TemplateFieldSchema[],
  bucket?: Bucket,
  assetOverrides?: AssetOverrides
) => {
  for (const fieldSchema of schema) {
    if (fieldSchema.type === "image" || fieldSchema.type === "signature" || fieldSchema.source === "insurer_logo") {
      await assignMappedImage(form, pdf, fieldSchema.id, toText(getSchemaFieldValue(report, fieldSchema, assetOverrides)), bucket);
      continue;
    }

    const field = getFieldOrThrow(form, fieldSchema.id);
    assignMappedValue(field, getSchemaFieldValue(report, fieldSchema, assetOverrides));
  }
};

const fieldRectToPdf = (page: PDFPage, rect: TemplateFieldSchema["rect"]) => {
  const { width, height } = page.getSize();
  return {
    x: rect.x * width,
    y: height - ((rect.y + rect.height) * height),
    width: rect.width * width,
    height: rect.height * height
  };
};

const addFieldToPage = (pdf: PDFDocument, page: PDFPage, field: TemplateFieldSchema) => {
  const form = pdf.getForm();
  const rect = fieldRectToPdf(page, field.rect);
  const baseAppearance = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    borderWidth: 1,
    borderColor: rgb(0.13, 0.33, 0.55),
    backgroundColor: rgb(1, 1, 1)
  };

  switch (field.type) {
    case "text": {
      const textField = form.createTextField(field.id);
      textField.addToPage(page, baseAppearance);
      return;
    }
    case "textarea": {
      const textField = form.createTextField(field.id);
      textField.enableMultiline();
      textField.addToPage(page, baseAppearance);
      return;
    }
    case "checkbox": {
      const checkBox = form.createCheckBox(field.id);
      checkBox.addToPage(page, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        borderWidth: 1,
        borderColor: rgb(0.13, 0.33, 0.55)
      });
      return;
    }
    case "dropdown": {
      const dropdown = form.createDropdown(field.id);
      dropdown.addOptions(field.options);
      dropdown.addToPage(page, baseAppearance);
      return;
    }
    case "image":
    case "signature": {
      const button = form.createButton(field.id);
      button.addToPage(field.label || field.id, page, baseAppearance);
    }
  }
};

const validateSchemaFields = (pdf: PDFDocument, schema: TemplateFieldSchema[]) => {
  const actual = new Set(pdf.getForm().getFields().map((field) => field.getName()));
  for (const field of schema) {
    if (!actual.has(field.id)) {
      throw new Error(`MAPPED_FIELD_NOT_FOUND:${field.id}`);
    }
  }
};

export const createEditablePdfFromSchema = async (
  basePdf: Uint8Array,
  schema: TemplateFieldSchema[]
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(basePdf, { ignoreEncryption: true });
  const pages = pdf.getPages();

  for (const field of schema) {
    const page = pages[field.page];
    if (!page) {
      throw new Error(`INVALID_FIELD_PAGE:${field.id}`);
    }

    addFieldToPage(pdf, page, field);
  }

  validateSchemaFields(pdf, schema);
  return pdf.save();
};

export const fillReportPdfTemplate = async (
  templatePdf: Uint8Array,
  report: ReportData,
  template: TemplateConfig,
  bucket?: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(templatePdf, { ignoreEncryption: true });
  const form = pdf.getForm();

  applyFixedFieldMappings(form, report, template);
  await applyFixedImageMappings(form, pdf, report, template, bucket);

  if (options.flatten) {
    form.flatten();
  }

  return pdf.save();
};

export const fillReportPdfFromSchema = async (
  editablePdf: Uint8Array,
  report: ReportData,
  schema: TemplateFieldSchema[],
  bucket?: Bucket,
  options: RenderOptions = {},
  assetOverrides?: AssetOverrides
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(editablePdf, { ignoreEncryption: true });
  const form = pdf.getForm();

  await applySchemaFieldMappings(form, pdf, report, schema, bucket, assetOverrides);

  if (options.flatten) {
    form.flatten();
  }

  return pdf.save();
};

export const renderReportPdf = async (
  report: ReportData,
  template: TemplateConfig,
  bucket?: Bucket,
  options: RenderOptions = {}
): Promise<Uint8Array> => {
  if (!bucket) {
    throw new Error("STORAGE_BUCKET_NOT_CONFIGURED");
  }

  const templateBytes = await loadBinaryFromBucket(bucket, template.pdfTemplatePath);
  if (!templateBytes) {
    throw new Error(`TEMPLATE_PDF_NOT_FOUND:${template.pdfTemplatePath}`);
  }

  return fillReportPdfTemplate(templateBytes, report, template, bucket, options);
};

export const renderSchemaBasedPdf = async (
  report: ReportData,
  templateVersion: SchemaTemplateInput,
  bucket?: Bucket,
  options: RenderOptions = {},
  assetOverrides?: AssetOverrides
): Promise<Uint8Array> => {
  if (!bucket) {
    throw new Error("STORAGE_BUCKET_NOT_CONFIGURED");
  }

  const templateBytes = await loadBinaryFromBucket(bucket, templateVersion.editablePdfPath);
  if (!templateBytes) {
    throw new Error(`TEMPLATE_PDF_NOT_FOUND:${templateVersion.editablePdfPath}`);
  }

  return fillReportPdfFromSchema(templateBytes, report, templateVersion.fieldSchema, bucket, options, assetOverrides);
};

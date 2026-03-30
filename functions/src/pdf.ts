import type { Bucket } from "@google-cloud/storage";
import { PDFDocument, PDFImage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { ReportData, TemplateConfig } from "./types";

const flagLabels: Record<string, string> = {
  feuchteschaden: "Feuchteschaden",
  druckabfall: "Druckabfall",
  wasserverlust: "Wasserverlust",
  wasseraustritt: "Wasseraustritt",
  schimmel: "Schimmel",
  eigentumer: "Eigentümer",
  mieter: "Mieter",
  installateur: "Installateur",
  hausmeister: "Hausmeister",
  hv: "HV",
  versicherung: "Versicherung",
  regulierer: "Regulierereinsatz zu empfehlen",
  technischeTrocknung: "Techn. Trocknung",
  fussbodenheizung: "Fußbodenheizung",
  reparaturInstallateur: "Reparatur durch Installateur",
  folgegewerke: "Folgegewerke erforderlich",
  ersatzfliesen: "Ersatzfliesen vorhanden",
  rueckbau: "Rückbau erforderlich",
  schimmelbeseitigung: "Schimmelbeseitigung erforderlich",
  inlinereinzugPruefen: "Inlinereinzug prüfen",
  demontage: "Demontage erforderlich",
  folgetermin: "Folgetermin erforderlich",
  infoAquaRadar: "Info an Aqua-Radar"
};

const toPdfText = (value: string, probeFont: PDFFont): string => {
  const safe = Array.from(value ?? "")
    .map((char) => {
      try {
        probeFont.encodeText(char);
        return char;
      } catch {
        return "";
      }
    })
    .join("");

  return safe;
};

const parseHexColor = (hexColor: string) => {
  const normalized = hexColor.replace("#", "");
  const value = normalized.length === 6 ? normalized : "0c2a4d";

  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255
  };
};

const formatFlags = (flags: Record<string, boolean>): string => {
  const active = Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => flagLabels[key] ?? key);

  return active.length > 0 ? active.join(", ") : "-";
};

const drawHeader = (
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  template: TemplateConfig,
  projectNumber: string
) => {
  const color = parseHexColor(template.pdfStyle.primaryColor);

  page.drawRectangle({
    x: 0,
    y: 792,
    width: 595,
    height: 50,
    color: rgb(color.r, color.g, color.b)
  });

  page.drawText(toPdfText(`${template.name} Einsatzbericht`, font), {
    x: 32,
    y: 810,
    size: 16,
    color: rgb(1, 1, 1)
  });

  page.drawText(toPdfText(`Projekt: ${projectNumber || "-"}`, font), {
    x: 400,
    y: 810,
    size: 11,
    color: rgb(1, 1, 1)
  });
};

const drawFooter = (page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, footerText: string) => {
  page.drawLine({
    start: { x: 30, y: 40 },
    end: { x: 565, y: 40 },
    thickness: 1,
    color: rgb(0.83, 0.88, 0.93)
  });

  page.drawText(toPdfText(footerText, font), {
    x: 30,
    y: 26,
    size: 8,
    color: rgb(0.28, 0.33, 0.41)
  });
};

const loadImageFromBucket = async (bucket: Bucket | undefined, path: string) => {
  if (!bucket || !path) {
    return null;
  }

  try {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [imageBytes] = await file.download();
    return imageBytes;
  } catch {
    return null;
  }
};

const embedImage = async (
  pdf: PDFDocument,
  path: string,
  bytes: Uint8Array
): Promise<PDFImage | undefined> => {
  const lowerPath = path.toLowerCase();

  try {
    if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
      return await pdf.embedJpg(bytes);
    }
    return await pdf.embedPng(bytes);
  } catch {
    return undefined;
  }
};

export const renderReportPdf = async (
  report: ReportData,
  template: TemplateConfig,
  bucket?: Bucket
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadImageFromBucket(bucket, template.logoPath);
  const logoImage = logoBytes ? await embedImage(pdf, template.logoPath, logoBytes) : undefined;

  let page = pdf.addPage([595, 842]);
  let y = 770;

  const drawPageFrame = () => {
    drawHeader(page, bold, template, report.projectInfo.projectNumber);
    if (logoImage) {
      page.drawImage(logoImage, {
        x: 470,
        y: 798,
        width: 90,
        height: 32
      });
    }
  };

  drawPageFrame();

  const ensureSpace = (requiredHeight = 18) => {
    if (y - requiredHeight < 70) {
      drawFooter(page, font, template.footerText);
      page = pdf.addPage([595, 842]);
      drawPageFrame();
      y = 770;
    }
  };

  const line = (label: string, value: string) => {
    const safeLabel = toPdfText(`${label}:`, bold) || "-";
    const safeValue = toPdfText(value || "-", font) || "-";
    ensureSpace();
    page.drawText(safeLabel, {
      x: 30,
      y,
      size: 10,
      font: bold,
      color: rgb(0.13, 0.19, 0.28)
    });

    page.drawText(safeValue, {
      x: 190,
      y,
      size: 10,
      font,
      color: rgb(0.15, 0.21, 0.31)
    });

    y -= 14;
  };

  const section = (title: string) => {
    const safeTitle = toPdfText(title, bold) || "-";
    ensureSpace(26);
    const titleColor = parseHexColor(template.pdfStyle.titleColor);

    page.drawText(safeTitle, {
      x: 30,
      y,
      size: 12,
      font: bold,
      color: rgb(titleColor.r, titleColor.g, titleColor.b)
    });

    y -= 18;
  };

  section("Projekt und Termin");
  line("Messtermin", report.projectInfo.appointmentDate);
  line("Messtechniker", report.projectInfo.technicianName);
  line("Erstmeldung durch", report.projectInfo.firstReportBy);
  line("Messort / Objekt", report.projectInfo.locationObject);

  section("Kontakte");
  line("Name 1", report.contacts.name1);
  line("Name 2", report.contacts.name2);
  line("Straße 1", report.contacts.street1);
  line("Straße 2", report.contacts.street2);
  line("Ort 1", report.contacts.city1);
  line("Ort 2", report.contacts.city2);
  line("Telefon", [report.contacts.phone1, report.contacts.phone2].filter(Boolean).join(" / "));
  line("Mobil", [report.contacts.mobile1, report.contacts.mobile2].filter(Boolean).join(" / "));
  line("E-Mail", report.contacts.email);

  section("Schadensbild und Anwesende");
  line("Schadensbild", formatFlags(report.damageChecklist.flags));
  line("Notizen", report.damageChecklist.notes);
  line("Anwesende", formatFlags(report.attendees.flags));
  line("Weitere Anwesende", report.attendees.notes);

  section("Ergebnis und Weiteres Vorgehen");
  line(
    "Ergebnis Flags",
    [
      report.findings.causeFound ? "Ursache gefunden" : "",
      report.findings.causeExposed ? "Ursache freigelegt" : "",
      report.findings.temporarySeal ? "Notabdichtung" : ""
    ]
      .filter(Boolean)
      .join(", ")
  );
  line("Ergebnistext", report.findings.summary);
  line("Abgesprochen mit", report.actions.agreedWith);
  line("Abzustimmen mit", report.actions.coordinateWith);
  line("Maßnahmen", formatFlags(report.actions.flags));
  line("Demontage", report.actions.demontageDetails);
  line("Sonstiges", report.actions.notes);

  section("Technik und Bilddokumentation");
  line("Verfahren", report.techniques.join(", "));
  report.photos
    .sort((left, right) => left.slot - right.slot)
    .forEach((photo) => {
      line(`Bild ${photo.slot}`, `${photo.location} | ${photo.documentation}`);
    });

  section("Abrechnung und Signatur");
  line("Arbeitszeit", `${report.billing.from} - ${report.billing.to} (${report.billing.workingTimeHours}h)`);
  line("Signatur Name", report.signature.technicianName);
  line("Signiert am", report.signature.signedAt);

  const signatureBytes = await loadImageFromBucket(bucket, report.signature.storagePath ?? "");
  if (signatureBytes) {
    ensureSpace(90);
    const signatureImage = await embedImage(pdf, report.signature.storagePath ?? "", signatureBytes);
    if (signatureImage) {
    page.drawText(toPdfText("Techniker-Signatur", bold), {
      x: 30,
      y,
      size: 10,
        font: bold,
        color: rgb(0.13, 0.19, 0.28)
      });

      y -= 10;
      page.drawImage(signatureImage, {
        x: 30,
        y: y - 70,
        width: 220,
        height: 70
      });
      y -= 84;
    }
  }

  drawFooter(page, font, template.footerText);
  return pdf.save();
};

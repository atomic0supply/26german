import { TemplateConfig } from "./types";

export const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
  svt: {
    id: "svt",
    name: "SVT",
    logoPath: "templates/svt/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#0c2a4d", titleColor: "#12395f" }
  },
  brasa: {
    id: "brasa",
    name: "Brasa",
    logoPath: "templates/brasa/logo.jpg",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#1e3a5f", titleColor: "#1d4f7d" }
  },
  angerhausen: {
    id: "angerhausen",
    name: "Angerhausen",
    logoPath: "templates/angerhausen/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#254763", titleColor: "#1b5a87" }
  },
  "aqua-braun": {
    id: "aqua-braun",
    name: "Aqua-Braun",
    logoPath: "templates/aqua-braun/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#0f3d59", titleColor: "#005f8f" }
  }
};

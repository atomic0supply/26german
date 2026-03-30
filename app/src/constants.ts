import { ActionKey, AttendeeKey, DamageKey, TemplateConfig } from "./types";

export const DAMAGE_OPTIONS: { key: DamageKey; label: string }[] = [
  { key: "feuchteschaden", label: "Feuchteschaden" },
  { key: "druckabfall", label: "Druckabfall" },
  { key: "wasserverlust", label: "Wasserverlust" },
  { key: "wasseraustritt", label: "Wasseraustritt" },
  { key: "schimmel", label: "Schimmel" }
];

export const ATTENDEE_OPTIONS: { key: AttendeeKey; label: string }[] = [
  { key: "eigentumer", label: "Eigentümer" },
  { key: "mieter", label: "Mieter" },
  { key: "installateur", label: "Installateur" },
  { key: "hausmeister", label: "Hausmeister" },
  { key: "hv", label: "HV" },
  { key: "versicherung", label: "Versicherung" }
];

export const ACTION_OPTIONS: { key: ActionKey; label: string }[] = [
  { key: "regulierer", label: "Regulierereinsatz zu empfehlen" },
  { key: "technischeTrocknung", label: "Techn. Trocknung" },
  { key: "fussbodenheizung", label: "Fußbodenheizung" },
  { key: "reparaturInstallateur", label: "Reparatur durch Installateur" },
  { key: "folgegewerke", label: "Folgegewerke erforderlich" },
  { key: "ersatzfliesen", label: "Ersatzfliesen vorhanden" },
  { key: "rueckbau", label: "Rückbau erforderlich" },
  { key: "schimmelbeseitigung", label: "Schimmelbeseitigung erforderlich" },
  { key: "inlinereinzugPruefen", label: "Inlinereinzug ist zu prüfen" },
  { key: "demontage", label: "Demontage erforderlich" },
  { key: "folgetermin", label: "Folgetermin erforderlich" },
  { key: "infoAquaRadar", label: "Info an Aqua-Radar" }
];

export const TECHNIQUE_OPTIONS: string[] = [
  "Sichtprüfung",
  "Feuchtemessung",
  "Druckprobe",
  "Thermografie",
  "Elektroakustik",
  "Leitungsortung",
  "Tracergas",
  "Rohrkamera",
  "Endoskopie",
  "Färbemittel",
  "Spülung",
  "Leitfähigkeit"
];

export const PHOTO_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const TEMPLATE_OPTIONS: TemplateConfig[] = [
  {
    id: "svt",
    name: "SVT",
    logoPath: "templates/svt/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#0c2a4d", titleColor: "#12395f" }
  },
  {
    id: "brasa",
    name: "Brasa",
    logoPath: "templates/brasa/logo.jpg",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#1e3a5f", titleColor: "#1d4f7d" }
  },
  {
    id: "angerhausen",
    name: "Angerhausen",
    logoPath: "templates/angerhausen/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#254763", titleColor: "#1b5a87" }
  },
  {
    id: "aqua-braun",
    name: "Aqua-Braun",
    logoPath: "templates/aqua-braun/logo.png",
    footerText: "INH. K. Drozyn, Adlerstrasse 61, 66955 Pirmasens",
    headerFields: ["Projektnummer", "Messtermin", "Messtechniker"],
    pdfStyle: { primaryColor: "#0f3d59", titleColor: "#005f8f" }
  }
];

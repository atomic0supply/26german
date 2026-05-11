import { CompanyConfig, CompanyId, TemplateConfig, TemplateFieldMap } from "./types";

// ---------------------------------------------------------------------------
// Mapa de campos AcroForm → datos del informe
// Nota: algunos nombres de campo tienen espacios finales (tal como están en el PDF)
// ---------------------------------------------------------------------------
const FIELD_MAP: TemplateFieldMap = {
  // Cabecera
  "projectInfo.projectNumber":     "Projektnummer",
  "projectInfo.appointmentDate":   "messtermin",
  "projectInfo.technicianName":    "Messtechniker",
  "projectInfo.locationObject":    "MessortObjekt_name",
  // NOTA: "Auftragserteilung" NO existe en template-prok15.pdf → se añade solo en FIELD_MAP_ALL

  // Kunde (lado izquierdo del PDF) = Partner / Firma colaboradora
  // ⚠️ kunde* ya NO contiene los datos del cliente final; corresponde al Partner seleccionado en el informe.
  "partner.name":          "kunde",
  "partner.contactPerson": "kunde_name",
  "partner.street":        "kunde_strabe",
  "partner.city":          "kunde_ort",
  "partner.phone":         "kunde_telefon",
  "partner.mobile":        "kunde_mobil",
  "partner.email":         "kunde_email",

  // MessortObjekt (lado derecho del PDF) = Cliente final / lugar de medición
  // Mapeamos los campos del cliente seleccionado (name1/street1/city1/phone1/mobile1).
  "contacts.name1":   "MessortObjekt_name",
  "contacts.street1": "MessortObjekt_strabe",
  "contacts.city1":   "MessortObjekt_ort",
  "contacts.phone1":  "MessortObjekt_telefon",
  "contacts.mobile1": "MessortObjekt_mobil",
  "actions.coordinateWith": "MessortObjekt_siehekunde",

  // Schadensbild
  "damageChecklist.flags.feuchteschaden": "Schadensbild_Feuchteschaden",
  "damageChecklist.flags.druckabfall":    "Schadensbild_Druckabfall",
  "damageChecklist.flags.wasserverlust":  "schadensbild_wasserverlust",
  "damageChecklist.flags.wasseraustritt": "Schadensbild_Wasseraustritt",
  // Nota: el PDF prok15/all15 no incluye un checkbox propio para Schimmel.
  // El dato se conserva en damageChecklist.notes (texto libre) y, si se quiere,
  // se puede mencionar en el Einsatzbericht. NO mapear aquí para no sobreescribir
  // accidentalmente "Schadensbild_Wasseraustritt".

  // Anwesende
  "attendees.flags.eigentumer":   "Anwesende_Eigentümer",
  "attendees.flags.mieter":       "Anwesende_mieter",
  "attendees.flags.installateur": "Anwesende_installateur",
  "attendees.flags.hausmeister":  "Anwesende_hausmeister",
  "attendees.flags.hv":           "Anwesende_HV",
  "attendees.flags.versicherung": "Anwesende_versicherung",

  // Ergebnis der Überprüfung
  "findings.causeFound":      "Ergebnis_ja",
  "findings.causeExposed":    "Ergebnis_ursache_freigelegt",
  "findings.temporarySeal":   "Ergebnis_Notabdichtung",
  "findings.ursacheGefunden": "Ergebnis_ursache_gefunden",

  // Weiteres (acciones)
  "actions.flags.technischeTrocknung":  "Weiteres_Techn_Trocknung",
  "actions.flags.fussbodenheizung":     "Weiteres_Fußbodenheizung",
  "actions.flags.reparaturInstallateur":"Weiteres_Reparatur_durch_Installateur",
  "actions.flags.folgegewerke":         "Weiteres_Folgegewerke_erforderlich",
  "actions.flags.ersatzfliesen":        "Weiteres_Ersatzfliesen_vorhanden",
  "actions.flags.rueckbau":             "Weiteres_Rückbau_erforderlich",
  "actions.flags.schimmelbeseitigung":  "Weiteres_Schimmelbeseitigung_erforderlich",
  "actions.flags.demontage":            "Weiteres_Demontage_erforderlich",
  "actions.flags.folgetermin":          "Weiteres_Folgetermin_erforderlich",
  "actions.flags.hinweiseUndAbsprache": "Weiteres_Hinweise_und_Absprache",
  "actions.flags.infoAnAquaRadar":      "Weiteres_Info_an_Aqua-Radar",
  "actions.flags.sonstigesCheckbox":    "Weiteres_Sonstiges_checkbox",
  "actions.flags.abzustimmen":          "Weiteres_Abzustimmen_mit_checkbox",

  // Texto libre
  "findings.summary": "Einsatzbericht_text",
};

// ---------------------------------------------------------------------------
// Plantillas AcroForm (selección dinámica según Auftragserteilung)
// ---------------------------------------------------------------------------
const FIELD_MAP_ALL: TemplateFieldMap = {
  ...FIELD_MAP,
  // Este campo solo existe en template-all15.pdf (no en prok15)
  "projectInfo.auftragserteilung": "Auftragserteilung",
};

const OPTIONAL_FIELD_MAP: TemplateFieldMap = {
  "templateFields.sonstiges":      "Weiteres_Sonstiges_text",
  "templateFields.abzustimmenText": "Weiteres_Abzustimmen_mit_text",
  "billing.from":                "Abrechnung_Arbeitszeit_von",
  "billing.to":                  "Abrechnung_Arbeitszeit_bis",
  "billing.workDate":            "Abrechnung_Arbeitszeit_1_date",
  // Segundo técnico (opcional): los campos AcroForm Abrechnung_Arbeitszeit_2_*
  // los crea programáticamente `ensureExtraArbeitszeitRow` antes del relleno.
  "billing.from2":               "Abrechnung_Arbeitszeit_2_von",
  "billing.to2":                 "Abrechnung_Arbeitszeit_2_bis",
  "billing.workDate2":           "Abrechnung_Arbeitszeit_2_date"
};

export const REPORT_TEMPLATE_PROK: TemplateConfig = {
  id: "svt",
  name: "Plantilla AcroForm",
  pdfTemplatePath: "template/template-prok15.pdf",
  fieldMap: FIELD_MAP,
  optionalFieldMap: OPTIONAL_FIELD_MAP,
  signatureField: "",
  requiredTemplateFields: [
    "projectInfo.projectNumber",
    "projectInfo.technicianName"
  ]
};

export const REPORT_TEMPLATE_ALL: TemplateConfig = {
  id: "svt",
  name: "Plantilla AcroForm (Auftragserteilung)",
  pdfTemplatePath: "template/template-all15.pdf",
  fieldMap: FIELD_MAP_ALL,
  optionalFieldMap: OPTIONAL_FIELD_MAP,
  signatureField: "",
  requiredTemplateFields: [
    "projectInfo.projectNumber",
    "projectInfo.technicianName"
  ]
};

export const REPORT_TEMPLATE = REPORT_TEMPLATE_PROK;

// ---------------------------------------------------------------------------
// Empresas y logos
// ---------------------------------------------------------------------------
export const COMPANIES: Record<CompanyId, CompanyConfig> = {
  svt: {
    id: "svt",
    name: "SVT",
    logoStoragePath: "logo/logo_svt.png"
  },
  brasa: {
    id: "brasa",
    name: "Brasa",
    logoStoragePath: "logo/brasa_logo.jpg"
  },
  angerhausen: {
    id: "angerhausen",
    name: "Angerhausen",
    logoStoragePath: "logo/logo_angerhausen.png"
  },
  aquaradar: {
    id: "aquaradar",
    name: "AquaRADAR",
    logoStoragePath: "logo/logo_aquaradar.jpg"
  },
  herrmann: {
    id: "herrmann",
    name: "Hermann SBR",
    logoStoragePath: "logo/logo_herrmann.png"
  },
  homekoncept: {
    id: "homekoncept",
    name: "HOMEKONZEPT",
    logoStoragePath: "logo/logo_homekoncept.png"
  },
  wasat: {
    id: "wasat",
    name: "Wasa-T",
    logoStoragePath: "logo/Ilogo_wasatec.png"
  }
};

export const getCompany = (id: CompanyId | undefined): CompanyConfig | undefined =>
  id ? COMPANIES[id] : undefined;

// ---------------------------------------------------------------------------
// Plantilla LECKORTUNG (detección de fugas)
// Campos AcroForm reales del PDF template-LECKORTUNG.pdf
// ---------------------------------------------------------------------------

// Texto fijo del bloque "Wichtiger Hinweis AUFTRAG" del PDF LECKORTUNG.
// SIEMPRE se imprime este texto, no es editable por el técnico.
export const LECKORTUNG_HINWEIS_TEXT =
`Wichtiger Hinweis AUFTRAG
Unsere Prüfungen / Arbeiten sind Dienstleistungen und werden ausdrücklich nur
im Rahmen eines Dienstleistungsvertrages ausgeführt.
Es gelten unsere AGB. Abweichungen hiervon müssen gegenseitig schriftlich vereinbart werden.

Die Preisvereinbarung bei Auftragserteilung bezieht sich auf unsere aktuelle Dienstleistungspreisliste.
Abweichungen von der gültigen Preisliste sind nur nach schriftlicher Vereinbarung gültig.
Die Rechnung kann bei Vereinbarung vom Auftragnehmer per Email übergeben werden.`;

const FIELD_MAP_LECKORTUNG: TemplateFieldMap = {
  "templateFields.auftragnehmer": "text_1dvn",                   // Auftragnehmer
  "projectInfo.locationObject":   "text_3clwz",                  // Schadenort
  "contacts.name1":               ["text_4mvzb", "text_11epzm"], // Name + Kunde
  "templateFields.leistung":      "text_6xbjk",                  // Leistung
  "templateFields.hinweis":       "text_7yyii",                  // Hinweis / Haftung
  "templateFields.ortDatum":      "text_9wuas",                  // Ort/Datum
};

export const REPORT_TEMPLATE_LECKORTUNG: TemplateConfig = {
  id: "leckortung",
  name: "Leckortung",
  pdfTemplatePath: "template/template-LECKORTUNG.pdf",
  fieldMap: FIELD_MAP_LECKORTUNG,
  signatureField: "signature_10ubdv",
  requiredTemplateFields: [
    "projectInfo.locationObject",
    "contacts.name1"
  ]
};

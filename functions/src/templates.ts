import { CompanyConfig, CompanyId, TemplateConfig, TemplateFieldMap } from "./types";

// ---------------------------------------------------------------------------
// Mapa de campos AcroForm → datos del informe
// Nota: algunos nombres de campo tienen espacios finales (tal como están en el PDF)
// ---------------------------------------------------------------------------
const FIELD_MAP: TemplateFieldMap = {
  // Cabecera repetida en todas las páginas
  "projectInfo.projectNumber": "Projektnummer",
  "projectInfo.appointmentDate": "Messtermin",
  "projectInfo.technicianName":  "Messtechniker",
  "projectInfo.locationObject":  "Messort  / Objekt: ",

  // Contacto cliente (Kunde) — lado izquierdo página 1
  "contacts.name1":   ["Kunde", "kunde_name"],
  "contacts.street1": "kunde_Strabe",
  "contacts.city1":   "kunde_ort",
  "contacts.phone1":  "kunde_telef",
  "contacts.mobile1": "kunde_mobil",
  "contacts.email":   "kunde_email",

  // Contacto Messort — lado derecho página 1
  "contacts.name2":   "messort_name",
  "contacts.street2": "messort_strabe",
  "contacts.city2":   "messort_ort",
  "contacts.phone2":  "messort_telefo",
  "contacts.mobile2": "messort_mobil",
  "actions.coordinateWith": "messort_shehekunde",

  // Checkboxes de daño (página 1)
  "damageChecklist.flags.feuchteschaden": "Feuchteschaden  ",
  "damageChecklist.flags.druckabfall":    "Druckabfall",
  "damageChecklist.flags.wasserverlust":  "Wasserverlust",
  "damageChecklist.flags.wasseraustritt": "Wasseraustritt",
  "damageChecklist.flags.schimmel":       "Schimmel",

  // Checkboxes de asistentes (página 1)
  "attendees.flags.eigentumer":   "Eigentümer ",
  "attendees.flags.mieter":       "Mieter",
  "attendees.flags.installateur": "Installateur",
  "attendees.flags.hausmeister":  "Hausmeister",
  "attendees.flags.hv":           "HV",
  "attendees.flags.versicherung": "Versicherung",

  // Checkboxes de hallazgos (página 1)
  "findings.causeFound":    "Ursache_gefunden",
  "findings.causeExposed":  "Ursache_freigelegt",
  "findings.temporarySeal": "Notabdichtung",

  // Checkboxes de acciones (página 1) — nombres exactos del PDF
  "actions.flags.technischeTrocknung":  "Techntrocknung",
  "actions.flags.fussbodenheizung":     "Fubodenheizung",
  "actions.flags.reparaturInstallateur":"ReparaturdurchInstallateur",
  "actions.flags.folgegewerke":         "Folgegewerkeerforderlich",
  "actions.flags.ersatzfliesen":        "Ersatzfliesenvorhanden  ",
  "actions.flags.rueckbau":             "Rückbauerforderlich",
  "actions.flags.schimmelbeseitigung":  "Schimmelbeseitigungerforderlich",
  "actions.flags.demontage":            "Demontageerforderlich",
  "actions.flags.folgetermin":          "Folgeterminerforderlich  ",

  // Áreas de texto (página 2)
  "findings.summary":       "Einsatzbericht",
  "actions.agreedWith":     "Schadengefunden ",
  "damageChecklist.notes":  "Schadengefunden_text",

};

// ---------------------------------------------------------------------------
// Plantillas AcroForm (selección dinámica según Auftragserteilung)
// ---------------------------------------------------------------------------
const FIELD_MAP_ALL: TemplateFieldMap = {
  ...FIELD_MAP,
  "projectInfo.auftragserteilung": "Auftragserteilung"
};

export const REPORT_TEMPLATE_PROK: TemplateConfig = {
  id: "svt",
  name: "Plantilla AcroForm",
  pdfTemplatePath: "template/template-prok15.pdf",
  fieldMap: FIELD_MAP,
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

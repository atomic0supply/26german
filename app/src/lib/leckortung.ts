import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { functions, storage } from "../firebase";
import { Language } from "../i18n";

export const SERVICE_SUGGESTIONS = [
  "Leckortung Trinkwasserinstallation",
  "Leckortung Heizungsinstallation",
  "Leckortung Fußbodenheizung",
  "Feuchtigkeitsmessung / Schadensaufnahme",
];

export interface LeckortungPrefillBase {
  locationObject: string;
  appointmentDate: string;
  technicianName: string;
  clientName: string;
  clientAddress: string;
  clientCity: string;
}

export const extractCity = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.split(",").map((p) => p.trim()).filter(Boolean).at(-1) ?? trimmed;
};

export const buildOrtDatum = (prefill: LeckortungPrefillBase, language: Language): string => {
  const city = extractCity(prefill.clientCity) || extractCity(prefill.clientAddress) || extractCity(prefill.locationObject);
  const date = prefill.appointmentDate
    ? new Date(prefill.appointmentDate).toLocaleDateString(language === "de" ? "de-DE" : "es-ES")
    : "";
  return city && date ? `${city}, ${date}` : city || date;
};

export interface LeckortungFields {
  auftragnehmer: string;
  locationObject: string;
  name1: string;
  leistung: string;
  hinweis: string;
  ortDatum: string;
}

/**
 * Uploads the customer signature to Storage and calls `finalizeReport` with the
 * Leckortung-specific fields. Shared by the modal and the full-screen sign-off page.
 */
export const submitLeckortung = async (
  reportId: string,
  fields: LeckortungFields,
  signatureDataUrl: string
): Promise<{ pdfUrl: string }> => {
  let customerSignaturePath = "";
  if (signatureDataUrl) {
    const blob = await (await fetch(signatureDataUrl)).blob();
    const sigRef = ref(storage, `leckortung-signatures/${reportId}/customer.png`);
    await uploadBytes(sigRef, blob, { contentType: "image/png" });
    customerSignaturePath = sigRef.fullPath;
  }

  const callable = httpsCallable<
    { reportId: string; leckortungFields: Record<string, string> },
    { pdfUrl: string }
  >(functions, "finalizeReport");

  const result = await callable({
    reportId,
    leckortungFields: { ...fields, customerSignaturePath },
  });
  return result.data;
};

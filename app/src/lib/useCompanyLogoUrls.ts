import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../firebase";
import { COMPANY_OPTIONS } from "../constants";
import { CompanyId } from "../types";

/**
 * Precarga las URLs públicas de los logos de cada empresa registrada en
 * COMPANY_OPTIONS y las cachea en memoria del componente.
 *
 * - Devuelve un mapa `{ [companyId]: string | undefined }` listo para usar
 *   directamente como `src` en un `<img>`.
 * - Si un logo falla (storage rules, archivo ausente), su entrada queda
 *   en `undefined` y el componente que lo use debe mostrar un fallback.
 * - Se ejecuta solo una vez por montaje; ideal para vistas largas como el
 *   editor donde el técnico ve varias veces las cards.
 */
export const useCompanyLogoUrls = (): Partial<Record<CompanyId, string>> => {
  const [urls, setUrls] = useState<Partial<Record<CompanyId, string>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        COMPANY_OPTIONS.map(async (company) => {
          try {
            const url = await getDownloadURL(ref(storage, company.logoStoragePath));
            return [company.id, url] as const;
          } catch {
            return [company.id, undefined] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Partial<Record<CompanyId, string>> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return urls;
};

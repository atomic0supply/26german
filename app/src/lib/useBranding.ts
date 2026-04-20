import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export interface BrandingConfig {
  companyName: string;
  logoUrl: string;
}

const DEFAULT_BRANDING: BrandingConfig = {
  companyName: "LeakOps CRM",
  logoUrl: ""
};

export const useBranding = (): BrandingConfig => {
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "config", "branding"),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setBranding({
          companyName: String(d.companyName || DEFAULT_BRANDING.companyName),
          logoUrl: String(d.logoUrl || "")
        });
      },
      () => { /* ignore errors — use default */ }
    );
    return unsubscribe;
  }, []);

  // Sync document title
  useEffect(() => {
    document.title = branding.companyName;
  }, [branding.companyName]);

  // Sync favicon
  useEffect(() => {
    if (!branding.logoUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.logoUrl;
  }, [branding.logoUrl]);

  return branding;
};

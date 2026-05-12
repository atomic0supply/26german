import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { BrandingConfig } from "../types";

const DEFAULT_PRIMARY_COLOR = "#135f96";
const DEFAULT_PRIMARY_STRONG = "#0c456d";

const normalizeHexColor = (value: string | undefined, fallback: string) => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return fallback;
};

const hexToRgb = (value: string) => {
  const normalized = normalizeHexColor(value, DEFAULT_PRIMARY_COLOR);
  const hex = normalized.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ] as const;
};

const darkenHexColor = (value: string, factor = 0.24) => {
  const [red, green, blue] = hexToRgb(value);
  const adjust = (channel: number) => Math.max(0, Math.round(channel * (1 - factor)));
  return `#${[adjust(red), adjust(green), adjust(blue)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const DEFAULT_BRANDING: BrandingConfig = {
  companyName: "LeakOps CRM",
  logoUrl: "",
  primaryColor: DEFAULT_PRIMARY_COLOR,
  faviconUrl: ""
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
          logoUrl: String(d.logoUrl || ""),
          primaryColor: normalizeHexColor(typeof d.primaryColor === "string" ? d.primaryColor : undefined, DEFAULT_PRIMARY_COLOR),
          faviconUrl: String(d.faviconUrl || "")
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

  // Sync CSS theme variables
  useEffect(() => {
    const primaryColor = normalizeHexColor(branding.primaryColor, DEFAULT_PRIMARY_COLOR);
    const [red, green, blue] = hexToRgb(primaryColor);
    document.documentElement.style.setProperty("--primary", primaryColor);
    document.documentElement.style.setProperty("--primary-strong", darkenHexColor(primaryColor));
    document.documentElement.style.setProperty("--primary-rgb", `${red}, ${green}, ${blue}`);
  }, [branding.primaryColor]);

  // Sync favicon + apple-touch-icon from FAVICON-VORSCHAU (fallback to logo)
  useEffect(() => {
    const faviconUrl = branding.faviconUrl || branding.logoUrl;
    if (!faviconUrl) return;

    const guessType = (url: string) => {
      const path = url.split("?")[0].toLowerCase();
      if (path.endsWith(".svg")) return "image/svg+xml";
      if (path.endsWith(".png")) return "image/png";
      if (path.endsWith(".webp")) return "image/webp";
      if (path.endsWith(".ico")) return "image/x-icon";
      if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
      return "";
    };
    const type = guessType(faviconUrl);

    const ensureLink = (rel: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      return link;
    };

    const icon = ensureLink("icon");
    icon.href = faviconUrl;
    if (type) icon.type = type;

    const appleIcon = ensureLink("apple-touch-icon");
    appleIcon.href = faviconUrl;
  }, [branding.faviconUrl, branding.logoUrl]);

  return branding;
};

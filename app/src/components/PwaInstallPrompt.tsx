import { useEffect, useState } from "react";
import { createTranslator, Language } from "../i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaInstallPromptProps {
  language: Language;
}

export const PwaInstallPrompt = ({ language }: PwaInstallPromptProps) => {
  const t = createTranslator(language);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) {
    return null;
  }

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="pwa-install-banner">
      <span>{t("App auf dem Gerät installieren?", "¿Instalar la app en el dispositivo?")}</span>
      <div className="pwa-install-banner__actions">
        <button type="button" onClick={() => void handleInstall()}>
          {t("App installieren", "Instalar app")}
        </button>
        <button type="button" className="ghost" onClick={() => setDismissed(true)}>
          {t("Verwerfen", "Descartar")}
        </button>
      </div>
    </div>
  );
};

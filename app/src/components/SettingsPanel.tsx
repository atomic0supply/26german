import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { firebaseConnectionInfo, functions } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { AiSettingsSummary, GeminiModelOption, UserRole } from "../types";

interface SettingsPanelProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  user: User;
  userRole: UserRole;
  isOnline: boolean;
}

const yesNo = (value: boolean, language: Language): string =>
  translate(language, value ? "Ja" : "Nein", value ? "Sí" : "No");

const notAvailable = (language: Language): string => translate(language, "Nicht verfügbar", "No disponible");

export const SettingsPanel = ({ language, onLanguageChange, user, userRole, isOnline }: SettingsPanelProps) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const canManageAi = userRole === "admin" || userRole === "office";
  const [aiSettings, setAiSettings] = useState<AiSettingsSummary | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<GeminiModelOption[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNotice, setAiNotice] = useState("");

  const providers = user.providerData
    .map((provider) => provider.providerId)
    .filter((providerId) => providerId.length > 0)
    .join(", ");

  const createdAt = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleString(locale)
    : notAvailable(language);

  const lastSignIn = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString(locale)
    : notAvailable(language);

  const hasFirebaseSession = firebaseConnectionInfo.hasRequiredConfig && Boolean(user.uid);

  useEffect(() => {
    if (!canManageAi) {
      return;
    }

    let cancelled = false;
    const loadAiSettings = async () => {
      setLoadingAi(true);
      setAiError("");
      try {
        const callable = httpsCallable<Record<string, never>, AiSettingsSummary>(functions, "getAiSettings");
        const result = await callable({});
        if (!cancelled) {
          setAiSettings(result.data);
          setSelectedModel(result.data.model);
        }
      } catch (error) {
        if (!cancelled) {
          setAiError(error instanceof Error ? error.message : "KI-Einstellungen konnten nicht geladen werden");
        }
      } finally {
        if (!cancelled) {
          setLoadingAi(false);
        }
      }
    };

    void loadAiSettings();
    return () => {
      cancelled = true;
    };
  }, [canManageAi]);

  const discoverModels = async () => {
    setDiscoveringModels(true);
    setAiError("");
    setAiNotice("");
    try {
      const callable = httpsCallable<{ apiKey?: string }, { models: GeminiModelOption[]; selectedModel: string }>(functions, "listGeminiModels");
      const result = await callable({ apiKey: apiKeyInput.trim() || undefined });
      setAvailableModels(result.data.models);
      setSelectedModel((current) => current || result.data.selectedModel);
      setAiNotice(
        t(
          `${result.data.models.length} Gemini-Modelle gefunden.`,
          `${result.data.models.length} modelos Gemini encontrados.`
        )
      );
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Modelle konnten nicht geladen werden");
    } finally {
      setDiscoveringModels(false);
    }
  };

  const saveAiSettings = async (clearApiKey = false) => {
    setSavingAi(true);
    setAiError("");
    setAiNotice("");
    try {
      const callable = httpsCallable<
        { apiKey?: string; model: string; clearApiKey?: boolean },
        AiSettingsSummary
      >(functions, "saveAiSettings");
      const result = await callable({
        apiKey: clearApiKey ? undefined : apiKeyInput.trim() || undefined,
        model: selectedModel.trim(),
        clearApiKey
      });
      setAiSettings(result.data);
      setSelectedModel(result.data.model);
      if (clearApiKey) {
        setApiKeyInput("");
      }
      setAiNotice(t("Gemini-Einstellungen gespeichert.", "Ajustes de Gemini guardados."));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "KI-Einstellungen konnten nicht gespeichert werden");
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <section className="stack">
      <article className="card stack">
        <h2>{t("Einstellungen", "Ajustes")}</h2>
        <p>{t("Sprache und Kontoinformationen verwalten.", "Gestiona el idioma y la información de la cuenta.")}</p>

        <label>
          {t("App-Sprache", "Idioma de la app")}
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as Language)}
            aria-label={t("Sprache auswählen", "Seleccionar idioma")}
          >
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
          </select>
        </label>
      </article>

      <article className="card stack">
        <h3>{t("Konto", "Cuenta")}</h3>
        <div className="settings-grid">
          <p>
            <strong>{t("E-Mail", "Correo")}: </strong>
            {user.email ?? notAvailable(language)}
          </p>
          <p>
            <strong>UID: </strong>
            {user.uid}
          </p>
          <p>
            <strong>{t("E-Mail verifiziert", "Correo verificado")}: </strong>
            {yesNo(user.emailVerified, language)}
          </p>
          <p>
            <strong>{t("Anbieter", "Proveedor")}: </strong>
            {providers || notAvailable(language)}
          </p>
          <p>
            <strong>{t("Konto erstellt", "Cuenta creada")}: </strong>
            {createdAt}
          </p>
          <p>
            <strong>{t("Letzte Anmeldung", "Último acceso")}: </strong>
            {lastSignIn}
          </p>
        </div>
      </article>

      <article className="card stack">
        <h3>Firebase</h3>
        <div className="settings-grid">
          <p>
            <strong>{t("Verbindung", "Conexión")}: </strong>
            <span className={hasFirebaseSession ? "connection-pill ok" : "connection-pill warn"}>
              {hasFirebaseSession ? t("Verbunden", "Conectado") : t("Nicht verbunden", "No conectado")}
            </span>
          </p>
          <p>
            <strong>{t("Online", "En línea")}: </strong>
            {yesNo(isOnline, language)}
          </p>
          <p>
            <strong>{t("Konfiguration vollständig", "Configuración completa")}: </strong>
            {yesNo(firebaseConnectionInfo.hasRequiredConfig, language)}
          </p>
          <p>
            <strong>{t("Projekt", "Proyecto")}: </strong>
            {firebaseConnectionInfo.projectId || notAvailable(language)}
          </p>
          <p>
            <strong>{t("Umgebung", "Entorno")}: </strong>
            {firebaseConnectionInfo.usingEmulators ? t("Emulator", "Emulador") : t("Produktion", "Producción")}
          </p>
        </div>
      </article>

      {canManageAi && (
        <article className="card stack">
          <h3>Gemini</h3>
          <p>{t("API-Zugang und Modellwahl für die automatische PDF-Felderkennung.", "Acceso API y modelo para la detección automática de campos PDF.")}</p>

          {aiError && <p className="error">{aiError}</p>}
          {aiNotice && <p className="notice">{aiNotice}</p>}

          <div className="settings-grid">
            <p>
              <strong>{t("API konfiguriert", "API configurada")}: </strong>
              {loadingAi ? t("Lädt...", "Cargando...") : yesNo(Boolean(aiSettings?.hasApiKey), language)}
              {aiSettings?.apiKeyHint ? ` (${aiSettings.apiKeyHint})` : ""}
            </p>
            <p>
              <strong>{t("Aktives Modell", "Modelo activo")}: </strong>
              {aiSettings?.model || notAvailable(language)}
            </p>
          </div>

          <label>
            Gemini API Key
            <input
              type="password"
              value={apiKeyInput}
              placeholder={aiSettings?.hasApiKey ? t("Neue Key eingeben, um zu ersetzen", "Introduce una nueva clave para reemplazar") : "AIza..."}
              onChange={(event) => setApiKeyInput(event.target.value)}
            />
          </label>

          <div className="row">
            <button type="button" className="ghost" disabled={discoveringModels || !isOnline} onClick={() => void discoverModels()}>
              {discoveringModels ? t("Suche Modelle...", "Buscando modelos...") : t("Modelle autodiscovern", "Autodescubrir modelos")}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={savingAi || !aiSettings?.hasApiKey}
              onClick={() => void saveAiSettings(true)}
            >
              {t("API-Key löschen", "Borrar API key")}
            </button>
          </div>

          <label>
            {t("Gemini-Modell", "Modelo Gemini")}
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              {selectedModel && !availableModels.some((model) => model.id === selectedModel) && (
                <option value={selectedModel}>{selectedModel}</option>
              )}
              {availableModels.length === 0 && (
                <option value={selectedModel || "gemini-2.5-flash"}>{selectedModel || "gemini-2.5-flash"}</option>
              )}
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.id}
                </option>
              ))}
            </select>
          </label>

          {availableModels.length > 0 && (
            <div className="settings-model-list">
              {availableModels.map((model) => (
                <div key={model.id} className={selectedModel === model.id ? "settings-model-card active" : "settings-model-card"}>
                  <strong>{model.displayName || model.id}</strong>
                  <small>{model.id}</small>
                  {model.description && <p>{model.description}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <button
              type="button"
              disabled={savingAi || !selectedModel || !isOnline}
              onClick={() => void saveAiSettings(false)}
            >
              {savingAi ? t("Speichere...", "Guardando...") : t("Gemini speichern", "Guardar Gemini")}
            </button>
          </div>
        </article>
      )}
    </section>
  );
};

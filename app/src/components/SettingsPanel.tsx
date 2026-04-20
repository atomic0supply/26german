import { User } from "firebase/auth";
import { firebaseConnectionInfo } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { UserRole } from "../types";

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
const userRoleLabel = (userRole: UserRole, language: Language): string =>
  userRole === "admin"
    ? translate(language, "Administrator", "Administrador")
    : userRole === "office"
      ? translate(language, "Büro", "Oficina")
      : translate(language, "Techniker", "Técnico");

export const SettingsPanel = ({ language, onLanguageChange, user, userRole, isOnline }: SettingsPanelProps) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);

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
            <strong>{t("Rolle", "Rol")}: </strong>
            {userRoleLabel(userRole, language)}
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
    </section>
  );
};

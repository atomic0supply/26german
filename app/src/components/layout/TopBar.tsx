import { User } from "firebase/auth";
import { createTranslator, defaultUserLabel, Language } from "../../i18n";
import { LanguageSwitch } from "../LanguageSwitch";

interface TopBarProps {
  title: string;
  subtitle?: string;
  sectionLabel: string;
  language: Language;
  isOnline: boolean;
  user: User;
  userRoleLabel: string;
  onLanguageChange: (language: Language) => void;
  onLogout: () => void | Promise<void>;
  onToggleNav: () => void;
  onOpenPalette?: () => void;
}

export const TopBar = ({
  title,
  subtitle,
  sectionLabel,
  language,
  isOnline,
  user,
  userRoleLabel,
  onLanguageChange,
  onLogout,
  onToggleNav,
  onOpenPalette
}: TopBarProps) => {
  const t = createTranslator(language);
  const userLabel = user.displayName?.trim() || user.email?.trim() || defaultUserLabel(language);

  return (
    <header className="app-topbar">
      <div className="app-topbar__title-group">
        <button type="button" className="app-topbar__menu" onClick={onToggleNav} aria-label={t("Menü öffnen", "Abrir menú")}>
          ☰
        </button>
        <div className="app-topbar__copy">
          <span className="app-topbar__eyebrow">{sectionLabel}</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>

      <div className="app-topbar__meta">
        {onOpenPalette && (
          <button
            type="button"
            className="app-topbar__palette"
            onClick={onOpenPalette}
            aria-label={t("Befehlspalette öffnen", "Abrir paleta de comandos")}
            title={t("Befehle suchen (⌘K)", "Buscar comandos (⌘K)")}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="app-topbar__palette-label">{t("Suchen", "Buscar")}</span>
            <kbd>⌘K</kbd>
          </button>
        )}
        <span className={isOnline ? "status-pill online" : "status-pill offline"}>
          {isOnline ? t("Online", "En línea") : t("Offline", "Sin conexión")}
        </span>
        <LanguageSwitch language={language} onLanguageChange={onLanguageChange} />
        <div className="app-user-chip">
          <strong>{userLabel}</strong>
          <small>{userRoleLabel}</small>
        </div>
        <button type="button" className="ghost" onClick={() => void onLogout()}>
          {t("Abmelden", "Cerrar sesión")}
        </button>
      </div>
    </header>
  );
};

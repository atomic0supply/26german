import { User } from "firebase/auth";
import { Language, translate } from "../../i18n";
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
  onToggleNav
}: TopBarProps) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const userLabel = user.displayName?.trim() || user.email?.trim() || "User";

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

import { ReactNode, useMemo } from "react";
import { User } from "firebase/auth";
import { Language, translate } from "../../i18n";
import { UserRole } from "../../types";
import { PwaInstallPrompt } from "../PwaInstallPrompt";
import { SidebarNavItem } from "./SidebarNav";

interface AppShellProps {
  brandTitle: string;
  brandSubtitle?: string;
  pageTitle: string;
  pageSubtitle?: string;
  user: User;
  userRole: UserRole;
  isOnline: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLogout: () => void | Promise<void>;
  navItems: SidebarNavItem[];
  activeItem: string;
  onSelect: (itemId: string) => void;
  children: ReactNode;
}

const NavIcon = ({ id }: { id: string }) => {
  switch (id) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      );
    case "agenda":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2.5v4" />
          <path d="M17 2.5v4" />
          <rect x="4" y="5.5" width="16" height="15" rx="3" />
          <path d="M4 10.5h16" />
        </svg>
      );
    case "clients":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5v4h4" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case "admin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5 4.5 7v5c0 4.4 2.8 7.7 7.5 8.8 4.7-1.1 7.5-4.4 7.5-8.8V7L12 3.5Z" />
          <path d="M9.5 12.5 11 14l3.5-4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
};

export const AppShell = ({
  brandTitle,
  brandSubtitle,
  pageTitle,
  pageSubtitle,
  user,
  userRole,
  isOnline,
  language,
  onLanguageChange,
  onLogout,
  navItems,
  activeItem,
  onSelect,
  children
}: AppShellProps) => {
  const t = useMemo(() => (esValue: string, deValue: string) => translate(language, deValue, esValue), [language]);
  const userLabel = user.displayName?.trim() || user.email?.trim() || "User";
  const roleLabel = userRole === "admin" ? t("Admin", "Admin") : userRole === "office" ? t("Oficina", "Büro") : t("Técnico", "Techniker");

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <div className="app-rail__brand">
          <span className="app-rail__eyebrow">{t("CRM operativo", "Operatives CRM")}</span>
          <h1>{brandTitle}</h1>
          {brandSubtitle && <p>{brandSubtitle}</p>}
        </div>

        <nav className="app-rail__nav" aria-label={t("Navegación principal", "Hauptnavigation")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeItem ? "app-rail__nav-item active" : "app-rail__nav-item"}
              onClick={() => onSelect(item.id)}
            >
              <span className="app-rail__glyph">
                <NavIcon id={item.id} />
              </span>
              <span className="app-rail__copy">
                <strong>{item.label}</strong>
                {item.description && <small>{item.description}</small>}
              </span>
              {item.badge && <span className="app-rail__badge">{item.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="app-rail__footer">
          <div className="app-identity-card">
            <strong>{userLabel}</strong>
            <span>{roleLabel}</span>
            <small>{isOnline ? t("Conectado", "Verbunden") : t("Sin conexión", "Offline")}</small>
          </div>
          <button type="button" className="ghost" onClick={() => void onLogout()}>
            {t("Cerrar sesión", "Abmelden")}
          </button>
        </div>
      </aside>

      <div className="app-stage">
        <header className="app-stage__topbar">
          <div>
            <span className="app-stage__eyebrow">{brandTitle}</span>
            <h2>{pageTitle}</h2>
            {pageSubtitle && <p>{pageSubtitle}</p>}
          </div>

          <div className="app-stage__meta">
            <span className={isOnline ? "status-pill online" : "status-pill offline"}>
              {isOnline ? t("Online", "Online") : t("Sin conexión", "Offline")}
            </span>
            <div className="language-switch" aria-label={t("Idioma", "Sprache")}>
              <button
                type="button"
                className={language === "de" ? "language-switch__item active" : "language-switch__item"}
                onClick={() => onLanguageChange("de")}
              >
                DE
              </button>
              <button
                type="button"
                className={language === "es" ? "language-switch__item active" : "language-switch__item"}
                onClick={() => onLanguageChange("es")}
              >
                ES
              </button>
            </div>
          </div>
        </header>

        <main className="app-stage__content">{children}</main>

        <nav className="app-bottom-nav" aria-label={t("Navegación móvil", "Mobile Navigation")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeItem ? "app-bottom-nav__item active" : "app-bottom-nav__item"}
              onClick={() => onSelect(item.id)}
            >
              <span className="app-bottom-nav__icon">
                <NavIcon id={item.id} />
              </span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
};

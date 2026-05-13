import { ReactNode, useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { createTranslator, defaultUserLabel, Language } from "../../i18n";
import { UserRole } from "../../types";
import { PwaInstallPrompt } from "../PwaInstallPrompt";
import { SidebarNavItem } from "./SidebarNav";

interface AppShellProps {
  brandTitle: string;
  brandSubtitle?: string;
  logoUrl?: string;
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
  onOpenPalette?: () => void;
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

const RAIL_COLLAPSED_KEY = "app-rail-collapsed";

const readInitialCollapsed = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

export const AppShell = ({
  brandTitle,
  brandSubtitle,
  logoUrl,
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
  onOpenPalette,
  children
}: AppShellProps) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readInitialCollapsed);
  const t = useMemo(() => createTranslator(language), [language]);
  const userLabel = user.displayName?.trim() || user.email?.trim() || defaultUserLabel(language);
  const roleLabel = userRole === "admin" ? t("Admin", "Admin") : userRole === "office" ? t("Büro", "Oficina") : t("Techniker", "Técnico");
  const userInitials = userLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "•";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, isCollapsed ? "1" : "0");
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [isCollapsed]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.toggle("app-nav-open", isMobileNavOpen);

    return () => {
      document.body.classList.remove("app-nav-open");
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 961px)");
    const syncNavState = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileNavOpen(false);
      }
    };

    syncNavState(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncNavState);
      return () => mediaQuery.removeEventListener("change", syncNavState);
    }

    mediaQuery.addListener(syncNavState);
    return () => mediaQuery.removeListener(syncNavState);
  }, []);

  useEffect(() => {
    if (!isMobileNavOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  const handleSelect = (itemId: string) => {
    onSelect(itemId);
    setIsMobileNavOpen(false);
  };

  const renderRail = (variant: "desktop" | "drawer") => {
    const showCollapsed = variant === "desktop" && isCollapsed;
    return (
      <>
        <div className="app-rail__brand">
          <div className="app-rail__brand-mark">
            {logoUrl ? (
              <img src={logoUrl} className="app-rail__logo" alt={brandTitle} />
            ) : (
              <span className="app-rail__logo app-rail__logo--placeholder" aria-hidden="true">
                {brandTitle.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {!showCollapsed && (
            <div className="app-rail__brand-text">
              <strong>{brandTitle}</strong>
              {brandSubtitle && <span>{brandSubtitle}</span>}
            </div>
          )}
          {variant === "desktop" && (
            <button
              type="button"
              className="app-rail__collapse"
              aria-label={showCollapsed ? t("Menü erweitern", "Expandir menú") : t("Menü einklappen", "Plegar menú")}
              aria-pressed={showCollapsed}
              onClick={() => setIsCollapsed((prev) => !prev)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={showCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
              </svg>
            </button>
          )}
        </div>

        <nav className="app-rail__nav" aria-label={t("Hauptnavigation", "Navegación principal")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeItem ? "app-rail__nav-item active" : "app-rail__nav-item"}
              onClick={() => handleSelect(item.id)}
              title={showCollapsed ? item.label : undefined}
              aria-label={showCollapsed ? item.label : undefined}
            >
              <span className="app-rail__glyph">
                <NavIcon id={item.id} />
              </span>
              {!showCollapsed && <span className="app-rail__copy">{item.label}</span>}
              {item.badge && (
                <span className={showCollapsed ? "app-rail__badge app-rail__badge--dot" : "app-rail__badge"}>
                  {showCollapsed ? "" : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="app-rail__footer">
          <div className="app-identity-card">
            <span className="app-identity-card__avatar" aria-hidden="true">{userInitials}</span>
            {!showCollapsed && (
              <div className="app-identity-card__body">
                <strong>{userLabel}</strong>
                <span>{roleLabel}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="app-rail__logout"
            onClick={() => void onLogout()}
            title={showCollapsed ? t("Abmelden", "Cerrar sesión") : undefined}
            aria-label={showCollapsed ? t("Abmelden", "Cerrar sesión") : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="app-rail__logout-icon">
              <path d="M15 3.5h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            {!showCollapsed && <span>{t("Abmelden", "Cerrar sesión")}</span>}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className={isCollapsed ? "app-shell app-shell--rail-collapsed" : "app-shell"}>
      <aside className={isCollapsed ? "app-rail app-rail--collapsed" : "app-rail"}>{renderRail("desktop")}</aside>

      <div
        className={isMobileNavOpen ? "app-drawer app-drawer--open" : "app-drawer"}
        aria-hidden={!isMobileNavOpen}
      >
        <button
          type="button"
          className="app-drawer__backdrop"
          aria-label={t("Menü schließen", "Cerrar menú")}
          onClick={() => setIsMobileNavOpen(false)}
        />
        <aside
          id="app-mobile-nav"
          className="app-drawer__panel"
          aria-label={t("Seitenmenü", "Menú lateral")}
        >
          <div className="app-drawer__header">
            <span>{t("Menü", "Menú")}</span>
            <button
              type="button"
              className="app-drawer__close"
              aria-label={t("Menü schließen", "Cerrar menú")}
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="app-drawer__body">{renderRail("drawer")}</div>
        </aside>
      </div>

      <div className="app-stage">
        <header className="app-stage__topbar">
          <div className="app-stage__heading">
            <button
              type="button"
              className="app-stage__menu-button"
              aria-expanded={isMobileNavOpen}
              aria-controls="app-mobile-nav"
              aria-label={t("Menü öffnen", "Abrir menú")}
              onClick={() => setIsMobileNavOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div>
              <span className="app-stage__eyebrow">{brandTitle}</span>
              <h2>{pageTitle}</h2>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          </div>

          <div className="app-stage__meta">
            {onOpenPalette && (
              <button
                type="button"
                className="app-stage__palette"
                onClick={onOpenPalette}
                aria-label={t("Befehlspalette öffnen", "Abrir paleta de comandos")}
                title={t("Befehle suchen (⌘K)", "Buscar comandos (⌘K)")}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="app-stage__palette-label">{t("Suchen", "Buscar")}</span>
                <kbd>⌘K</kbd>
              </button>
            )}
            <span className={isOnline ? "status-pill online" : "status-pill offline"}>
              {isOnline ? t("Online", "Online") : t("Offline", "Sin conexión")}
            </span>
            <div className="language-switch" aria-label={t("Sprache", "Idioma")}>
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

        <PwaInstallPrompt language={language} />

        <footer className="app-footer">© 2026 FormetaLabs. {t("Alle Rechte vorbehalten.", "Todos los derechos reservados.")}</footer>

        <nav className="app-bottom-nav" aria-label={t("Mobile Navigation", "Navegación móvil")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeItem ? "app-bottom-nav__item active" : "app-bottom-nav__item"}
              onClick={() => handleSelect(item.id)}
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

import { ReactNode, useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { Language, translate } from "../../i18n";
import { UserRole } from "../../types";
import { SidebarNav, SidebarNavItem } from "./SidebarNav";
import { TopBar } from "./TopBar";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useMemo(() => (deValue: string, esValue: string) => translate(language, deValue, esValue), [language]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = (itemId: string) => {
    onSelect(itemId);
    setSidebarOpen(false);
  };

  const userLabel = user.displayName?.trim() || user.email?.trim() || "User";
  const userRoleLabel = userRole === "admin" ? "Admin" : userRole === "office" ? "Office" : "Technician";

  return (
    <div className={sidebarOpen ? "app-shell app-shell--open" : "app-shell"}>
      <button
        type="button"
        className={sidebarOpen ? "app-shell__backdrop visible" : "app-shell__backdrop"}
        aria-label={t("Menü schließen", "Cerrar menú")}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__kicker">{t("Digitales Einsatzbüro", "Oficina digital")}</span>
          <h1>{brandTitle}</h1>
          {brandSubtitle && <p>{brandSubtitle}</p>}
        </div>

        <SidebarNav items={navItems} activeItem={activeItem} onSelect={handleSelect} />

        <div className="app-sidebar__panel surface">
          <span className={isOnline ? "status-pill online" : "status-pill offline"}>
            {isOnline ? t("Online", "En línea") : t("Offline", "Sin conexión")}
          </span>
          <div className="app-sidebar__user">
            <strong>{userLabel}</strong>
            <span>{userRoleLabel}</span>
          </div>
          <button type="button" className="ghost" onClick={() => void onLogout()}>
            {t("Abmelden", "Cerrar sesión")}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <TopBar
          title={pageTitle}
          subtitle={pageSubtitle}
          sectionLabel={brandTitle}
          isOnline={isOnline}
          language={language}
          user={user}
          userRoleLabel={userRoleLabel}
          onLanguageChange={onLanguageChange}
          onLogout={onLogout}
          onToggleNav={() => setSidebarOpen((current) => !current)}
        />

        <main className="app-main__content">{children}</main>
      </div>
    </div>
  );
};

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "../../src/components/layout/AppShell";
import { LoginForm } from "../../src/components/LoginForm";
import {
  applyDocumentLanguage,
  createTranslator,
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY,
  Language,
  persistLanguagePreference
} from "../../src/i18n";

const mockUser = {
  uid: "user-1",
  email: null,
  displayName: null
} as User;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(() => {
  cleanup();
});

const LoginHarness = () => {
  const [language, setLanguage] = useState<Language>("de");
  return <LoginForm language={language} onLanguageChange={setLanguage} />;
};

const ShellHarness = () => {
  const [language, setLanguage] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    persistLanguagePreference(language);
    applyDocumentLanguage(language);
  }, [language]);

  const t = useMemo(() => createTranslator(language), [language]);
  const navItems = [
    {
      id: "home",
      label: t("Start", "Inicio"),
      description: t("Tagesüberblick", "Resumen del día")
    },
    {
      id: "reports",
      label: t("Berichte", "Informes"),
      description: t("Entwürfe und Finale", "Borradores y finales")
    }
  ];

  return (
    <AppShell
      brandTitle="LeakOps"
      pageTitle={t("Startseite", "Inicio")}
      user={mockUser}
      userRole="technician"
      isOnline
      language={language}
      onLanguageChange={setLanguage}
      onLogout={() => undefined}
      navItems={navItems}
      activeItem="home"
      onSelect={() => undefined}
    >
      <div>{t("Inhalt", "Contenido")}</div>
    </AppShell>
  );
};

describe("language switching UI", () => {
  it("updates the login form copy when switching languages", async () => {
    const user = userEvent.setup();
    render(<LoginHarness />);

    expect(screen.getByRole("heading", { name: "Einsatzbericht PWA" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ES" }));

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "DE" }));

    expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();
  });

  it("persists DE -> ES -> DE and updates visible labels plus document language", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "de");

    const { unmount } = render(<ShellHarness />);

    expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeInTheDocument();
    expect(screen.getAllByText("Benutzer").length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe("de");

    await user.click(screen.getByRole("button", { name: "ES" }));

    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getAllByText("Usuario").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(document.documentElement.lang).toBe("es");

    unmount();
    render(<ShellHarness />);

    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getAllByText("Usuario").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "DE" }));

    expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeInTheDocument();
    expect(screen.getAllByText("Benutzer").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });
});

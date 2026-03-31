import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { LoginForm } from "./components/LoginForm";
import { ReportList } from "./components/ReportList";
import { ReportEditor } from "./components/ReportEditor";
import { detectInitialLanguage, LANGUAGE_STORAGE_KEY, Language, translate } from "./i18n";
import { UserRole } from "./types";

type AccessStatus = "checking" | "allowed" | "missing_profile" | "wrong_role" | "inactive" | "error";

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [language, setLanguage] = useState<Language>(detectInitialLanguage);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const [accessError, setAccessError] = useState("");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore localStorage write failures in restricted environments.
    }

    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!user) {
      setAccessStatus("checking");
      setAccessError("");
      setUserRole(null);
      return;
    }

    let cancelled = false;

    const checkAccess = async () => {
      setAccessStatus("checking");
      setAccessError("");

      try {
        const profileSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!profileSnapshot.exists()) {
          if (!cancelled) {
            setAccessStatus("missing_profile");
          }
          return;
        }

        const profile = profileSnapshot.data();
        if (!["technician", "admin", "office"].includes(String(profile.role ?? ""))) {
          if (!cancelled) {
            setAccessStatus("wrong_role");
          }
          return;
        }

        if (profile.active !== true) {
          if (!cancelled) {
            setAccessStatus("inactive");
          }
          return;
        }

        if (!cancelled) {
          setUserRole(profile.role as UserRole);
          setAccessStatus("allowed");
        }
      } catch (error) {
        if (!cancelled) {
          setAccessStatus("error");
          setAccessError(
                error instanceof Error
                  ? error.message
                  : translate(
                      language,
                      "Berechtigungen konnten nicht geprueft werden.",
                      "No se pudieron comprobar los permisos."
                    )
          );
        }
      }
    };

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [user, language]);

  if (loading || (user && accessStatus === "checking")) {
    return (
      <main className="container">
        <p>{t("Lade Anwendung...", "Cargando aplicación...")}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container auth-shell">
        <LoginForm language={language} />
      </main>
    );
  }

  if (accessStatus !== "allowed") {
    const guidanceMessage = (() => {
      if (accessStatus === "missing_profile") {
        return t(
          "Dein Login ist korrekt, aber dein Techniker-Profil fehlt in Firestore (users/{uid}). Bitte den Account mit dem Provisioning-Skript freischalten.",
          "Tu inicio de sesión es correcto, pero falta tu perfil técnico en Firestore (users/{uid}). Activa la cuenta con el script de provisión."
        );
      }

      if (accessStatus === "wrong_role") {
        return t(
          "Dein Benutzerprofil hat keine freigeschaltete Rolle ('technician', 'admin' oder 'office'). Bitte Rolle und Status in users/{uid} pruefen.",
          "Tu perfil no tiene un rol permitido ('technician', 'admin' u 'office'). Revisa rol y estado en users/{uid}."
        );
      }

      if (accessStatus === "inactive") {
        return t(
          "Dein Techniker-Profil ist vorhanden, aber nicht aktiv (active != true).",
          "Tu perfil técnico existe, pero no está activo (active != true)."
        );
      }

      return t(
        "Berechtigungen konnten nicht geprueft werden. Details unten.",
        "No se pudieron comprobar los permisos. Detalle abajo."
      );
    })();

    return (
      <main className="container auth-shell">
        <div className="auth-card">
          <h1>{t("Kein Datenzugriff", "Sin acceso a datos")}</h1>
          <p>{guidanceMessage}</p>
          <p>
            <code>
              npm run provision:user -- --email "{user.email ?? "tech@example.com"}" --password "SECRET"
              --displayName "{user.displayName ?? "Techniker"}"
            </code>
          </p>
          {accessStatus === "error" && accessError && <p className="error">{accessError}</p>}
          <button type="button" className="ghost" onClick={() => void signOut(auth)}>
            {t("Abmelden", "Cerrar sesión")}
          </button>
        </div>
      </main>
    );
  }

  if (activeReportId) {
    return (
      <ReportEditor
        reportId={activeReportId}
        uid={user.uid}
        isOnline={isOnline}
        onBack={() => setActiveReportId(null)}
      />
    );
  }

  return (
    <ReportList
      uid={user.uid}
      user={user}
      userRole={userRole ?? "technician"}
      isOnline={isOnline}
      onOpenReport={setActiveReportId}
      language={language}
      onLanguageChange={setLanguage}
    />
  );
};

export default App;

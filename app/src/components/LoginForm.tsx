import { FormEvent, useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Language, translate } from "../i18n";
import { LanguageSwitch } from "./LanguageSwitch";

interface LoginFormProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

type Mode = "login" | "reset" | "resetSent";

export const LoginForm = ({ language, onLanguageChange }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("Anmeldung fehlgeschlagen", "Error al iniciar sesión");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMode("resetSent");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("Fehler beim Senden", "Error al enviar");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "resetSent") {
    return (
      <div className="auth-card">
        <div className="auth-card__header">
          <h1>{t("Einsatzbericht PWA", "PWA de informes")}</h1>
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} />
        </div>
        <p>{t("Passwort-Reset-E-Mail wurde gesendet. Bitte prüfe dein Postfach.", `Se ha enviado un correo a ${email}. Revisa tu bandeja de entrada.`)}</p>
        <button type="button" onClick={() => { setMode("login"); setError(""); }}>
          {t("Zurück zur Anmeldung", "Volver al inicio de sesión")}
        </button>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <div className="auth-card">
        <div className="auth-card__header">
          <h1>{t("Passwort zurücksetzen", "Restablecer contraseña")}</h1>
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} />
        </div>
        <p>{t("Gib deine E-Mail-Adresse ein. Wir senden dir einen Reset-Link.", "Introduce tu correo. Te enviaremos un enlace de recuperación.")}</p>
        <form onSubmit={handleResetSubmit} className="stack">
          <label>
            {t("E-Mail", "Correo")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("techniker@firma.de", "tecnico@empresa.com")}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? t("Senden...", "Enviando...") : t("Reset-Link senden", "Enviar enlace")}
          </button>
          <button type="button" className="ghost" onClick={() => { setMode("login"); setError(""); }}>
            {t("Zurück", "Volver")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-card__header">
        <h1>{t("Einsatzbericht PWA", "PWA de informes")}</h1>
        <LanguageSwitch language={language} onLanguageChange={onLanguageChange} />
      </div>
      <p>{t("Bitte mit Ihrem Techniker-Konto anmelden.", "Inicia sesión con tu cuenta de técnico.")}</p>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          {t("E-Mail", "Correo")}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("techniker@firma.de", "tecnico@empresa.com")}
            required
          />
        </label>

        <label>
          {t("Passwort", "Contraseña")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? t("Anmeldung...", "Iniciando sesión...") : t("Anmelden", "Iniciar sesión")}
        </button>
        <button type="button" className="ghost" onClick={() => { setMode("reset"); setError(""); }}>
          {t("Passwort vergessen?", "¿Olvidaste tu contraseña?")}
        </button>
      </form>
    </div>
  );
};

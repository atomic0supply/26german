import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Language, translate } from "../i18n";

interface LoginFormProps {
  language: Language;
}

export const LoginForm = ({ language }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="auth-card">
      <h1>Einsatzbericht PWA</h1>
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
          {loading ? t("Anmeldung...", "Iniciando sesión...") : t("Anmelden", "Entrar")}
        </button>
      </form>
    </div>
  );
};

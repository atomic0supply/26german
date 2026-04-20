import { User } from "firebase/auth";
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { Language, translate } from "../i18n";
import { UserRole } from "../types";
import { SettingsPanel } from "./SettingsPanel";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";

interface AdminPanelProps {
  language: Language;
  isOnline: boolean;
  uid: string;
  onLanguageChange: (language: Language) => void;
  user: User;
  userRole: UserRole;
}

type AdminTab = "users" | "smtp" | "status" | "settings";

interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}

interface SmtpConfig {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  from: string;
  hasPass: boolean;
  appointmentEmailSubject: string;
  appointmentEmailBody: string;
  reportEmailSubject: string;
  reportEmailBody: string;
}

interface AppStatus {
  users: { total: number; byRole: { technician: number; admin: number; office: number; inactive: number } };
  reports: { total: number; byStatus: { draft: number; finalized: number } };
  smtp: { configured: boolean };
}

const ROLE_OPTIONS: UserRole[] = ["technician", "office", "admin"];

export const AdminPanel = ({ language, isOnline, uid, onLanguageChange, user, userRole }: AdminPanelProps) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const [tab, setTab] = useState<AdminTab>("users");

  // Users state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", displayName: "", role: "technician" as UserRole });
  const [creatingUser, setCreatingUser] = useState(false);

  // SMTP state
  const [smtp, setSmtp] = useState<SmtpConfig>({
    configured: false,
    host: "",
    port: 587,
    user: "",
    from: "",
    hasPass: false,
    appointmentEmailSubject: "",
    appointmentEmailBody: "",
    reportEmailSubject: "",
    reportEmailBody: ""
  });
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [smtpPass, setSmtpPass] = useState("");
  const [savingSmtp, setSavingSmtp] = useState(false);

  // App status state
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  const handleError = (err: unknown) => {
    setError(err instanceof Error ? err.message : t("Fehler", "Error desconocido"));
  };

  // ── Load users when tab is active ──────────────────────────────────────────
  useEffect(() => {
    if (tab !== "users") return;
    setLoadingUsers(true);
    setError("");
    const fn = httpsCallable<unknown, UserRecord[]>(functions, "listUsers");
    fn({})
      .then((res) => setUsers(res.data))
      .catch(handleError)
      .finally(() => setLoadingUsers(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Load SMTP when tab is active ───────────────────────────────────────────
  useEffect(() => {
    if (tab !== "smtp") return;
    setLoadingSmtp(true);
    setError("");
    const fn = httpsCallable<unknown, SmtpConfig>(functions, "getSmtpConfig");
    fn({})
      .then((res) => setSmtp(res.data))
      .catch(handleError)
      .finally(() => setLoadingSmtp(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Load app status when tab is active ─────────────────────────────────────
  useEffect(() => {
    if (tab !== "status") return;
    setLoadingStatus(true);
    setError("");
    const fn = httpsCallable<unknown, AppStatus>(functions, "getAppStatus");
    fn({})
      .then((res) => setAppStatus(res.data))
      .catch(handleError)
      .finally(() => setLoadingStatus(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Create user ─────────────────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password) {
      setError(t("Email und Passwort sind Pflichtfelder.", "Email y contraseña son obligatorios."));
      return;
    }
    setCreatingUser(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "createUser");
      await fn(newUser);
      setShowCreateForm(false);
      setNewUser({ email: "", password: "", displayName: "", role: "technician" });
      showNotice(t("Benutzer erstellt.", "Usuario creado."));
      // Reload list
      const listFn = httpsCallable<unknown, UserRecord[]>(functions, "listUsers");
      const res = await listFn({});
      setUsers(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setCreatingUser(false);
    }
  };

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = async (targetUid: string, currentActive: boolean) => {
    if (targetUid === uid) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "updateUser");
      await fn({ targetUid, active: !currentActive });
      setUsers((prev) => prev.map((u) => u.uid === targetUid ? { ...u, active: !currentActive } : u));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Change role ─────────────────────────────────────────────────────────────
  const handleChangeRole = async (targetUid: string, role: UserRole) => {
    if (targetUid === uid) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "updateUser");
      await fn({ targetUid, role });
      setUsers((prev) => prev.map((u) => u.uid === targetUid ? { ...u, role } : u));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Delete user ─────────────────────────────────────────────────────────────
  const handleDeleteUser = async (targetUid: string, email: string) => {
    if (targetUid === uid) return;
    if (!window.confirm(t(`Benutzer ${email} wirklich löschen?`, `¿Eliminar al usuario ${email}?`))) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "deleteUser");
      await fn({ targetUid });
      setUsers((prev) => prev.filter((u) => u.uid !== targetUid));
      showNotice(t("Benutzer gelöscht.", "Usuario eliminado."));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Save SMTP ───────────────────────────────────────────────────────────────
  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "saveSmtpConfig");
      await fn({
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        from: smtp.from,
        pass: smtpPass || undefined,
        appointmentEmailSubject: smtp.appointmentEmailSubject,
        appointmentEmailBody: smtp.appointmentEmailBody,
        reportEmailSubject: smtp.reportEmailSubject,
        reportEmailBody: smtp.reportEmailBody
      });
      setSmtpPass("");
      showNotice(t("SMTP-Konfiguration gespeichert.", "Configuración SMTP guardada."));
      // Reload to show updated state
      const getFn = httpsCallable<unknown, SmtpConfig>(functions, "getSmtpConfig");
      const res = await getFn({});
      setSmtp(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setSavingSmtp(false);
    }
  };

  const roleLabel = (role: UserRole) =>
    role === "admin" ? t("Admin", "Admin") : role === "office" ? t("Büro", "Oficina") : t("Techniker", "Técnico");

  return (
    <section className="stack">
      <div className="admin-tabs">
        <button
          type="button"
          className={tab === "users" ? "tab-btn active" : "tab-btn"}
          onClick={() => setTab("users")}
        >
          {t("Benutzer", "Usuarios")}
        </button>
        <button
          type="button"
          className={tab === "smtp" ? "tab-btn active" : "tab-btn"}
          onClick={() => setTab("smtp")}
        >
          {t("E-Mail / SMTP", "Correo / SMTP")}
        </button>
        <button
          type="button"
          className={tab === "status" ? "tab-btn active" : "tab-btn"}
          onClick={() => setTab("status")}
        >
          {t("App-Status", "Estado")}
        </button>
        <button
          type="button"
          className={tab === "settings" ? "tab-btn active" : "tab-btn"}
          onClick={() => setTab("settings")}
        >
          {t("Profil & System", "Perfil y sistema")}
        </button>
      </div>

      {error && <p className="notice-banner error">{error}</p>}
      {notice && <p className="notice-banner notice">{notice}</p>}

      {/* ── USERS ── */}
      {tab === "users" && (
        <SectionCard
          title={t("Benutzerverwaltung", "Gestión de usuarios")}
          description={t("Erstelle, bearbeite oder deaktiviere App-Benutzer.", "Crea, edita o desactiva usuarios de la app.")}
          actions={
            <button type="button" className="btn-primary" onClick={() => setShowCreateForm((v) => !v)} disabled={!isOnline}>
              {showCreateForm ? t("Abbrechen", "Cancelar") : t("+ Benutzer", "+ Usuario")}
            </button>
          }
        >
          {showCreateForm && (
            <div className="admin-create-form">
              <div className="grid two">
                <label>
                  {t("E-Mail", "Email")}
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                  />
                </label>
                <label>
                  {t("Passwort", "Contraseña")}
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    placeholder="••••••••"
                  />
                </label>
                <label>
                  {t("Name", "Nombre")}
                  <input
                    value={newUser.displayName}
                    onChange={(e) => setNewUser((p) => ({ ...p, displayName: e.target.value }))}
                    placeholder={t("Vollständiger Name", "Nombre completo")}
                  />
                </label>
                <label>
                  {t("Rolle", "Rol")}
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as UserRole }))}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-create-form__actions">
                <button type="button" className="btn-primary" onClick={handleCreateUser} disabled={creatingUser || !isOnline}>
                  {creatingUser ? t("Erstellt...", "Creando...") : t("Erstellen", "Crear usuario")}
                </button>
              </div>
            </div>
          )}

          {loadingUsers ? (
            <p>{t("Lade Benutzer...", "Cargando usuarios...")}</p>
          ) : users.length === 0 ? (
            <p>{t("Keine Benutzer gefunden.", "No hay usuarios.")}</p>
          ) : (
            <div className="admin-user-table">
              <div className="admin-user-table__header">
                <span>{t("Name / E-Mail", "Nombre / Email")}</span>
                <span>{t("Rolle", "Rol")}</span>
                <span>{t("Status", "Estado")}</span>
                <span>{t("Aktionen", "Acciones")}</span>
              </div>
              {users.map((u) => (
                <div key={u.uid} className="admin-user-table__row">
                  <div>
                    <strong>{u.displayName || u.email}</strong>
                    {u.displayName && <small>{u.email}</small>}
                    {u.uid === uid && <StatusChip tone="info">{t("Ich", "Yo")}</StatusChip>}
                  </div>
                  <div>
                    <select
                      value={u.role}
                      disabled={u.uid === uid || !isOnline}
                      onChange={(e) => void handleChangeRole(u.uid, e.target.value as UserRole)}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{roleLabel(r)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <StatusChip tone={u.active ? "success" : "danger"}>
                      {u.active ? t("Aktiv", "Activo") : t("Inaktiv", "Inactivo")}
                    </StatusChip>
                  </div>
                  <div className="admin-user-table__actions">
                    <button
                      type="button"
                      className="ghost small"
                      disabled={u.uid === uid || !isOnline}
                      onClick={() => void handleToggleActive(u.uid, u.active)}
                    >
                      {u.active ? t("Deaktivieren", "Desactivar") : t("Aktivieren", "Activar")}
                    </button>
                    <button
                      type="button"
                      className="ghost small danger"
                      disabled={u.uid === uid || !isOnline}
                      onClick={() => void handleDeleteUser(u.uid, u.email)}
                    >
                      {t("Löschen", "Eliminar")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── SMTP ── */}
      {tab === "smtp" && (
        <SectionCard
          title={t("E-Mail-Server (SMTP)", "Servidor de correo (SMTP)")}
          description={t(
            "Konfiguriere den SMTP-Server für den automatischen E-Mail-Versand.",
            "Configura el servidor SMTP para el envío automático de correos."
          )}
        >
          {loadingSmtp ? (
            <p>{t("Lade Konfiguration...", "Cargando configuración...")}</p>
          ) : (
            <div className="stack">
              <div className="grid two">
                <label>
                  {t("Host", "Servidor SMTP")}
                  <input
                    value={smtp.host}
                    onChange={(e) => setSmtp((p) => ({ ...p, host: e.target.value }))}
                    placeholder="smtp.example.com"
                  />
                </label>
                <label>
                  {t("Port", "Puerto")}
                  <input
                    type="number"
                    value={smtp.port}
                    onChange={(e) => setSmtp((p) => ({ ...p, port: Number(e.target.value) }))}
                    placeholder="587"
                  />
                </label>
                <label>
                  {t("Benutzername", "Usuario SMTP")}
                  <input
                    value={smtp.user}
                    onChange={(e) => setSmtp((p) => ({ ...p, user: e.target.value }))}
                    placeholder="user@example.com"
                  />
                </label>
                <label>
                  {t("Absender-Adresse (From)", "Dirección remitente (From)")}
                  <input
                    value={smtp.from}
                    onChange={(e) => setSmtp((p) => ({ ...p, from: e.target.value }))}
                    placeholder="noreply@example.com"
                  />
                </label>
                <label>
                  {smtp.hasPass
                    ? t("Neues Passwort (leer = unverändert)", "Nueva contraseña (vacío = sin cambios)")
                    : t("Passwort", "Contraseña")}
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={smtp.hasPass ? "••••••••" : t("Passwort eingeben", "Introduce la contraseña")}
                  />
                </label>
              </div>

              <div className="smtp-status-row">
                <StatusChip tone={smtp.configured ? "success" : "warning"}>
                  {smtp.configured ? t("Konfiguriert", "Configurado") : t("Nicht konfiguriert", "Sin configurar")}
                </StatusChip>
              </div>

              <div className="admin-template-box">
                <h4>{t("E-Mail-Vorlagen", "Plantillas de correo")}</h4>
                <p>
                  {t(
                    "Nutze Platzhalter wie {{clientName}}, {{appointmentDate}}, {{locationObject}}, {{technicianName}}, {{projectNumber}}, {{senderName}} oder {{recipientEmail}}.",
                    "Usa variables como {{clientName}}, {{appointmentDate}}, {{locationObject}}, {{technicianName}}, {{projectNumber}}, {{senderName}} o {{recipientEmail}}."
                  )}
                </p>
              </div>

              <div className="stack">
                <label>
                  {t("Betreff fuer Termin-Mail", "Asunto para correo de visita técnica")}
                  <input
                    value={smtp.appointmentEmailSubject}
                    onChange={(e) => setSmtp((p) => ({ ...p, appointmentEmailSubject: e.target.value }))}
                    placeholder={t("Technischer Termin am {{appointmentDate}}", "Visita técnica programada para {{appointmentDate}}")}
                  />
                </label>
                <label>
                  {t("Text fuer Termin-Mail", "Texto para correo de visita técnica")}
                  <textarea
                    value={smtp.appointmentEmailBody}
                    onChange={(e) => setSmtp((p) => ({ ...p, appointmentEmailBody: e.target.value }))}
                    placeholder={t("Hallo {{clientName}}, ...", "Hola {{clientName}}, ...")}
                  />
                </label>
              </div>

              <div className="stack">
                <label>
                  {t("Betreff fuer Bericht-Mail", "Asunto para correo del informe")}
                  <input
                    value={smtp.reportEmailSubject}
                    onChange={(e) => setSmtp((p) => ({ ...p, reportEmailSubject: e.target.value }))}
                    placeholder={t("Einsatzbericht {{projectNumber}}", "Informe técnico {{projectNumber}}")}
                  />
                </label>
                <label>
                  {t("Text fuer Bericht-Mail", "Texto para correo del informe")}
                  <textarea
                    value={smtp.reportEmailBody}
                    onChange={(e) => setSmtp((p) => ({ ...p, reportEmailBody: e.target.value }))}
                    placeholder={t("Hallo {{clientName}}, ...", "Hola {{clientName}}, ...")}
                  />
                </label>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSaveSmtp()}
                disabled={savingSmtp || !isOnline}
              >
                {savingSmtp ? t("Speichert...", "Guardando...") : t("Speichern", "Guardar configuración")}
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── STATUS ── */}
      {tab === "status" && (
        <SectionCard
          title={t("App-Status", "Estado de la app")}
          description={t("Übersicht über Benutzer, Berichte und Systemkonfiguration.", "Resumen de usuarios, informes y configuración del sistema.")}
          actions={
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setLoadingStatus(true);
                setError("");
                const fn = httpsCallable<unknown, AppStatus>(functions, "getAppStatus");
                fn({})
                  .then((res) => setAppStatus(res.data))
                  .catch(handleError)
                  .finally(() => setLoadingStatus(false));
              }}
              disabled={!isOnline || loadingStatus}
            >
              {t("Aktualisieren", "Actualizar")}
            </button>
          }
        >
          {loadingStatus ? (
            <p>{t("Lade Status...", "Cargando estado...")}</p>
          ) : appStatus ? (
            <div className="admin-status-grid">
              <div className="admin-status-block">
                <h4>{t("Benutzer", "Usuarios")} <span className="count">{appStatus.users.total}</span></h4>
                <ul>
                  <li>{t("Techniker", "Técnicos")}: <strong>{appStatus.users.byRole.technician}</strong></li>
                  <li>{t("Büro", "Oficina")}: <strong>{appStatus.users.byRole.office}</strong></li>
                  <li>{t("Admins", "Admins")}: <strong>{appStatus.users.byRole.admin}</strong></li>
                  <li>{t("Inaktiv", "Inactivos")}: <strong>{appStatus.users.byRole.inactive}</strong></li>
                </ul>
              </div>
              <div className="admin-status-block">
                <h4>{t("Berichte", "Informes")} <span className="count">{appStatus.reports.total}</span></h4>
                <ul>
                  <li>{t("Entwürfe", "Borradores")}: <strong>{appStatus.reports.byStatus.draft}</strong></li>
                  <li>{t("Finalisiert", "Finalizados")}: <strong>{appStatus.reports.byStatus.finalized}</strong></li>
                </ul>
              </div>
              <div className="admin-status-block">
                <h4>{t("Konfiguration", "Configuración")}</h4>
                <ul>
                  <li>
                    SMTP:{" "}
                    <StatusChip tone={appStatus.smtp.configured ? "success" : "warning"}>
                      {appStatus.smtp.configured ? t("OK", "OK") : t("Nicht konfiguriert", "Sin configurar")}
                    </StatusChip>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <p>{t("Keine Daten verfügbar.", "No hay datos disponibles.")}</p>
          )}
        </SectionCard>
      )}

      {tab === "settings" && (
        <SectionCard
          title={t("Profil & System", "Perfil y sistema")}
          description={t(
            "Sprache, Konto und technische Systeminformationen an einem Ort.",
            "Idioma, cuenta e información técnica del sistema en un solo lugar."
          )}
        >
          <SettingsPanel
            language={language}
            onLanguageChange={onLanguageChange}
            user={user}
            userRole={userRole}
            isOnline={isOnline}
          />
        </SectionCard>
      )}
    </section>
  );
};

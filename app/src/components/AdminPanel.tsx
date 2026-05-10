import { User } from "firebase/auth";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../firebase";
import { Language, translate } from "../i18n";
import { AiConfig, AiPrompt, AiPromptPurpose, BrandingConfig, UserRole } from "../types";
import { SettingsPanel } from "./SettingsPanel";
import { TemplateAdminPanel } from "./TemplateAdminPanel";
import { SectionCard } from "./ui/SectionCard";
import { StatusChip } from "./ui/StatusChip";
import { SmtpTemplateEditor } from "./SmtpTemplateEditor";

interface AdminPanelProps {
  language: Language;
  isOnline: boolean;
  uid: string;
  onLanguageChange: (language: Language) => void;
  user: User;
  userRole: UserRole;
}

type AdminPage =
  | "dashboard"
  | "users"
  | "appearance"
  | "smtp"
  | "status"
  | "templates"
  | "settings"
  | "ia"
  | "prompts"
  | "testdata"
  | "ayuda";

type AdminGroupKey = "team" | "appearance" | "documents" | "messaging" | "ai" | "system";

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
  emailSignature: string;
  signatureLogoUrl: string;
  appointmentEmailSubject: string;
  appointmentEmailBody: string;
  reportEmailSubject: string;
  reportEmailBody: string;
  leckortungEmailSubject: string;
  leckortungEmailBody: string;
}

interface AppStatus {
  users: { total: number; byRole: { technician: number; admin: number; office: number; inactive: number } };
  reports: { total: number; byStatus: { draft: number; finalized: number } };
  smtp: { configured: boolean };
}

const ROLE_OPTIONS: UserRole[] = ["technician", "office", "admin"];
const DEFAULT_PRIMARY_COLOR = "#135f96";
const NAV_GROUPS: Array<{ group?: AdminGroupKey; items: AdminPage[] }> = [
  { items: ["dashboard"] },
  { group: "team", items: ["users"] },
  { group: "appearance", items: ["appearance"] },
  { group: "documents", items: ["templates"] },
  { group: "messaging", items: ["smtp"] },
  { group: "ai", items: ["ia", "prompts"] },
  { group: "system", items: ["status", "settings", "testdata", "ayuda"] }
];
const QUICK_ACTIONS: AdminPage[] = ["users", "appearance", "smtp", "prompts"];
const COLOR_PRESETS = [
  { name: "Azul", value: "#135f96" },
  { name: "Navy", value: "#1e3a5f" },
  { name: "Esmeralda", value: "#0d7a5a" },
  { name: "Violeta", value: "#6b21a8" },
  { name: "Slate", value: "#475569" },
  { name: "Rojo", value: "#b91c1c" }
] as const;

const normalizeHexColor = (value: string | undefined, fallback = DEFAULT_PRIMARY_COLOR) => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const [, red, green, blue] = normalized;
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return fallback;
};

const AdminNavIcon = ({ page }: { page: AdminPage }) => {
  switch (page) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="2" />
          <rect x="13" y="4" width="7" height="11" rx="2" />
          <rect x="4" y="13" width="7" height="7" rx="2" />
          <rect x="13" y="17" width="7" height="3" rx="1.5" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 12a3.25 3.25 0 1 0 0-6.5A3.25 3.25 0 0 0 8 12Z" />
          <path d="M16.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
          <path d="M13.5 19a3.5 3.5 0 0 1 7 0" />
        </svg>
      );
    case "appearance":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4a8 8 0 1 0 0 16h.5a2.5 2.5 0 0 0 0-5H11a2 2 0 0 1 0-4h1.2a2.6 2.6 0 0 0 0-5.2H12Z" />
          <circle cx="7.5" cy="10" r="1" />
          <circle cx="10" cy="7.5" r="1" />
          <circle cx="15.5" cy="8.5" r="1" />
        </svg>
      );
    case "smtp":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
          <path d="m5.5 8 6.5 5 6.5-5" />
        </svg>
      );
    case "status":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 18V9" />
          <path d="M12 18V5" />
          <path d="M19 18v-7" />
          <path d="M4 18.5h16" />
        </svg>
      );
    case "templates":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19v-13A1.5 1.5 0 0 1 7.5 4.5Z" />
          <path d="M14 4.5v4h4" />
          <path d="M9 12h6" />
          <path d="M9 15.5h6" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.1a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.1a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.1a1 1 0 0 0-.9.7Z" />
        </svg>
      );
    case "ia":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="7" width="12" height="10" rx="3" />
          <path d="M9 4.5v2" />
          <path d="M15 4.5v2" />
          <path d="M9.5 12h.01" />
          <path d="M14.5 12h.01" />
          <path d="M10 15c.5.6 1.2.9 2 .9s1.5-.3 2-.9" />
        </svg>
      );
    case "prompts":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5.5h12" />
          <path d="M6 10h12" />
          <path d="M6 14.5h8" />
          <path d="M6 19h12" />
        </svg>
      );
    case "ayuda":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 4.3 1.7c-.7.7-1.3 1.1-1.3 2.3" />
          <circle cx="12" cy="16.9" r=".6" fill="currentColor" stroke="none" />
        </svg>
      );
  }
};

export const AdminPanel = ({ language, isOnline, uid, onLanguageChange, user, userRole }: AdminPanelProps) => {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const [page, setPage] = useState<AdminPage>("dashboard");

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
    emailSignature: "",
    signatureLogoUrl: "",
    appointmentEmailSubject: "",
    appointmentEmailBody: "",
    reportEmailSubject: "",
    reportEmailBody: "",
    leckortungEmailSubject: "",
    leckortungEmailBody: ""
  });
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [smtpPass, setSmtpPass] = useState("");
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpTab, setSmtpTab] = useState<"templates" | "config">("templates");
  const [signatureLogoFile, setSignatureLogoFile] = useState<File | null>(null);
  const [signatureLogoPreview, setSignatureLogoPreview] = useState<string>("");
  const [expandedTemplate, setExpandedTemplate] = useState<"appointment" | "report" | "leckortung" | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; msg: string } | null>(null);

  // App status state
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Brand state
  const [brandName, setBrandName] = useState("LeakOps CRM");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [faviconUrl, setFaviconUrl] = useState("");
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);

  // AI config state
  const [aiConfig, setAiConfig] = useState<AiConfig>({ textModel: "gemini-2.0-flash-lite", visionModel: "gemini-2.0-flash" });
  const [aiApiKey, setAiApiKey] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  // Prompts state
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AiPrompt | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Testdata state
  const [deletingReports, setDeletingReports] = useState(false);
  const [seedingClients, setSeedingClients] = useState(false);

  const [devMode, setDevMode] = useState<boolean>(() => {
    return localStorage.getItem("leakops_dev_mode") === "true";
  });

  const handleDevModeChange = (enabled: boolean) => {
    setDevMode(enabled);
    localStorage.setItem("leakops_dev_mode", enabled ? "true" : "false");
  };

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  };

  const handleError = (err: unknown) => {
    setError(err instanceof Error ? err.message : t("Fehler", "Error desconocido"));
  };

  const handleDeleteAllReports = async () => {
    if (!window.confirm(t("Alle Berichte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.", "¿Eliminar TODOS los informes? Esta acción no se puede deshacer."))) return;
    setDeletingReports(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "deleteAllReports");
      const result = await fn({}) as { data: { deleted: number } };
      showNotice(t(`${result.data.deleted} Berichte gelöscht.`, `${result.data.deleted} informes eliminados.`));
    } catch (err) {
      handleError(err);
    } finally {
      setDeletingReports(false);
    }
  };

  const handleSeedDemoClients = async () => {
    if (!window.confirm(t("15 Demo-Kunden mit Berichten anlegen?", "¿Crear 15 clientes de ejemplo con informes?"))) return;
    setSeedingClients(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "seedDemoClients");
      const result = await fn({}) as { data: { clients: number } };
      showNotice(t(`${result.data.clients} Kunden angelegt.`, `${result.data.clients} clientes creados.`));
    } catch (err) {
      handleError(err);
    } finally {
      setSeedingClients(false);
    }
  };

  const pageLabel = (targetPage: AdminPage) => {
    switch (targetPage) {
      case "dashboard":
        return t("Dashboard", "Dashboard");
      case "users":
        return t("Benutzer", "Usuarios");
      case "appearance":
        return t("Aussehen", "Apariencia");
      case "smtp":
        return t("E-Mail / SMTP", "Email / SMTP");
      case "status":
        return t("Systemstatus", "Estado del sistema");
      case "templates":
        return t("PDF-Vorlagen", "Plantillas PDF");
      case "settings":
        return t("Profil & System", "Perfil y sistema");
      case "ia":
        return t("KI / Gemini", "IA / Gemini");
      case "prompts":
        return t("Prompts", "Prompts");
      case "testdata":
        return t("Testdaten", "Datos de prueba");
      case "ayuda":
        return t("Hilfe", "Ayuda");
    }
  };

  const pageSummary = (targetPage: AdminPage) => {
    switch (targetPage) {
      case "users":
        return t("Konten, Rollen und Zugänge", "Cuentas, roles y accesos");
      case "appearance":
        return t("Marke, Farben und Favicon", "Marca, colores y favicon");
      case "smtp":
        return t("Postausgang und Vorlagen", "Correo saliente y plantillas");
      case "prompts":
        return t("Texte für KI-Workflows", "Textos para flujos de IA");
      case "testdata":
        return t("Demo-Kunden anlegen und Berichte zurücksetzen.", "Crear clientes de ejemplo y limpiar informes.");
      default:
        return "";
    }
  };

  const groupLabel = (group: AdminGroupKey) => {
    switch (group) {
      case "team":
        return t("Team", "Equipo");
      case "appearance":
        return t("Aussehen", "Apariencia");
      case "documents":
        return t("Dokumente", "Documentos");
      case "messaging":
        return t("Nachrichten", "Mensajería");
      case "ai":
        return t("KI", "IA");
      case "system":
        return t("System", "Sistema");
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, UserRecord[]>(functions, "listUsers");
      const res = await fn({});
      setUsers(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSmtpConfig = async () => {
    setLoadingSmtp(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, SmtpConfig>(functions, "getSmtpConfig");
      const res = await fn({});
      setSmtp(res.data);
      setSignatureLogoPreview(res.data.signatureLogoUrl || "");
      setSignatureLogoFile(null);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingSmtp(false);
    }
  };

  const loadBrandingConfig = async () => {
    setError("");
    try {
      const snap = await getDoc(doc(db, "config", "branding"));
      const data = snap.exists() ? (snap.data() as Partial<BrandingConfig>) : {};
      setBrandName(String(data.companyName || "LeakOps CRM"));
      setBrandLogoUrl(String(data.logoUrl || ""));
      setPrimaryColor(normalizeHexColor(data.primaryColor, DEFAULT_PRIMARY_COLOR));
      setFaviconUrl(String(data.faviconUrl || ""));
      setLogoFile(null);
      setFaviconFile(null);
    } catch (err) {
      handleError(err);
    }
  };

  const loadAppStatus = async () => {
    setLoadingStatus(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, AppStatus>(functions, "getAppStatus");
      const res = await fn({});
      setAppStatus(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadAiConfiguration = async () => {
    setLoadingAi(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, AiConfig>(functions, "getAiConfig");
      const res = await fn({});
      setAiConfig(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingAi(false);
    }
  };

  const loadPrompts = async () => {
    setLoadingPrompts(true);
    setError("");
    try {
      const fn = httpsCallable<unknown, AiPrompt[]>(functions, "getPrompts");
      const res = await fn({});
      setPrompts(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingPrompts(false);
    }
  };

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!faviconFile) {
      setFaviconPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(faviconFile);
    setFaviconPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [faviconFile]);

  useEffect(() => {
    if (!signatureLogoFile) return;
    const previewUrl = URL.createObjectURL(signatureLogoFile);
    setSignatureLogoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [signatureLogoFile]);

  // ── Load users when page is active ─────────────────────────────────────────
  useEffect(() => {
    if (page !== "users") return;
    void loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load SMTP when page is active ──────────────────────────────────────────
  useEffect(() => {
    if (page !== "smtp") return;
    void loadSmtpConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load brand when page is active ─────────────────────────────────────────
  useEffect(() => {
    if (page !== "appearance") return;
    void loadBrandingConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load app status when dashboard or status is active ────────────────────
  useEffect(() => {
    if (page !== "dashboard" && page !== "status") return;
    void loadAppStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load AI config when dashboard, status or IA is active ─────────────────
  useEffect(() => {
    if (page !== "dashboard" && page !== "status" && page !== "ia") return;
    void loadAiConfiguration();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Load prompts when page is active ──────────────────────────────────────
  useEffect(() => {
    if (page !== "prompts") return;
    void loadPrompts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Create user ────────────────────────────────────────────────────────────
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
      await loadUsers();
    } catch (err) {
      handleError(err);
    } finally {
      setCreatingUser(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggleActive = async (targetUid: string, currentActive: boolean) => {
    if (targetUid === uid) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "updateUser");
      await fn({ targetUid, active: !currentActive });
      setUsers((prev) => prev.map((entry) => entry.uid === targetUid ? { ...entry, active: !currentActive } : entry));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Change role ────────────────────────────────────────────────────────────
  const handleChangeRole = async (targetUid: string, role: UserRole) => {
    if (targetUid === uid) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "updateUser");
      await fn({ targetUid, role });
      setUsers((prev) => prev.map((entry) => entry.uid === targetUid ? { ...entry, role } : entry));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Delete user ────────────────────────────────────────────────────────────
  const handleDeleteUser = async (targetUid: string, email: string) => {
    if (targetUid === uid) return;
    if (!window.confirm(t(`Benutzer ${email} wirklich löschen?`, `¿Eliminar al usuario ${email}?`))) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "deleteUser");
      await fn({ targetUid });
      setUsers((prev) => prev.filter((entry) => entry.uid !== targetUid));
      showNotice(t("Benutzer gelöscht.", "Usuario eliminado."));
    } catch (err) {
      handleError(err);
    }
  };

  // ── Save SMTP ──────────────────────────────────────────────────────────────
  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    setError("");
    try {
      let nextSignatureLogoUrl = smtp.signatureLogoUrl;

      if (signatureLogoFile) {
        const storageRef = ref(storage, "branding/signature-logo");
        await uploadBytes(storageRef, signatureLogoFile, signatureLogoFile.type ? { contentType: signatureLogoFile.type } : undefined);
        nextSignatureLogoUrl = await getDownloadURL(storageRef);
        setSmtp((prev) => ({ ...prev, signatureLogoUrl: nextSignatureLogoUrl }));
        setSignatureLogoFile(null);
      }

      const fn = httpsCallable(functions, "saveSmtpConfig");
      await fn({
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        from: smtp.from,
        pass: smtpPass || undefined,
        emailSignature: smtp.emailSignature,
        signatureLogoUrl: nextSignatureLogoUrl,
        appointmentEmailSubject: smtp.appointmentEmailSubject,
        appointmentEmailBody: smtp.appointmentEmailBody,
        reportEmailSubject: smtp.reportEmailSubject,
        reportEmailBody: smtp.reportEmailBody,
        leckortungEmailSubject: smtp.leckortungEmailSubject,
        leckortungEmailBody: smtp.leckortungEmailBody
      });
      setSmtpPass("");
      showNotice(t("SMTP-Konfiguration gespeichert.", "Configuración SMTP guardada."));
      await loadSmtpConfig();
    } catch (err) {
      handleError(err);
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSendTestEmail = async (subject: string, body: string, signature: string) => {
    setSendingTestEmail(true);
    setTestEmailResult(null);
    setError("");
    try {
      const fn = httpsCallable(functions, "sendTestEmail");
      await fn({ subject, body, signature });
      setTestEmailResult({ success: true, msg: t("Test-E-Mail erfolgreich gesendet.", "Correo de prueba enviado correctamente.") });
      showNotice(t("Test-E-Mail gesendet.", "Correo de prueba enviado."));
    } catch (err) {
      handleError(err);
      setTestEmailResult({ success: false, msg: t("Fehler beim Senden der Test-E-Mail.", "Error al enviar el correo de prueba.") });
    } finally {
      setSendingTestEmail(false);
    }
  };

  // ── Save brand ─────────────────────────────────────────────────────────────
  const handleSaveBrand = async () => {
    setSavingBrand(true);
    setError("");
    try {
      let nextLogoUrl = brandLogoUrl;
      let nextFaviconUrl = faviconUrl;

      if (logoFile) {
        const storageRef = ref(storage, "branding/logo");
        await uploadBytes(storageRef, logoFile, logoFile.type ? { contentType: logoFile.type } : undefined);
        nextLogoUrl = await getDownloadURL(storageRef);
      }

      if (faviconFile) {
        const storageRef = ref(storage, "branding/favicon");
        await uploadBytes(storageRef, faviconFile, faviconFile.type ? { contentType: faviconFile.type } : undefined);
        nextFaviconUrl = await getDownloadURL(storageRef);
      }

      const payload: BrandingConfig = {
        companyName: brandName.trim() || "LeakOps CRM",
        logoUrl: nextLogoUrl,
        primaryColor: normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR),
        faviconUrl: nextFaviconUrl
      };

      await setDoc(doc(db, "config", "branding"), payload, { merge: true });
      setBrandName(payload.companyName);
      setBrandLogoUrl(nextLogoUrl);
      setPrimaryColor(payload.primaryColor || DEFAULT_PRIMARY_COLOR);
      setFaviconUrl(nextFaviconUrl);
      setLogoFile(null);
      setFaviconFile(null);
      showNotice(t("Erscheinungsbild gespeichert.", "Apariencia guardada."));
    } catch (err) {
      handleError(err);
    } finally {
      setSavingBrand(false);
    }
  };

  // ── Save AI config ─────────────────────────────────────────────────────────
  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "saveAiConfig");
      await fn({ apiKey: aiApiKey || undefined, textModel: aiConfig.textModel, visionModel: aiConfig.visionModel });
      setAiApiKey("");
      showNotice(t("KI-Konfiguration gespeichert.", "Configuración IA guardada."));
      await loadAiConfiguration();
    } catch (err) {
      handleError(err);
    } finally {
      setSavingAi(false);
    }
  };

  // ── Save prompt ────────────────────────────────────────────────────────────
  const handleSavePrompt = async (prompt: AiPrompt) => {
    setError("");
    try {
      const fn = httpsCallable(functions, "savePrompt");
      await fn(prompt);
      showNotice(t("Prompt gespeichert.", "Prompt guardado."));
      setShowPromptModal(false);
      setEditingPrompt(null);
      await loadPrompts();
    } catch (err) {
      handleError(err);
    }
  };

  // ── Delete prompt ──────────────────────────────────────────────────────────
  const handleDeletePrompt = async (id: string) => {
    if (!window.confirm(t("Prompt wirklich löschen?", "¿Eliminar este prompt?"))) return;
    setError("");
    try {
      const fn = httpsCallable(functions, "deletePrompt");
      await fn({ id });
      showNotice(t("Prompt gelöscht.", "Prompt eliminado."));
      setPrompts((prev) => prev.filter((prompt) => prompt.id !== id));
    } catch (err) {
      handleError(err);
    }
  };

  const handleTogglePromptActive = async (prompt: AiPrompt) => {
    const updated = { ...prompt, isActive: prompt.isActive === false ? true : false };
    await handleSavePrompt(updated);
  };

  const handleDuplicatePrompt = (prompt: AiPrompt) => {
    const newPrompt: AiPrompt = {
      ...prompt,
      id: `${prompt.id}_copy_${Math.floor(Math.random() * 1000)}`,
      name: `${prompt.name} (Copia)`,
      isDefault: false,
      isActive: false, // Copias inician desactivadas por seguridad
      version: "v1.0"
    };
    setEditingPrompt(newPrompt);
    setShowPromptModal(true);
  };

  const purposeLabel = (purpose: AiPromptPurpose) => {
    if (purpose === "photo_description") return t("Fotobeschreibung", "Descripción de foto");
    if (purpose === "damage_summary") return t("Schadenzusammenfassung", "Resumen de daños");
    return t("Allgemein", "General");
  };

  const getAllowedVariables = (purpose: AiPromptPurpose) => {
    if (purpose === "photo_description") return ["{{userText}}"];
    if (purpose === "damage_summary") return ["{{damage}}", "{{findings}}", "{{actions}}"];
    return ["{{context}}", "{{damage}}", "{{findings}}", "{{actions}}", "{{userText}}"];
  };

  const getUnrecognizedVariables = (text: string, allowed: string[]) => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return matches.filter(match => !allowed.includes(match));
  };

  const roleLabel = (role: UserRole) =>
    role === "admin" ? t("Admin", "Admin") : role === "office" ? t("Büro", "Oficina") : t("Techniker", "Técnico");

  const logoPreview = logoPreviewUrl || brandLogoUrl;
  const faviconPreview = faviconPreviewUrl || faviconUrl || brandLogoUrl;
  const aiConfigured = Boolean(aiConfig.hasKey);

  const renderDashboard = () => (
    <div className="stack">
      <SectionCard
        title={t("Admin-Dashboard", "Dashboard admin")}
        description={t(
          "Wichtige Kennzahlen, Konfiguration und Systemzustand auf einen Blick.",
          "Métricas clave, configuración y estado del sistema de un vistazo."
        )}
        actions={
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void loadAppStatus();
              void loadAiConfiguration();
            }}
            disabled={!isOnline || loadingStatus || loadingAi}
          >
            {t("Aktualisieren", "Actualizar")}
          </button>
        }
      >
        <div className="stack">
          <div className="admin-stat-grid">
            <div className="admin-stat-card">
              <span className="admin-stat-card__value">{appStatus?.users.total ?? "—"}</span>
              <span className="admin-stat-card__label">{t("Benutzer", "Usuarios")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-card__value">{appStatus?.reports.total ?? "—"}</span>
              <span className="admin-stat-card__label">{t("Informes", "Informes")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-card__value">{appStatus?.reports.byStatus.draft ?? "—"}</span>
              <span className="admin-stat-card__label">{t("Entwürfe", "Borradores")}</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-card__value">{appStatus?.reports.byStatus.finalized ?? "—"}</span>
              <span className="admin-stat-card__label">{t("Finalisiert", "Finalizados")}</span>
            </div>
            <div className={`admin-stat-card ${appStatus?.smtp.configured ? "admin-stat-card--ok" : "admin-stat-card--warn"}`}>
              <span className="admin-stat-card__label">SMTP</span>
              <strong>{appStatus?.smtp.configured ? "✓" : "✕"}</strong>
            </div>
            <div className={`admin-stat-card ${aiConfigured ? "admin-stat-card--ok" : "admin-stat-card--warn"}`}>
              <span className="admin-stat-card__label">IA</span>
              <strong>{aiConfigured ? "✓" : "✕"}</strong>
            </div>
          </div>

          {loadingStatus && !appStatus ? (
            <p>{t("Lade Status...", "Cargando estado...")}</p>
          ) : appStatus ? (
            <div className="admin-status-grid">
              <div className="admin-status-block">
                <h4>{t("Benutzerverteilung", "Distribución de usuarios")}</h4>
                <ul>
                  <li>{t("Techniker", "Técnicos")}: <strong>{appStatus.users.byRole.technician}</strong></li>
                  <li>{t("Büro", "Oficina")}: <strong>{appStatus.users.byRole.office}</strong></li>
                  <li>{t("Admins", "Admins")}: <strong>{appStatus.users.byRole.admin}</strong></li>
                  <li>{t("Inaktiv", "Inactivos")}: <strong>{appStatus.users.byRole.inactive}</strong></li>
                </ul>
              </div>
              <div className="admin-status-block">
                <h4>{t("Berichtsstatus", "Estado de informes")}</h4>
                <ul>
                  <li>{t("Gesamt", "Total")}: <strong>{appStatus.reports.total}</strong></li>
                  <li>{t("Entwürfe", "Borradores")}: <strong>{appStatus.reports.byStatus.draft}</strong></li>
                  <li>{t("Finalisiert", "Finalizados")}: <strong>{appStatus.reports.byStatus.finalized}</strong></li>
                </ul>
              </div>
              <div className="admin-status-block">
                <h4>{t("Systemzustand", "Estado del sistema")}</h4>
                <ul>
                  <li>
                    {t("Verbindung", "Conectividad")}:{" "}
                    <StatusChip tone={isOnline ? "success" : "danger"}>
                      {isOnline ? t("Online", "Online") : t("Offline", "Offline")}
                    </StatusChip>
                  </li>
                  <li>
                    SMTP:{" "}
                    <StatusChip tone={appStatus.smtp.configured ? "success" : "warning"}>
                      {appStatus.smtp.configured ? t("Konfiguriert", "Configurado") : t("Ausstehend", "Pendiente")}
                    </StatusChip>
                  </li>
                  <li>
                    IA:{" "}
                    <StatusChip tone={aiConfigured ? "success" : "warning"}>
                      {aiConfigured ? t("Aktiv", "Activa") : t("Ohne API-Key", "Sin API Key")}
                    </StatusChip>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <p>{t("Keine Daten verfügbar.", "No hay datos disponibles.")}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={t("Schnellzugriffe", "Accesos rápidos")}
        description={t(
          "Springe direkt zu den Bereichen, die im Alltag am häufigsten genutzt werden.",
          "Salta directamente a las secciones que más se usan en el día a día."
        )}
      >
        <div className="admin-quick-actions">
          {QUICK_ACTIONS.map((targetPage) => (
            <button key={targetPage} type="button" className="admin-action-card" onClick={() => setPage(targetPage)}>
              <span className="admin-action-card__icon">
                <AdminNavIcon page={targetPage} />
              </span>
              <span className="admin-action-card__copy">
                <strong>{pageLabel(targetPage)}</strong>
                <small>{pageSummary(targetPage)}</small>
              </span>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  const renderStatusPage = () => (
    <SectionCard
      title={t("App-Status", "Estado de la app")}
      description={t("Übersicht über Benutzer, Berichte und Systemkonfiguration.", "Resumen de usuarios, informes y configuración del sistema.")}
      actions={
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void loadAppStatus();
            void loadAiConfiguration();
          }}
          disabled={!isOnline || loadingStatus || loadingAi}
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
              <li>
                IA:{" "}
                <StatusChip tone={aiConfigured ? "success" : "warning"}>
                  {aiConfigured ? t("OK", "OK") : t("Ohne API-Key", "Sin API Key")}
                </StatusChip>
              </li>
              <li>
                {t("Verbindung", "Conectividad")}:{" "}
                <StatusChip tone={isOnline ? "success" : "danger"}>
                  {isOnline ? t("Online", "Online") : t("Offline", "Offline")}
                </StatusChip>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <p>{t("Keine Daten verfügbar.", "No hay datos disponibles.")}</p>
      )}
    </SectionCard>
  );

  const renderPageContent = () => {
    if (page === "dashboard") {
      return renderDashboard();
    }

    if (page === "users") {
      return (
        <SectionCard
          title={t("Benutzerverwaltung", "Gestión de usuarios")}
          description={t("Erstelle, bearbeite oder deaktiviere App-Benutzer.", "Crea, edita o desactiva usuarios de la app.")}
          actions={
            <button type="button" className="btn-primary" onClick={() => setShowCreateForm((value) => !value)} disabled={!isOnline}>
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
                    onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="user@example.com"
                  />
                </label>
                <label>
                  {t("Passwort", "Contraseña")}
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="••••••••"
                  />
                </label>
                <label>
                  {t("Name", "Nombre")}
                  <input
                    value={newUser.displayName}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, displayName: event.target.value }))}
                    placeholder={t("Vollständiger Name", "Nombre completo")}
                  />
                </label>
                <label>
                  {t("Rolle", "Rol")}
                  <select
                    value={newUser.role}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value as UserRole }))}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
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
              {users.map((entry) => (
                <div key={entry.uid} className="admin-user-table__row">
                  <div>
                    <strong>{entry.displayName || entry.email}</strong>
                    {entry.displayName && <small>{entry.email}</small>}
                    {entry.uid === uid && <StatusChip tone="info">{t("Ich", "Yo")}</StatusChip>}
                  </div>
                  <div>
                    <select
                      value={entry.role}
                      disabled={entry.uid === uid || !isOnline}
                      onChange={(event) => void handleChangeRole(entry.uid, event.target.value as UserRole)}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <StatusChip tone={entry.active ? "success" : "danger"}>
                      {entry.active ? t("Aktiv", "Activo") : t("Inaktiv", "Inactivo")}
                    </StatusChip>
                  </div>
                  <div className="admin-user-table__actions">
                    <button
                      type="button"
                      className="ghost small"
                      disabled={entry.uid === uid || !isOnline}
                      onClick={() => void handleToggleActive(entry.uid, entry.active)}
                    >
                      {entry.active ? t("Deaktivieren", "Desactivar") : t("Aktivieren", "Activar")}
                    </button>
                    <button
                      type="button"
                      className="ghost small danger"
                      disabled={entry.uid === uid || !isOnline}
                      onClick={() => void handleDeleteUser(entry.uid, entry.email)}
                    >
                      {t("Löschen", "Eliminar")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      );
    }

    if (page === "smtp") {
      return (
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
              <div className="smtp-tabs">
                <button 
                  className={`smtp-tab ${smtpTab === "templates" ? "active" : ""}`} 
                  onClick={() => setSmtpTab("templates")}
                >
                  {t("Plantillas de correo", "Plantillas de correo")}
                </button>
                {devMode && (
                  <button 
                    className={`smtp-tab ${smtpTab === "config" ? "active" : ""}`} 
                    onClick={() => setSmtpTab("config")}
                  >
                    {t("SMTP Server", "Servidor SMTP")}
                  </button>
                )}
              </div>

              {smtpTab === "config" && devMode && (
                <>
                  <div className="grid two">
                    <label>
                      {t("Host", "Servidor SMTP")}
                      <input
                        value={smtp.host}
                        onChange={(event) => setSmtp((prev) => ({ ...prev, host: event.target.value }))}
                        placeholder="smtp.example.com"
                      />
                    </label>
                    <label>
                      {t("Port", "Puerto")}
                      <input
                        type="number"
                        value={smtp.port}
                        onChange={(event) => setSmtp((prev) => ({ ...prev, port: Number(event.target.value) }))}
                        placeholder="587"
                      />
                    </label>
                    <label>
                      {t("Benutzername", "Usuario SMTP")}
                      <input
                        value={smtp.user}
                        onChange={(event) => setSmtp((prev) => ({ ...prev, user: event.target.value }))}
                        placeholder="user@example.com"
                      />
                    </label>
                    <label>
                      {t("Absender-Adresse (From)", "Dirección remitente (From)")}
                      <input
                        value={smtp.from}
                        onChange={(event) => setSmtp((prev) => ({ ...prev, from: event.target.value }))}
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
                        onChange={(event) => setSmtpPass(event.target.value)}
                        placeholder={smtp.hasPass ? "••••••••" : t("Passwort eingeben", "Introduce la contraseña")}
                      />
                    </label>
                  </div>
                  <div className="smtp-status-row">
                    <StatusChip tone={smtp.configured ? "success" : "warning"}>
                      {smtp.configured ? t("Konfiguriert", "Configurado") : t("Nicht konfiguriert", "Sin configurar")}
                    </StatusChip>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSaveSmtp()}
                    disabled={savingSmtp || !isOnline}
                    style={{ alignSelf: "flex-start", marginTop: "16px" }}
                  >
                    {savingSmtp ? t("Speichert...", "Guardando...") : t("Speichern", "Guardar configuración")}
                  </button>
                </>
              )}

              {smtpTab === "templates" && (
                <>
                  <div className="admin-template-box" style={{ marginBottom: "16px" }}>
                    <h4>{t("E-Mail-Vorlagen konfigurieren", "Configura las plantillas de correo")}</h4>
                    <p>
                      {t(
                        "Nutze Platzhalter wie {{clientName}}, {{appointmentDate}}, {{locationObject}}, {{technicianName}}, {{projectNumber}}, {{senderName}}, {{recipientEmail}} oder {{signature}}.",
                        "Configura los textos automáticos que se enviarán al cliente. Usa variables para personalizar cada mensaje."
                      )}
                    </p>
                  </div>

                  <div className="stack">
                    <label className="smtp-label" style={{ marginBottom: "8px" }}>
                      {t("Globale E-Mail-Signatur", "Firma global de correo")}
                      <textarea
                        className="smtp-textarea"
                        style={{ minHeight: "120px" }}
                        value={smtp.emailSignature}
                        onChange={(event) => setSmtp((prev) => ({ ...prev, emailSignature: event.target.value }))}
                        placeholder={t("Mit freundlichen Grüßen\nIhr Team", "Atentamente,\nEl equipo")}
                      />
                      <small style={{ color: "var(--ink-muted)", fontWeight: "normal" }}>
                        {t("Wird an jede gesendete E-Mail angehängt.", "Se añade automáticamente al final de cada correo si usas la variable {{signature}}.")}
                      </small>
                    </label>

                    <div className="smtp-logo-signature-block">
                      <span className="smtp-label" style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
                        {t("Unternehmenslogo in der Signatur", "Logo de empresa en la firma")}
                      </span>

                      {signatureLogoPreview ? (
                        <div className="smtp-logo-preview">
                          <img
                            src={signatureLogoPreview}
                            alt={t("Logo-Vorschau", "Vista previa del logo")}
                            style={{ maxHeight: "80px", maxWidth: "240px", objectFit: "contain", borderRadius: "6px", border: "1px solid var(--border-subtle, #e5e7eb)", padding: "6px", background: "#fff" }}
                          />
                          <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                            <label className="ghost small" style={{ cursor: "pointer", display: "inline-block" }}>
                              {t("Ändern", "Cambiar")}
                              <input
                                type="file"
                                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                                style={{ display: "none" }}
                                onChange={(event) => setSignatureLogoFile(event.target.files?.[0] ?? null)}
                              />
                            </label>
                            <button
                              type="button"
                              className="ghost small danger"
                              onClick={() => {
                                setSignatureLogoFile(null);
                                setSignatureLogoPreview("");
                                setSmtp((prev) => ({ ...prev, signatureLogoUrl: "" }));
                              }}
                            >
                              {t("Entfernen", "Eliminar logo")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label style={{ cursor: "pointer", display: "inline-block" }}>
                          <div
                            className="smtp-logo-dropzone"
                            style={{
                              border: "2px dashed var(--border-subtle, #d1d5db)",
                              borderRadius: "10px",
                              padding: "20px 28px",
                              textAlign: "center",
                              color: "var(--ink-muted)",
                              fontSize: "13px",
                              background: "var(--surface-secondary, #f9fafb)",
                              transition: "border-color 0.2s"
                            }}
                          >
                            <div style={{ fontSize: "24px", marginBottom: "4px" }}>🖼️</div>
                            <div>{t("Logo hochladen (PNG / SVG / WebP / JPG)", "Subir logo (PNG / SVG / WebP / JPG)")}</div>
                            <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.7 }}>
                              {t("Erscheint im unteren Bereich der E-Mail-Signatur", "Aparecerá en la parte inferior de la firma del correo")}
                            </div>
                          </div>
                          <input
                            type="file"
                            accept="image/png,image/svg+xml,image/webp,image/jpeg"
                            style={{ display: "none" }}
                            onChange={(event) => setSignatureLogoFile(event.target.files?.[0] ?? null)}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <SmtpTemplateEditor
                    language={language}
                    title={t("Terminbestätigung", "Confirmación de visita técnica")}
                    subject={smtp.appointmentEmailSubject}
                    body={smtp.appointmentEmailBody}
                    signature={smtp.emailSignature}
                    isExpanded={expandedTemplate === "appointment"}
                    onToggle={() => setExpandedTemplate(prev => prev === "appointment" ? null : "appointment")}
                    onChange={(s, b) => setSmtp(prev => ({ ...prev, appointmentEmailSubject: s, appointmentEmailBody: b }))}
                    onSave={handleSaveSmtp}
                    onSendTest={() => handleSendTestEmail(smtp.appointmentEmailSubject, smtp.appointmentEmailBody, smtp.emailSignature)}
                    saving={savingSmtp}
                    sendingTest={sendingTestEmail}
                  />

                  <SmtpTemplateEditor
                    language={language}
                    title={t("Einsatzbericht", "Envío de informe")}
                    subject={smtp.reportEmailSubject}
                    body={smtp.reportEmailBody}
                    signature={smtp.emailSignature}
                    isExpanded={expandedTemplate === "report"}
                    onToggle={() => setExpandedTemplate(prev => prev === "report" ? null : "report")}
                    onChange={(s, b) => setSmtp(prev => ({ ...prev, reportEmailSubject: s, reportEmailBody: b }))}
                    onSave={handleSaveSmtp}
                    onSendTest={() => handleSendTestEmail(smtp.reportEmailSubject, smtp.reportEmailBody, smtp.emailSignature)}
                    saving={savingSmtp}
                    sendingTest={sendingTestEmail}
                  />

                  <SmtpTemplateEditor
                    language={language}
                    title={t("Leckortung", "Leckortung")}
                    subject={smtp.leckortungEmailSubject}
                    body={smtp.leckortungEmailBody}
                    signature={smtp.emailSignature}
                    isExpanded={expandedTemplate === "leckortung"}
                    onToggle={() => setExpandedTemplate(prev => prev === "leckortung" ? null : "leckortung")}
                    onChange={(s, b) => setSmtp(prev => ({ ...prev, leckortungEmailSubject: s, leckortungEmailBody: b }))}
                    onSave={handleSaveSmtp}
                    onSendTest={() => handleSendTestEmail(smtp.leckortungEmailSubject, smtp.leckortungEmailBody, smtp.emailSignature)}
                    saving={savingSmtp}
                    sendingTest={sendingTestEmail}
                  />

                  {testEmailResult && (
                    <div className="smtp-status-row" style={{ marginTop: "16px" }}>
                      <StatusChip tone={testEmailResult.success ? "success" : "danger"}>
                        {testEmailResult.msg}
                      </StatusChip>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </SectionCard>
      );
    }

    if (page === "status") {
      return renderStatusPage();
    }

    if (page === "appearance") {
      return (
        <SectionCard
          title={t("Marke & Erscheinungsbild", "Marca y apariencia")}
          description={t(
            "Name, Logo, Favicon und Primärfarbe der App an einem Ort verwalten.",
            "Gestiona el nombre, logo, favicon y color primario de la app desde un solo lugar."
          )}
        >
          <div className="stack">
            <label>
              {t("Unternehmensname", "Nombre de empresa")}
              <input
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="LeakOps CRM"
              />
            </label>

            <div className="admin-appearance-grid">
              <label>
                {t("Logo-Datei (PNG / SVG / WebP / JPG)", "Archivo de logo (PNG / SVG / WebP / JPG)")}
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label>
                {t("Favicon (PNG / SVG / ICO / WebP)", "Favicon (PNG / SVG / ICO / WebP)")}
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/x-icon,image/webp"
                  onChange={(event) => setFaviconFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="admin-preview-grid">
              <div className="brand-logo-preview">
                <div className="admin-preview-card">
                  <span className="admin-preview-card__label">{t("Logo-Vorschau", "Vista previa del logo")}</span>
                  {logoPreview ? (
                    <img src={logoPreview} alt={t("Logo-Vorschau", "Vista previa del logo")} />
                  ) : (
                    <div className="admin-preview-card__empty">{t("Noch kein Logo", "Sin logo todavía")}</div>
                  )}
                </div>
              </div>
              <div className="brand-logo-preview">
                <div className="admin-preview-card">
                  <span className="admin-preview-card__label">{t("Favicon-Vorschau", "Vista previa del favicon")}</span>
                  {faviconPreview ? (
                    <img src={faviconPreview} alt={t("Favicon-Vorschau", "Vista previa del favicon")} className="admin-preview-card__favicon" />
                  ) : (
                    <div className="admin-preview-card__empty">{t("Noch kein Favicon", "Sin favicon todavía")}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-theme-panel">
              <div className="admin-theme-panel__header">
                <div>
                  <strong>{t("Primärfarbe", "Color primario")}</strong>
                  <p>{t("Die Auswahl wird beim Speichern in der ganzen App angewendet.", "La selección se aplicará a toda la app al guardar.")}</p>
                </div>
                <span className="admin-inline-status" style={{ backgroundColor: primaryColor }} />
              </div>

              <div className="color-preset-grid">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`color-swatch ${normalizeHexColor(primaryColor) === preset.value ? "active" : ""}`}
                    style={{ backgroundColor: preset.value }}
                    onClick={() => setPrimaryColor(preset.value)}
                    title={preset.name}
                    aria-label={preset.name}
                  />
                ))}
                <label className="admin-color-custom">
                  <span>{t("Eigener Hex-Wert", "Hex personalizado")}</span>
                  <input
                    type="color"
                    value={normalizeHexColor(primaryColor)}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                  />
                </label>
                <input
                  value={normalizeHexColor(primaryColor)}
                  onChange={(event) => setPrimaryColor(normalizeHexColor(event.target.value))}
                  placeholder="#135f96"
                />
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSaveBrand()}
              disabled={savingBrand || !isOnline}
            >
              {savingBrand ? t("Speichert...", "Guardando...") : t("Speichern", "Guardar apariencia")}
            </button>
          </div>
        </SectionCard>
      );
    }

    if (page === "templates") {
      return (
        <SectionCard
          title={t("PDF-Vorlagen", "Plantillas PDF")}
          description={t(
            "Verwalte PDF-Plantillas con AcroForm y su versión publicada para formularios web.",
            "Verwalte AcroForm-PDF-Vorlagen und ihre veröffentlichte Version für Webformulare."
          )}
        >
          <TemplateAdminPanel uid={uid} isOnline={isOnline} language={language} />
        </SectionCard>
      );
    }

    if (page === "settings") {
      return (
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
            devMode={devMode}
            onDevModeChange={handleDevModeChange}
          />
        </SectionCard>
      );
    }

    if (page === "ia") {
      return (
        <SectionCard
          title={t("KI-Konfiguration (Gemini)", "Configuración IA (Gemini)")}
          description={t(
            "API-Schlüssel und Modelle für die KI-Funktionen der App.",
            "Clave API y modelos para las funciones de IA de la app."
          )}
        >
          {loadingAi ? (
            <p>{t("Lade...", "Cargando...")}</p>
          ) : (
            <div className="stack">
              <div className="grid two">
                <label className="form-panel__full">
                  {t("Gemini API-Schlüssel", "API Key de Gemini")}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="password"
                      placeholder={aiConfig.hasKey ? t("••••••• (gespeichert)", "••••••• (guardada)") : t("AIza...", "AIza...")}
                      value={aiApiKey}
                      onChange={(event) => setAiApiKey(event.target.value)}
                      disabled={!isOnline}
                      style={{ flex: 1 }}
                    />
                    {aiConfig.hasKey && (
                      <span className="status-chip status-chip--success" style={{ whiteSpace: "nowrap" }}>
                        ✓ {t("Konfiguriert", "Configurada")}
                      </span>
                    )}
                  </div>
                  <small style={{ color: "var(--ink-muted)" }}>
                    {t(
                      "Leer lassen, um den vorhandenen Schlüssel beizubehalten.",
                      "Deja vacío para conservar la clave existente."
                    )}
                  </small>
                </label>

                <label>
                  {t("Textmodell (günstig)", "Modelo de texto (bajo coste)")}
                  <select
                    value={aiConfig.textModel}
                    onChange={(event) => setAiConfig((prev) => ({ ...prev, textModel: event.target.value }))}
                    disabled={!isOnline}
                  >
                    <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  </select>
                  <small style={{ color: "var(--ink-muted)" }}>
                    {t("Für Texte, Zusammenfassungen, schnelle Analyse.", "Para textos, resúmenes, análisis rápido.")}
                  </small>
                </label>

                <label>
                  {t("Bildanalyse-Modell", "Modelo de visión (imágenes)")}
                  <select
                    value={aiConfig.visionModel}
                    onChange={(event) => setAiConfig((prev) => ({ ...prev, visionModel: event.target.value }))}
                    disabled={!isOnline}
                  >
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    <option value="gemini-2.5-flash-preview">gemini-2.5-flash-preview</option>
                  </select>
                  <small style={{ color: "var(--ink-muted)" }}>
                    {t("Für Bildanalyse und technische Fotobeschreibungen.", "Para análisis de fotos e imágenes técnicas.")}
                  </small>
                </label>
              </div>

              <div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveAiConfig}
                  disabled={savingAi || !isOnline}
                >
                  {savingAi ? t("Speichert...", "Guardando...") : t("Speichern", "Guardar configuración")}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      );
    }

    if (page === "prompts") {
      return (
        <SectionCard
          title={t("KI-Prompts", "Prompts de IA")}
          description={t(
            "Verwalte die Prompts, die bei KI-Aufgaben verwendet werden.",
            "Gestiona los prompts que se usan en las tareas de IA."
          )}
          actions={
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingPrompt({
                  id: "",
                  name: "",
                  description: "",
                  content: "",
                  purpose: "general",
                  isDefault: false
                });
                setShowPromptModal(true);
              }}
              disabled={!isOnline}
            >
              {t("+ Prompt", "+ Prompt")}
            </button>
          }
        >
          {loadingPrompts ? (
            <p>{t("Lade...", "Cargando...")}</p>
          ) : (
            <div className="stack">
              {prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  style={{
                    border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)",
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                    background: prompt.isDefault ? "color-mix(in srgb, var(--primary) 8%, white)" : "white"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                        <strong>{prompt.name}</strong>
                        <span className={`status-chip ${prompt.isActive !== false ? "status-chip--success" : "status-chip--neutral"}`} style={{ fontSize: "0.7rem" }}>
                          {prompt.isActive !== false ? t("Aktiv", "Activo") : t("Inaktiv", "Inactivo")}
                        </span>
                        {prompt.isDefault && (
                          <span className="status-chip" style={{ fontSize: "0.7rem" }}>
                            {t("System", "Sistema")}
                          </span>
                        )}
                        <span className="status-chip status-chip--neutral" style={{ fontSize: "0.7rem" }}>
                          {purposeLabel(prompt.purpose)}
                        </span>
                        {prompt.version && (
                          <span className="status-chip status-chip--neutral" style={{ fontSize: "0.7rem" }}>
                            {prompt.version}
                          </span>
                        )}
                      </div>
                      {prompt.description && (
                        <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--ink-muted)" }}>
                          {prompt.description}
                        </p>
                      )}
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "0.78rem",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: "var(--ink-muted)",
                          background: "rgba(0,0,0,0.03)",
                          borderRadius: "6px",
                          padding: "0.5rem 0.75rem",
                          maxHeight: "4.5rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {prompt.content}
                      </pre>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", flexShrink: 0, flexDirection: "column" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingPrompt(prompt);
                          setShowPromptModal(true);
                        }}
                        disabled={!isOnline}
                        style={{ width: "100%" }}
                      >
                        {t("Bearbeiten", "Editar")}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary ghost"
                        onClick={() => handleDuplicatePrompt(prompt)}
                        disabled={!isOnline}
                        style={{ width: "100%" }}
                      >
                        {t("Duplizieren", "Duplicar")}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary ghost"
                        onClick={() => void handleTogglePromptActive(prompt)}
                        disabled={!isOnline}
                        style={{ width: "100%" }}
                      >
                        {prompt.isActive !== false ? t("Deaktivieren", "Desactivar") : t("Aktivieren", "Activar")}
                      </button>
                      {prompt.isDefault ? null : (
                        <button
                          type="button"
                          className="btn-danger ghost"
                          onClick={() => void handleDeletePrompt(prompt.id)}
                          disabled={!isOnline}
                          title={t("Auf Standard zurücksetzen", "Restaurar al valor predeterminado")}
                          style={{ width: "100%" }}
                        >
                          {t("Zurücksetzen", "Restaurar")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {prompts.length === 0 && (
                <p style={{ color: "var(--ink-muted)" }}>
                  {t("Keine Prompts vorhanden.", "No hay prompts configurados.")}
                </p>
              )}
            </div>
          )}
        </SectionCard>
      );
    }

    if (page === "testdata") {
      return (
        <SectionCard
          title={t("Testdaten", "Datos de prueba")}
          description={t(
            "Hilfsfunktionen zum Befüllen und Leeren der Datenbank für Test- und Demozwecke.",
            "Funciones auxiliares para poblar y limpiar la base de datos para pruebas y demos."
          )}
        >
          <div className="stack">
            <div className="admin-template-box">
              <h4>{t("Demo-Kunden anlegen", "Crear clientes de ejemplo")}</h4>
              <p>{t("Legt 15 realistische Testkunden mit je 1-2 Berichten an. Vorhandene Daten werden nicht gelöscht.", "Crea 15 clientes de ejemplo realistas con 1-2 informes cada uno. Los datos existentes no se eliminan.")}</p>
              <button
                type="button"
                onClick={() => void handleSeedDemoClients()}
                disabled={seedingClients || !isOnline}
              >
                {seedingClients ? t("Wird angelegt...", "Creando...") : t("15 Kunden anlegen", "Crear 15 clientes")}
              </button>
            </div>

            <div className="admin-template-box" style={{ borderColor: "#fca5a5" }}>
              <h4 style={{ color: "#b91c1c" }}>{t("⚠ Alle Berichte löschen", "⚠ Borrar todos los informes")}</h4>
              <p>{t("Löscht alle Berichte aus der Datenbank. Kunden bleiben erhalten. Diese Aktion kann nicht rückgängig gemacht werden.", "Elimina todos los informes de la base de datos. Los clientes no se eliminan. Esta acción no se puede deshacer.")}</p>
              <button
                type="button"
                className="ghost"
                style={{ borderColor: "#ef4444", color: "#b91c1c" }}
                onClick={() => void handleDeleteAllReports()}
                disabled={deletingReports || !isOnline}
              >
                {deletingReports ? t("Löscht...", "Eliminando...") : t("Alle Berichte löschen", "Borrar todos los informes")}
              </button>
            </div>
          </div>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title={t("Hilfe & Support", "Ayuda y soporte")}
        description={t(
          "Kurzanleitungen und Kontakt zum Support-Team.",
          "Guías rápidas y contacto con el equipo de soporte."
        )}
      >
        <div className="stack">
          <details open style={{ border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>
              {t("Wie erstelle ich einen Bericht?", "¿Cómo crear un informe?")}
            </summary>
            <ol style={{ margin: "0.75rem 0 0 1rem", lineHeight: 1.7 }}>
              <li>{t('Gehe zu „Arbeit" → „Neuer Bericht"', 'Ve a "Trabajo" → "Nuevo informe"')}</li>
              <li>{t("Wähle Unternehmen und Kunden", "Selecciona empresa y cliente")}</li>
              <li>{t("Fülle die technischen Schritte aus", "Completa los pasos técnicos")}</li>
              <li>{t("Füge Fotos hinzu (bis zu 15)", "Añade fotos (hasta 15)")}</li>
              <li>{t("Schließe ab, um das PDF zu generieren", "Finaliza para generar el PDF")}</li>
            </ol>
          </details>

          <details style={{ border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>
              {t("Wie konfiguriere ich E-Mail (SMTP)?", "¿Cómo configurar el email (SMTP)?")}
            </summary>
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7 }}>
              {t(
                'Gehe zu Admin → „E-Mail / SMTP" und trage die Zugangsdaten deines ausgehenden Mailservers ein. Dann kannst du Berichte und Terminbenachrichtigungen per E-Mail versenden.',
                'Ve a Admin → "Email / SMTP" y rellena los datos de tu servidor de correo saliente. Luego podrás enviar informes y notificaciones de visita por email.'
              )}
            </p>
          </details>

          <details style={{ border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>
              {t("Wie nutze ich die KI-Funktionen?", "¿Cómo usar las funciones de IA?")}
            </summary>
            <ol style={{ margin: "0.75rem 0 0 1rem", lineHeight: 1.7 }}>
              <li>{t('Gehe zu Admin → „KI / Gemini" und gib deinen Gemini-API-Schlüssel ein', 'Ve a Admin → "IA / Gemini" y configura tu clave API de Gemini')}</li>
              <li>{t("Wähle die Modelle für Text und Bildanalyse", "Selecciona los modelos para texto e imágenes")}</li>
              <li>{t('In „Prompts" kannst du eigene Prompts erstellen oder die Systemvorgaben kopieren', 'En "Prompts" puedes crear prompts propios o copiar los del sistema')}</li>
            </ol>
          </details>

          <details style={{ border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>
              {t("Wie verwalte ich Benutzer?", "¿Cómo gestionar usuarios?")}
            </summary>
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7 }}>
              {t(
                'Gehe zu Admin → „Benutzer". Dort kannst du neue Benutzer anlegen, Rollen ändern (Techniker / Büro / Admin) und Konten deaktivieren.',
                'Ve a Admin → "Usuarios". Puedes crear nuevos usuarios, cambiar roles (Técnico / Oficina / Admin) y desactivar cuentas.'
              )}
            </p>
          </details>

          <div
            style={{
              marginTop: "0.5rem",
              border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              background: "color-mix(in srgb, var(--primary) 8%, white)"
            }}
          >
            <strong>{t("Support kontaktieren", "Contactar con soporte")}</strong>
            <p style={{ margin: "0.5rem 0 0.75rem", color: "var(--ink-muted)", fontSize: "0.9rem" }}>
              {t(
                "Bei Fragen oder Problemen steht dir unser Support-Team zur Verfügung.",
                "Para cualquier duda o problema, nuestro equipo de soporte está disponible."
              )}
            </p>
            <a
              href={`mailto:soporte@26german.com?subject=${encodeURIComponent(t("Support-Anfrage", "Solicitud de soporte") + " — UID: " + uid)}&body=${encodeURIComponent(t(
                `Hallo,\n\nIch benötige Hilfe mit folgendem Problem:\n\n[Bitte hier beschreiben]\n\n---\nBenutzer-UID: ${uid}\nRolle: ${userRole}`,
                `Hola,\n\nNecesito ayuda con el siguiente problema:\n\n[Describe aquí el problema]\n\n---\nUID de usuario: ${uid}\nRol: ${userRole}`
              ))}`}
              className="btn-primary"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              {t("Support-E-Mail senden", "Enviar email de soporte")}
            </a>
          </div>
        </div>
      </SectionCard>
    );
  };

  const visibleNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item === "templates") return devMode;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="stack">
      {error && <p className="notice-banner error">{error}</p>}
      {notice && <p className="notice-banner notice">{notice}</p>}

      <div className="admin-mobile-select">
        <label>
          {t("Bereich", "Sección")}
          <select value={page} onChange={(event) => setPage(event.target.value as AdminPage)}>
            {visibleNavGroups.map((group) => {
              if (!group.group) {
                return group.items.map((targetPage) => (
                  <option key={targetPage} value={targetPage}>
                    {pageLabel(targetPage)}
                  </option>
                ));
              }

              return (
                <optgroup key={group.group} label={groupLabel(group.group)}>
                  {group.items.map((targetPage) => (
                    <option key={targetPage} value={targetPage}>
                      {pageLabel(targetPage)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      </div>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__title">{t("Administration", "Administración")}</div>
          {visibleNavGroups.map((group) => (
            <div key={group.group ?? group.items.join("-")} className="admin-nav-group">
              {group.group && <span className="admin-nav-group__label">{groupLabel(group.group)}</span>}
              {group.items.map((targetPage) => (
                <button
                  key={targetPage}
                  type="button"
                  className={`admin-nav-item ${page === targetPage ? "active" : ""}`}
                  onClick={() => setPage(targetPage)}
                >
                  <span className="admin-nav-item__icon">
                    <AdminNavIcon page={targetPage} />
                  </span>
                  <span className="admin-nav-item__copy">
                    <strong>{pageLabel(targetPage)}</strong>
                    <small>{pageSummary(targetPage)}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="admin-content">
          {renderPageContent()}
        </div>
      </div>

      {showPromptModal && editingPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowPromptModal(false);
              setEditingPrompt(null);
            }
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "18px",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "560px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)"
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              {editingPrompt.id ? t("Prompt bearbeiten", "Editar prompt") : t("Neuer Prompt", "Nuevo prompt")}
            </h3>
            <div className="stack">
              <div className="grid two">
                <label>
                  {t("ID (Slug)", "ID (slug)")}
                  <input
                    value={editingPrompt.id}
                    placeholder="mi_prompt_personalizado"
                    disabled={Boolean(editingPrompt.updatedAt) && !editingPrompt.id.includes("_copy_")}
                    onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, id: event.target.value.replace(/\s+/g, "_").toLowerCase() } : prev)}
                  />
                </label>
                <label>
                  {t("Name", "Nombre")}
                  <input
                    value={editingPrompt.name}
                    onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, name: event.target.value } : prev)}
                  />
                </label>
                <label>
                  {t("Kategorie (Zweck)", "Categoría (Propósito)")}
                  <select
                    value={editingPrompt.purpose}
                    onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, purpose: event.target.value as AiPromptPurpose } : prev)}
                  >
                    <option value="photo_description">{t("Fotobeschreibung", "Descripción de foto")}</option>
                    <option value="damage_summary">{t("Schadenzusammenfassung", "Resumen de daños")}</option>
                    <option value="general">{t("Allgemein", "General")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
                  <input
                    type="checkbox"
                    checked={editingPrompt.isActive !== false}
                    onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, isActive: event.target.checked } : prev)}
                    style={{ width: "auto" }}
                  />
                  <strong>{t("Aktiv (wird im System verwendet)", "Activo (se utilizará en el sistema)")}</strong>
                </label>
              </div>

              <label>
                {t("Beschreibung", "Descripción")}
                <input
                  value={editingPrompt.description}
                  onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                  placeholder={t("Kurze Beschreibung, was dieser Prompt macht...", "Breve descripción de lo que hace este prompt...")}
                />
              </label>

              <label>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span>{t("Inhalt (Prompt-Text)", "Contenido (texto del prompt)")}</span>
                  {editingPrompt.version && (
                    <span className="status-chip status-chip--neutral">{editingPrompt.version}</span>
                  )}
                </div>
                <textarea
                  rows={10}
                  value={editingPrompt.content}
                  onChange={(event) => setEditingPrompt((prev) => prev ? { ...prev, content: event.target.value } : prev)}
                  placeholder={t("Prompt-Text hier eingeben...", "Escribe el texto del prompt aquí...")}
                  style={{ fontFamily: "monospace", fontSize: "14px" }}
                />
                
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {getAllowedVariables(editingPrompt.purpose).map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      className="status-chip status-chip--info"
                      style={{ border: "1px solid rgba(0,0,0,0.1)", background: "var(--surface)", cursor: "pointer", fontFamily: "monospace" }}
                      onClick={() => setEditingPrompt((prev) => prev ? { ...prev, content: prev.content + " " + variable } : prev)}
                    >
                      + {variable}
                    </button>
                  ))}
                </div>

                {getUnrecognizedVariables(editingPrompt.content, getAllowedVariables(editingPrompt.purpose)).length > 0 && (
                  <div style={{ color: "var(--danger)", fontSize: "0.85rem", marginTop: "0.5rem", padding: "0.5rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "6px" }}>
                    <strong>⚠ {t("Unbekannte Variablen:", "Variables desconocidas:")}</strong> {getUnrecognizedVariables(editingPrompt.content, getAllowedVariables(editingPrompt.purpose)).join(", ")}
                    <br />
                    {t("Bitte verwende nur die oben genannten Variablen.", "Por favor, usa solo las variables permitidas (botones de arriba).")}
                  </div>
                )}
              </label>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowPromptModal(false);
                    setEditingPrompt(null);
                  }}
                >
                  {t("Abbrechen", "Cancelar")}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleSavePrompt(editingPrompt)}
                  disabled={!editingPrompt.id || !editingPrompt.name || !editingPrompt.content || getUnrecognizedVariables(editingPrompt.content, getAllowedVariables(editingPrompt.purpose)).length > 0 || !isOnline}
                  title={getUnrecognizedVariables(editingPrompt.content, getAllowedVariables(editingPrompt.purpose)).length > 0 ? t("Bitte entferne unbekannte Variablen", "Por favor, elimina las variables desconocidas") : ""}
                >
                  {t("Speichern", "Guardar")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

import { useEffect, useMemo, useState } from "react";
import { User, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  DocumentData,
  doc,
  FirestoreError,
  getDoc,
  onSnapshot,
  orderBy,
  QuerySnapshot,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { createDefaultReport } from "../lib/defaultReport";
import { toIsoString } from "../lib/firestore";
import { ReportListItem, ReportTemplateOption, TemplateSummary, TemplateVersion, UserRole } from "../types";
import { ClientManager } from "./ClientManager";
import { AppShell } from "./layout/AppShell";
import { ModuleHeader } from "./layout/ModuleHeader";
import { SidebarNavItem } from "./layout/SidebarNav";
import { SettingsPanel } from "./SettingsPanel";
import { TemplateManager } from "./TemplateManager";

interface ReportListProps {
  uid: string;
  user: User;
  userRole: UserRole;
  isOnline: boolean;
  onOpenReport: (id: string) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
}

type PanelTFunction = (deValue: string, esValue: string) => string;

interface NewReportPanelProps {
  t: PanelTFunction;
  templateOptions: ReportTemplateOption[];
  templateSelection: string;
  onTemplateSelectionChange: (value: string) => void;
  templateName: string;
  creating: boolean;
  isOnline: boolean;
  onCreateReport: () => void;
}

interface ReportsPanelProps {
  t: PanelTFunction;
  items: ReportListItem[];
  locale: string;
  loading: boolean;
  isOnline: boolean;
  deletingReportId: string;
  onOpenReport: (id: string) => void;
  onDeleteDraftReport: (item: ReportListItem) => void;
}

const NewReportPanel = ({
  t,
  templateOptions,
  templateSelection,
  onTemplateSelectionChange,
  templateName,
  creating,
  isOnline,
  onCreateReport
}: NewReportPanelProps) => {
  return (
    <section className="surface module-panel stack">
      <ModuleHeader
        title={t("Neuer Bericht", "Nuevo informe")}
        description={t("Lege einen Bericht direkt aus einer veröffentlichten Vorlage an.", "Crea un informe directamente desde una plantilla publicada.")}
        badge={t("Schnellstart", "Inicio")}
      />

      {templateOptions.length === 0 ? (
        <div className="empty-state">
          <strong>{t("Keine veröffentlichte Vorlage verfügbar", "No hay plantillas publicadas")}</strong>
          <p>
            {t(
              "Lege zuerst im Menü 'PDF Vorlagen' eine Vorlage an und veröffentliche sie.",
              "Primero crea una plantilla en el menú 'Plantillas PDF' y publícala."
            )}
          </p>
        </div>
      ) : (
        <div className="workspace-hero">
          <div className="surface surface--soft stack">
            <label>
              {t("PDF-Vorlage", "Plantilla PDF")}
              <select value={templateSelection} onChange={(event) => onTemplateSelectionChange(event.target.value)}>
                {templateOptions.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="surface surface--inset">
              <p className="surface__label">{t("Aktive Auswahl", "Selección activa")}</p>
              <strong>{templateName}</strong>
            </div>

            <button type="button" onClick={onCreateReport} disabled={creating || !isOnline || !templateSelection}>
              {creating ? t("Erstelle Bericht...", "Creando informe...") : t("Bericht anlegen", "Crear informe")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

const ReportsPanel = ({
  t,
  items,
  locale,
  loading,
  isOnline,
  deletingReportId,
  onOpenReport,
  onDeleteDraftReport
}: ReportsPanelProps) => {
  return (
    <section className="surface module-panel stack">
      <ModuleHeader
        title={t("Meine Berichte", "Mis informes")}
        description={t("Alle Entwürfe und finalisierten PDFs an einem Ort.", "Todos los borradores y PDFs finalizados en un solo lugar.")}
        badge={String(items.length)}
      />

      {loading && <div className="empty-state">{t("Lade Berichte...", "Cargando informes...")}</div>}
      {!loading && items.length === 0 && <div className="empty-state">{t("Noch keine Berichte vorhanden.", "Todavía no hay informes.")}</div>}

      {!loading && items.length > 0 && (
        <ul className="report-list">
          {items.map((item) => (
            <li key={item.id} className="report-item-row">
              <div className="report-item">
                <span>
                  <strong>{item.projectNumber}</strong>
                  <small>{item.objectLabel}</small>
                  {item.templateName && <small>{item.templateName}</small>}
                  <small>
                    {t("Zuletzt geändert", "Última modificación")}: {new Date(item.updatedAt).toLocaleString(locale)}
                  </small>
                </span>
                <span className={`status ${item.status}`}>{item.status === "draft" ? t("Entwurf", "Borrador") : t("Final", "Final")}</span>
              </div>

              <div className="row">
                <button type="button" className="ghost" onClick={() => onOpenReport(item.id)}>
                  {t("Bearbeiten", "Editar")}
                </button>
                <button
                  type="button"
                  disabled={!isOnline || item.status !== "draft" || deletingReportId === item.id}
                  onClick={() => onDeleteDraftReport(item)}
                >
                  {deletingReportId === item.id ? t("Lösche...", "Eliminando...") : t("Löschen", "Eliminar")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const ReportList = ({ uid, user, userRole, isOnline, onOpenReport, language, onLanguageChange }: ReportListProps) => {
  const [activeMenu, setActiveMenu] = useState<"neu" | "berichte" | "kunden" | "settings" | "templates">("neu");
  const [templateSelection, setTemplateSelection] = useState<string>("");
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [customTemplates, setCustomTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState("");
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);
  const locale = localeForLanguage(language);
  const canManageTemplates = userRole === "admin" || userRole === "office";
  const reportsCount = items.length;
  const templatesCount = customTemplates.length;
  const templateOptions = useMemo<ReportTemplateOption[]>(() => {
    const custom = customTemplates.map((entry) => ({
      id: entry.id,
      versionId: entry.publishedVersionId,
      value: `custom:${entry.id}:${entry.publishedVersionId}`,
      name: `${entry.name} (${entry.brand})`,
      kind: "custom" as const
    }));
    return custom;
  }, [customTemplates]);

  const navItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: "neu",
        label: t("Neuer Bericht", "Nuevo informe"),
        description: t("PDF-Vorlage auswählen und starten.", "Elige una plantilla PDF y empieza."),
        badge: templateOptions.length > 0 ? String(templateOptions.length) : "0"
      },
      {
        id: "berichte",
        label: t("Meine Berichte", "Mis informes"),
        description: t("Entwürfe und finale Berichte.", "Borradores e informes finales."),
        badge: String(reportsCount)
      },
      {
        id: "kunden",
        label: t("Kunden", "Clientes"),
        description: t("Kontakte und Adressen.", "Contactos y direcciones.")
      },
      {
        id: "settings",
        label: t("Einstellungen", "Ajustes"),
        description: t("Sprache und Profil.", "Idioma y perfil.")
      },
      ...(canManageTemplates
        ? [
            {
              id: "templates",
              label: t("PDF Vorlagen", "Plantillas PDF"),
              description: t("Editor und Veröffentlichung.", "Editor y publicación."),
              badge: String(templatesCount)
            }
          ]
        : [])
    ],
    [canManageTemplates, reportsCount, t, templatesCount, templateOptions.length]
  );

  const pageTitle = useMemo(() => {
    switch (activeMenu) {
      case "neu":
        return t("Neuer Bericht", "Nuevo informe");
      case "berichte":
        return t("Berichte", "Informes");
      case "kunden":
        return t("Kunden", "Clientes");
      case "settings":
        return t("Einstellungen", "Ajustes");
      case "templates":
        return t("PDF Vorlagen", "Plantillas PDF");
      default:
        return t("Einsatzberichte", "Informes de servicio");
    }
  }, [activeMenu, t]);

  const pageSubtitle = useMemo(() => {
    switch (activeMenu) {
      case "neu":
        return t("Arbeitsbereich für neue Einsatzberichte.", "Espacio de trabajo para nuevos informes.");
      case "berichte":
        return t("Schnellübersicht über offene und finale Einsätze.", "Resumen rápido de informes abiertos y finalizados.");
      case "kunden":
        return t("Kontakte zentral verwalten.", "Gestiona contactos desde un único lugar.");
      case "settings":
        return t("Sprache und Oberfläche anpassen.", "Ajusta idioma e interfaz.");
      case "templates":
        return t("PDF-Vorlagen erstellen, versionieren und veröffentlichen.", "Crea, versiona y publica plantillas PDF.");
      default:
        return "";
    }
  }, [activeMenu, t]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "templates"), where("status", "==", "published")),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<TemplateSummary, "id">)
          }))
          .filter((item) => Boolean(item.publishedVersionId));
        setCustomTemplates(next);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const reportsRef = collection(db, "reports");
    const indexedQuery = query(reportsRef, where("createdBy", "==", uid), orderBy("updatedAt", "desc"));
    const fallbackQuery = query(reportsRef, where("createdBy", "==", uid));

    const mapReports = (snapshot: QuerySnapshot<DocumentData>, sortInClient: boolean) => {
      const next = snapshot.docs.map((docItem: { id: string; data: () => Record<string, unknown> }) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          projectNumber: String((data.projectInfo as { projectNumber?: string } | undefined)?.projectNumber ?? "(ohne Nummer)"),
          objectLabel: String((data.projectInfo as { locationObject?: string } | undefined)?.locationObject ?? "(ohne Objekt)"),
          status: data.status === "finalized" ? "finalized" : "draft",
          template: "custom",
          templateName: String(data.templateName ?? "Legacy Vorlage"),
          updatedAt: toIsoString(data.updatedAt)
        } as ReportListItem;
      });

      if (sortInClient) {
        next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }

      setItems(next);
      setError("");
      setLoading(false);
    };

    let unsubscribe = onSnapshot(
      indexedQuery,
      (snapshot) => {
        mapReports(snapshot, false);
      },
      (snapshotError: FirestoreError) => {
        const message = snapshotError.message.toLowerCase();
        const canFallback =
          message.includes("requires an index")
          || message.includes("currently building")
          || snapshotError.code === "failed-precondition";

        if (canFallback) {
          unsubscribe = onSnapshot(
            fallbackQuery,
            (snapshot) => {
              mapReports(snapshot, true);
            },
            (fallbackError: FirestoreError) => {
              setError(fallbackError.message);
              setLoading(false);
            }
          );
          return;
        }

        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uid]);

  useEffect(() => {
    if (templateOptions.length === 0) {
      setTemplateSelection("");
      return;
    }

    setTemplateSelection((current) =>
      current && templateOptions.some((entry) => entry.value === current) ? current : templateOptions[0].value
    );
  }, [templateOptions]);

  const templateName = useMemo(() => {
    const found = templateOptions.find((entry) => entry.value === templateSelection);
    return found?.name ?? templateSelection;
  }, [templateOptions, templateSelection]);

  const createReport = async () => {
    if (!isOnline) {
      setError(t("Offline: Neuer Bericht kann nur online erstellt werden.", "Sin conexión: solo puedes crear informes en línea."));
      return;
    }

    setError("");
    setNotice("");
    setCreating(true);

    try {
      const [mode, templateId, versionId] = templateSelection.split(":");
      if (mode !== "custom" || !templateId || !versionId) {
        throw new Error(t("Bitte zuerst eine veröffentlichte PDF-Vorlage auswählen.", "Selecciona primero una plantilla PDF publicada."));
      }

      const initial = createDefaultReport(uid, "custom");
      const versionSnapshot = await getDoc(doc(db, `templates/${templateId}/versions/${versionId}`));
      const version = versionSnapshot.exists()
        ? ({ id: versionSnapshot.id, ...(versionSnapshot.data() as Omit<TemplateVersion, "id">) } satisfies TemplateVersion)
        : null;

      const dynamicDefaults = (version?.fieldSchema ?? []).reduce<Record<string, string | boolean>>((acc, field) => {
        if (field.source === "dynamic") {
          acc[field.id] = field.type === "checkbox" ? field.defaultValue === "true" : field.defaultValue;
        }
        return acc;
      }, {});

      const payload = {
        ...initial,
        brandTemplateId: "custom" as const,
        templateRef: templateId,
        templateVersionRef: versionId,
        templateName: templateOptions.find((entry) => entry.value === templateSelection)?.name ?? "Custom Template",
        templateFields: {
          ...initial.templateFields,
          ...dynamicDefaults
        },
        templateAssetPaths: {},
        templateAssetUrls: {}
      };

      const docRef = await addDoc(collection(db, "reports"), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNotice(t("Bericht wurde erstellt.", "Informe creado."));
      onOpenReport(docRef.id);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : t("Bericht konnte nicht erstellt werden", "No se pudo crear el informe");
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const deleteDraftReport = async (item: ReportListItem) => {
    if (!isOnline) {
      setError(t("Offline: Löschen ist nur online möglich.", "Sin conexión: solo puedes eliminar en línea."));
      return;
    }

    if (item.status !== "draft") {
      setError(t("Finalisierte Berichte können nicht gelöscht werden.", "No se pueden eliminar informes finalizados."));
      return;
    }

    const confirmed = window.confirm(
      t(`Bericht ${item.projectNumber} wirklich löschen?`, `¿Seguro que quieres eliminar el informe ${item.projectNumber}?`)
    );
    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingReportId(item.id);

    try {
      await deleteDoc(doc(db, "reports", item.id));
      setNotice(t("Bericht gelöscht.", "Informe eliminado."));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t("Bericht konnte nicht gelöscht werden", "No se pudo eliminar el informe");
      setError(message);
    } finally {
      setDeletingReportId("");
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AppShell
      brandTitle={t("Einsatzberichte", "Informes de servicio")}
      brandSubtitle={t("Workbench für Berichte, Kunden und PDF-Vorlagen.", "Espacio de trabajo para informes, clientes y plantillas PDF.")}
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      language={language}
      isOnline={isOnline}
      navItems={navItems}
      activeItem={activeMenu}
      onSelect={(id) => setActiveMenu(id as typeof activeMenu)}
      user={user}
      userRole={userRole}
      onLanguageChange={onLanguageChange}
      onLogout={logout}
    >
      <div className="workspace-stack">
        {(error || notice) && (
          <section className="stack">
            {error && <p className="notice-banner error">{error}</p>}
            {notice && <p className="notice-banner notice">{notice}</p>}
          </section>
        )}

        {activeMenu === "neu" && (
          <NewReportPanel
            t={t}
            templateOptions={templateOptions}
            templateSelection={templateSelection}
            onTemplateSelectionChange={setTemplateSelection}
            templateName={templateName}
            creating={creating}
            isOnline={isOnline}
            onCreateReport={createReport}
          />
        )}

        {activeMenu === "berichte" && (
          <ReportsPanel
            t={t}
            items={items}
            locale={locale}
            loading={loading}
            isOnline={isOnline}
            deletingReportId={deletingReportId}
            onOpenReport={onOpenReport}
            onDeleteDraftReport={(item) => void deleteDraftReport(item)}
          />
        )}

        {activeMenu === "kunden" && (
          <section className="surface module-panel stack">
            <ModuleHeader
              title={t("Kunden", "Clientes")}
              description={t("Verwalte deine Kontakte an einem Ort.", "Gestiona tus contactos en un solo lugar.")}
            />
            <ClientManager uid={uid} isOnline={isOnline} language={language} />
          </section>
        )}

        {activeMenu === "settings" && (
          <section className="surface module-panel stack">
            <ModuleHeader
              title={t("Einstellungen", "Ajustes")}
              description={t("Sprache, Oberfläche und Account-Details.", "Idioma, interfaz y detalles de la cuenta.")}
            />
            <SettingsPanel language={language} onLanguageChange={onLanguageChange} user={user} userRole={userRole} isOnline={isOnline} />
          </section>
        )}

        {activeMenu === "templates" && canManageTemplates && (
          <section className="surface module-panel stack">
            <ModuleHeader
              title={t("PDF Vorlagen", "Plantillas PDF")}
              description={t("Erstelle und veröffentliche PDF-AcroForm-Vorlagen.", "Crea y publica plantillas PDF AcroForm.")}
            />
            <TemplateManager uid={uid} isOnline={isOnline} language={language} />
          </section>
        )}
      </div>
    </AppShell>
  );
};

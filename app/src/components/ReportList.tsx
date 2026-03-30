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
          template: data.brandTemplateId === "custom" ? "custom" : "custom",
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
    <main className="container">
      <header className="page-head">
        <div>
          <h1>{t("Einsatzberichte", "Informes de servicio")}</h1>
          <p>{t("Neuer Workflow nur mit veröffentlichten PDF-Vorlagen.", "Nuevo flujo solo con plantillas PDF publicadas.")}</p>
        </div>
        <button type="button" className="ghost" onClick={logout}>
          {t("Abmelden", "Cerrar sesión")}
        </button>
      </header>

      <nav className="menu-tabs" aria-label={t("Hauptmenü", "Menú principal")}>
        <button type="button" className={activeMenu === "neu" ? "tab active" : "tab"} onClick={() => setActiveMenu("neu")}>
          {t("1. Neuer Bericht", "1. Nuevo informe")}
        </button>
        <button
          type="button"
          className={activeMenu === "berichte" ? "tab active" : "tab"}
          onClick={() => setActiveMenu("berichte")}
        >
          {t("2. Meine Berichte", "2. Mis informes")}
        </button>
        <button
          type="button"
          className={activeMenu === "kunden" ? "tab active" : "tab"}
          onClick={() => setActiveMenu("kunden")}
        >
          {t("3. Kunden", "3. Clientes")}
        </button>
        <button
          type="button"
          className={activeMenu === "settings" ? "tab active" : "tab"}
          onClick={() => setActiveMenu("settings")}
        >
          {t("4. Einstellungen", "4. Ajustes")}
        </button>
        {canManageTemplates && (
          <button
            type="button"
            className={activeMenu === "templates" ? "tab active" : "tab"}
            onClick={() => setActiveMenu("templates")}
          >
            {t("5. PDF Vorlagen", "5. Plantillas PDF")}
          </button>
        )}
      </nav>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {activeMenu === "neu" && (
        <section className="card stack">
          <h2>{t("Neuer Bericht aus PDF-Vorlage", "Nuevo informe desde plantilla PDF")}</h2>
          {templateOptions.length === 0 ? (
            <p>
              {t(
                "Es gibt noch keine veröffentlichte PDF-Vorlage. Bitte zuerst im Menü 'PDF Vorlagen' eine Vorlage anlegen und veröffentlichen.",
                "Todavía no hay ninguna plantilla PDF publicada. Primero crea y publica una en el menú 'Plantillas PDF'."
              )}
            </p>
          ) : (
            <>
              <label>
                {t("PDF-Vorlage", "Plantilla PDF")}
                <select value={templateSelection} onChange={(event) => setTemplateSelection(event.target.value)}>
                  {templateOptions.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={createReport} disabled={creating || !isOnline || !templateSelection}>
                {creating ? t("Erstelle Bericht...", "Creando informe...") : t(`Neuer Bericht (${templateName})`, `Nuevo informe (${templateName})`)}
              </button>
            </>
          )}
        </section>
      )}

      {activeMenu === "berichte" && (
        <section className="card stack">
          <h2>{t("Meine Berichte", "Mis informes")}</h2>
          {loading && <p>{t("Lade Berichte...", "Cargando informes...")}</p>}
          {!loading && items.length === 0 && <p>{t("Noch keine Berichte vorhanden.", "Todavía no hay informes.")}</p>}

          <ul className="report-list">
            {items.map((item) => (
              <li key={item.id} className="report-item-row">
                <div className="report-item">
                  <span>
                    <strong>{item.projectNumber}</strong>
                    <small>{item.objectLabel}</small>
                    {item.templateName && <small>{item.templateName}</small>}
                    <small>{t("Zuletzt geändert", "Última modificación")}: {new Date(item.updatedAt).toLocaleString(locale)}</small>
                  </span>
                  <span className={`status ${item.status}`}>{item.status === "draft" ? t("Entwurf", "Borrador") : t("Final", "Final")}</span>
                </div>

                <div className="row">
                  <button type="button" className="ghost" onClick={() => onOpenReport(item.id)}>
                    {t("Bearbeiten", "Editar")}
                  </button>
                  <button
                    type="button"
                    disabled={item.status !== "draft" || !isOnline || deletingReportId === item.id}
                    onClick={() => void deleteDraftReport(item)}
                  >
                    {deletingReportId === item.id ? t("Lösche...", "Eliminando...") : t("Löschen", "Eliminar")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeMenu === "kunden" && <ClientManager uid={uid} isOnline={isOnline} language={language} />}
      {activeMenu === "settings" && (
        <SettingsPanel language={language} onLanguageChange={onLanguageChange} user={user} isOnline={isOnline} />
      )}
      {activeMenu === "templates" && canManageTemplates && (
        <TemplateManager uid={uid} isOnline={isOnline} language={language} />
      )}
    </main>
  );
};

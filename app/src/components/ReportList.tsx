import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { TEMPLATE_OPTIONS } from "../constants";
import { createDefaultReport } from "../lib/defaultReport";
import { toIsoString } from "../lib/firestore";
import { ReportListItem, TemplateId } from "../types";
import { ClientManager } from "./ClientManager";

interface ReportListProps {
  uid: string;
  isOnline: boolean;
  onOpenReport: (id: string) => void;
}

export const ReportList = ({ uid, isOnline, onOpenReport }: ReportListProps) => {
  const [activeMenu, setActiveMenu] = useState<"neu" | "berichte" | "kunden">("neu");
  const [template, setTemplate] = useState<TemplateId>("svt");
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState("");

  useEffect(() => {
    const reportsRef = collection(db, "reports");
    const reportQuery = query(reportsRef, where("createdBy", "==", uid), orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      reportQuery,
      (snapshot) => {
        const next = snapshot.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            projectNumber: String(data.projectInfo?.projectNumber ?? "(ohne Nummer)"),
            objectLabel: String(data.projectInfo?.locationObject ?? "(ohne Objekt)"),
            status: data.status === "finalized" ? "finalized" : "draft",
            template: (data.brandTemplateId ?? "svt") as TemplateId,
            updatedAt: toIsoString(data.updatedAt)
          } as ReportListItem;
        });

        setItems(next);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  const templateName = useMemo(() => {
    const found = TEMPLATE_OPTIONS.find((entry) => entry.id === template);
    return found?.name ?? template;
  }, [template]);

  const createReport = async () => {
    if (!isOnline) {
      setError("Offline: Neuer Bericht kann nur online erstellt werden.");
      return;
    }

    setError("");
    setNotice("");
    setCreating(true);

    try {
      const initial = createDefaultReport(uid, template);
      const docRef = await addDoc(collection(db, "reports"), {
        ...initial,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNotice("Bericht wurde erstellt.");
      onOpenReport(docRef.id);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Bericht konnte nicht erstellt werden";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const deleteDraftReport = async (item: ReportListItem) => {
    if (!isOnline) {
      setError("Offline: Löschen ist nur online möglich.");
      return;
    }

    if (item.status !== "draft") {
      setError("Finalisierte Berichte können nicht gelöscht werden.");
      return;
    }

    const confirmed = window.confirm(`Bericht ${item.projectNumber} wirklich löschen?`);
    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingReportId(item.id);

    try {
      await deleteDoc(doc(db, "reports", item.id));
      setNotice("Bericht gelöscht.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Bericht konnte nicht gelöscht werden";
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
          <h1>Einsatzberichte</h1>
          <p>Techniker-Ansicht mit 3 Menüs: Neu, Berichte, Kunden</p>
        </div>
        <button type="button" className="ghost" onClick={logout}>
          Abmelden
        </button>
      </header>

      <nav className="menu-tabs" aria-label="Hauptmenü">
        <button type="button" className={activeMenu === "neu" ? "tab active" : "tab"} onClick={() => setActiveMenu("neu")}>
          1. Neuer Bericht
        </button>
        <button
          type="button"
          className={activeMenu === "berichte" ? "tab active" : "tab"}
          onClick={() => setActiveMenu("berichte")}
        >
          2. Meine Berichte
        </button>
        <button
          type="button"
          className={activeMenu === "kunden" ? "tab active" : "tab"}
          onClick={() => setActiveMenu("kunden")}
        >
          3. Kunden
        </button>
      </nav>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {activeMenu === "neu" && (
        <section className="card stack">
          <h2>Neuer Bericht</h2>
          <label>
            Vorlage
            <select value={template} onChange={(event) => setTemplate(event.target.value as TemplateId)}>
              {TEMPLATE_OPTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={createReport} disabled={creating || !isOnline}>
            {creating ? "Erstelle Bericht..." : `Neuer Bericht (${templateName})`}
          </button>
        </section>
      )}

      {activeMenu === "berichte" && (
        <section className="card stack">
          <h2>Meine Berichte</h2>
          {loading && <p>Lade Berichte...</p>}
          {!loading && items.length === 0 && <p>Noch keine Berichte vorhanden.</p>}

          <ul className="report-list">
            {items.map((item) => (
              <li key={item.id} className="report-item-row">
                <div className="report-item">
                  <span>
                    <strong>{item.projectNumber}</strong>
                    <small>{item.objectLabel}</small>
                    <small>Zuletzt geändert: {new Date(item.updatedAt).toLocaleString("de-DE")}</small>
                  </span>
                  <span className={`status ${item.status}`}>{item.status === "draft" ? "Entwurf" : "Final"}</span>
                </div>

                <div className="row">
                  <button type="button" className="ghost" onClick={() => onOpenReport(item.id)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    disabled={item.status !== "draft" || !isOnline || deletingReportId === item.id}
                    onClick={() => void deleteDraftReport(item)}
                  >
                    {deletingReportId === item.id ? "Lösche..." : "Löschen"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeMenu === "kunden" && <ClientManager uid={uid} isOnline={isOnline} />}
    </main>
  );
};

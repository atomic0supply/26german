import { useCallback, useEffect, useRef, useState } from "react";
import { ReportData } from "../types";

const STORAGE_PREFIX = "reportDraft:";
const DEBOUNCE_MS = 500;

interface DraftBackup {
  version: 1;
  reportId: string;
  data: ReportData;
  savedAt: string;     // ISO timestamp local (cuándo persistimos en localStorage)
  syncedAt: string;    // último updatedAt que vimos venir de Firestore
  fingerprint: string; // hash corto del payload, para evitar prompts falsos
}

/** Hash determinista corto del objeto serializado (djb2). Suficiente para detectar diffs reales. */
const fingerprint = (raw: string): string => {
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
};

const buildFingerprint = (data: ReportData): string => {
  // Ignoramos updatedAt/createdAt para que cambios irrelevantes no inflen el hash
  const normalized = JSON.stringify({
    ...data,
    createdAt: undefined,
    updatedAt: undefined,
    finalization: undefined,
  });
  return fingerprint(normalized);
};

const storageKey = (reportId: string) => `${STORAGE_PREFIX}${reportId}`;

const readBackup = (reportId: string): DraftBackup | null => {
  try {
    const raw = localStorage.getItem(storageKey(reportId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftBackup;
    if (parsed?.version !== 1 || parsed.reportId !== reportId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeBackup = (entry: DraftBackup) => {
  try {
    localStorage.setItem(storageKey(entry.reportId), JSON.stringify(entry));
  } catch {
    // QuotaExceededError u otros → silencioso, no es crítico
  }
};

const clearBackup = (reportId: string) => {
  try {
    localStorage.removeItem(storageKey(reportId));
  } catch {
    /* ignore */
  }
};

export interface UseReportDraftBackupReturn {
  /** True si al montar había un backup local más nuevo que la versión de Firestore */
  hasRecoverableDraft: boolean;
  /** El backup detectado (para mostrar info en el Dialog: cuándo se guardó) */
  recoverableDraft: DraftBackup | null;
  /** Aplica el backup local: devuelve los datos para que el caller llame a setReport() */
  restore: () => ReportData | null;
  /** Descarta el backup local y oculta el prompt */
  discard: () => void;
  /** Llamar tras un persist exitoso en Firestore para limpiar el backup local */
  markSynced: () => void;
}

/**
 * Backup local del borrador en `localStorage`:
 *  - Escribe el estado actual cada cambio (debounced 500 ms).
 *  - Al montar detecta si hay datos locales más recientes que los de Firestore
 *    y expone `hasRecoverableDraft` para que la UI ofrezca restaurar.
 *  - Tras `markSynced()` borra la entrada local.
 */
export const useReportDraftBackup = (
  reportId: string,
  report: ReportData | null,
  enabled: boolean
): UseReportDraftBackupReturn => {
  const [recoverableDraft, setRecoverableDraft] = useState<DraftBackup | null>(null);
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const hasCheckedRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);

  // 1. Check inicial: ¿hay backup local más nuevo que la versión que llegó de Firestore?
  useEffect(() => {
    if (!reportId || !report || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const backup = readBackup(reportId);
    if (!backup) return;

    // Comparar fingerprint: si el backup tiene el MISMO contenido que el actual,
    // no hay nada que recuperar — limpieza silenciosa.
    const currentFp = buildFingerprint(report);
    if (backup.fingerprint === currentFp) {
      clearBackup(reportId);
      return;
    }

    // Comparar timestamps: si el backup local es posterior a lo que tiene Firestore,
    // hay trabajo pendiente que ofrecer restaurar.
    const localTime = Date.parse(backup.savedAt);
    const remoteTime = Date.parse(report.updatedAt || "0");
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) {
      setRecoverableDraft(backup);
      setHasRecoverableDraft(true);
    } else {
      // El backup es más antiguo que Firestore → el servidor ya tiene cambios más nuevos. Limpiar.
      clearBackup(reportId);
    }
  }, [reportId, report]);

  // 2. Escritura debounced: cada cambio del report se persiste 500 ms después
  useEffect(() => {
    if (!enabled || !reportId || !report) return;
    // Evitar reescribir el backup justo cuando estamos mostrando el prompt de recovery
    if (hasRecoverableDraft) return;

    if (writeTimerRef.current) {
      window.clearTimeout(writeTimerRef.current);
    }
    writeTimerRef.current = window.setTimeout(() => {
      writeBackup({
        version: 1,
        reportId,
        data: report,
        savedAt: new Date().toISOString(),
        syncedAt: report.updatedAt,
        fingerprint: buildFingerprint(report),
      });
    }, DEBOUNCE_MS);

    return () => {
      if (writeTimerRef.current) {
        window.clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
  }, [report, reportId, enabled, hasRecoverableDraft]);

  const restore = useCallback((): ReportData | null => {
    const data = recoverableDraft?.data ?? null;
    setHasRecoverableDraft(false);
    setRecoverableDraft(null);
    // El backup queda en localStorage; el próximo `markSynced` (tras autosave a Firestore) lo limpia.
    return data;
  }, [recoverableDraft]);

  const discard = useCallback(() => {
    clearBackup(reportId);
    setHasRecoverableDraft(false);
    setRecoverableDraft(null);
  }, [reportId]);

  const markSynced = useCallback(() => {
    clearBackup(reportId);
  }, [reportId]);

  return { hasRecoverableDraft, recoverableDraft, restore, discard, markSynced };
};

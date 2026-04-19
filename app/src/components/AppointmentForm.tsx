import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { Language, translate } from "../i18n";
import { AppointmentData, ClientData, UserProfile, UserRole } from "../types";

interface AppointmentFormProps {
  appointment: AppointmentData | null;
  defaultDate?: string;
  defaultTime?: string;
  uid: string;
  userRole: UserRole;
  isOnline: boolean;
  language: Language;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY = {
  title: "",
  description: "",
  date: "",
  startTime: "09:00",
  endTime: "11:00",
  location: "",
  assignedTo: "",
  assignedToName: "",
  clientId: "",
  clientName: ""
};

export const AppointmentForm = ({
  appointment,
  defaultDate,
  defaultTime,
  uid,
  userRole,
  isOnline,
  language,
  onClose,
  onSaved
}: AppointmentFormProps) => {
  const t = (de: string, es: string) => translate(language, de, es);
  const isAdmin = userRole === "admin" || userRole === "office";
  const [form, setForm] = useState({ ...EMPTY, assignedTo: uid, date: defaultDate ?? "", startTime: defaultTime ?? "09:00" });
  const [technicians, setTechnicians] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (appointment) {
      setForm({
        title: appointment.title,
        description: appointment.description,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        location: appointment.location,
        assignedTo: appointment.assignedTo,
        assignedToName: appointment.assignedToName,
        clientId: appointment.clientId,
        clientName: appointment.clientName
      });
    }
  }, [appointment]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "users"), where("active", "==", true)),
      (snap) => {
        setTechnicians(
          snap.docs
            .map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, "uid">) }))
            .filter((u) => u.role === "technician" || u.role === "office")
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
        );
      }
    );
    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ClientData, "id">) }))
          .sort((a, b) => (a.location || "").localeCompare(b.location || ""))
      );
    });
    return unsub;
  }, [isAdmin]);

  const field = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!isOnline) {
      setError(t("Offline: nicht möglich.", "Sin conexión."));
      return;
    }
    if (!form.title || !form.date || !form.startTime || !form.endTime || !form.assignedTo) {
      setError(t("Pflichtfelder: Titel, Datum, Uhrzeit, Techniker.", "Campos obligatorios: título, fecha, hora, técnico."));
      return;
    }

    setSaving(true);
    setError("");

    try {
      const selectedClient = clients.find((c) => c.id === form.clientId);
      const selectedTech = technicians.find((u) => u.uid === form.assignedTo);
      const payload = {
        ...form,
        assignedToName: selectedTech?.displayName ?? form.assignedToName,
        clientName: selectedClient?.location ?? form.clientName,
        ...(appointment?.id ? { id: appointment.id } : {})
      };

      if (appointment?.id) {
        const updateFn = httpsCallable(functions, "updateAppointment");
        await updateFn(payload);
      } else {
        const createFn = httpsCallable(functions, "createAppointment");
        await createFn(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Fehler beim Speichern.", "Error al guardar."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card stack">
        <h2>{appointment ? t("Termin bearbeiten", "Editar cita") : t("Neuer Termin", "Nueva cita")}</h2>

        {error && <p className="error">{error}</p>}

        <label>
          {t("Titel *", "Título *")}
          <input type="text" value={form.title} onChange={(e) => field("title", e.target.value)} />
        </label>

        <label>
          {t("Beschreibung", "Descripción")}
          <textarea value={form.description} onChange={(e) => field("description", e.target.value)} rows={2} />
        </label>

        <div className="row">
          <label style={{ flex: 2 }}>
            {t("Datum *", "Fecha *")}
            <input type="date" value={form.date} onChange={(e) => field("date", e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            {t("Von *", "Desde *")}
            <input type="time" value={form.startTime} onChange={(e) => field("startTime", e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            {t("Bis *", "Hasta *")}
            <input type="time" value={form.endTime} onChange={(e) => field("endTime", e.target.value)} />
          </label>
        </div>

        <label>
          {t("Ort", "Lugar")}
          <input type="text" value={form.location} onChange={(e) => field("location", e.target.value)} />
        </label>

        {isAdmin && (
          <label>
            {t("Techniker *", "Técnico *")}
            <select value={form.assignedTo} onChange={(e) => field("assignedTo", e.target.value)}>
              <option value="">{t("-- Techniker auswählen --", "-- Seleccionar técnico --")}</option>
              {technicians.map((u) => (
                <option key={u.uid} value={u.uid}>{u.displayName}</option>
              ))}
            </select>
          </label>
        )}

        {isAdmin && (
          <label>
            {t("Kunde (optional)", "Cliente (opcional)")}
            <select value={form.clientId} onChange={(e) => field("clientId", e.target.value)}>
              <option value="">{t("-- Kein Kunde --", "-- Sin cliente --")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.location} {c.email ? `(${c.email})` : ""}</option>
              ))}
            </select>
          </label>
        )}

        <div className="row">
          <button type="button" onClick={submit} disabled={saving || !isOnline}>
            {saving ? t("Speichern...", "Guardando...") : t("Speichern", "Guardar")}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("Abbrechen", "Cancelar")}
          </button>
        </div>
      </div>
    </div>
  );
};

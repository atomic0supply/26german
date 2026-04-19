import { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer, Views, View, SlotInfo } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { de, es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { collection, onSnapshot, query, where, deleteDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { Language, localeForLanguage, translate } from "../i18n";
import { AppointmentData, UserRole } from "../types";
import { AppointmentForm } from "./AppointmentForm";

interface CalendarViewProps {
  uid: string;
  userRole: UserRole;
  isOnline: boolean;
  language: Language;
}

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: AppointmentData;
};

const buildLocalizer = (lang: Language) =>
  dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { locale: lang === "de" ? de : es }),
    getDay,
    locales: { de, es }
  });

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#0c4f82",
  completed: "#2e7d32",
  cancelled: "#b71c1c"
};

export const CalendarView = ({ uid, userRole, isOnline, language }: CalendarViewProps) => {
  const t = (deVal: string, esVal: string) => translate(language, deVal, esVal);
  const locale = localeForLanguage(language);
  const isAdmin = userRole === "admin" || userRole === "office";

  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<AppointmentData | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");
  const [defaultTime, setDefaultTime] = useState<string>("");
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");

  const localizer = buildLocalizer(language);

  useEffect(() => {
    const q = isAdmin
      ? collection(db, "appointments")
      : query(collection(db, "appointments"), where("assignedTo", "==", uid));

    const unsub = onSnapshot(q, (snap) => {
      setAppointments(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppointmentData, "id">) }))
      );
    });
    return unsub;
  }, [uid, isAdmin]);

  const events: CalEvent[] = appointments.map((appt) => {
    const [year, month, day] = appt.date.split("-").map(Number);
    const [sh, sm] = appt.startTime.split(":").map(Number);
    const [eh, em] = appt.endTime.split(":").map(Number);
    return {
      id: appt.id,
      title: isAdmin ? `${appt.assignedToName}: ${appt.title}` : appt.title,
      start: new Date(year, month - 1, day, sh, sm),
      end: new Date(year, month - 1, day, eh, em),
      resource: appt
    };
  });

  const handleSelectSlot = (slot: SlotInfo) => {
    if (!isAdmin || !isOnline) {
      return;
    }
    const d = slot.start;
    setDefaultDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setDefaultTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setSelectedAppt(null);
    setShowForm(true);
  };

  const handleSelectEvent = (event: CalEvent) => {
    setSelectedAppt(event.resource);
    setShowForm(true);
  };

  const handleDelete = async (appt: AppointmentData) => {
    if (!isAdmin || !isOnline) {
      return;
    }
    if (!window.confirm(t(`Termin "${appt.title}" wirklich löschen?`, `¿Eliminar la cita "${appt.title}"?`))) {
      return;
    }
    setDeleting(appt.id);
    setError("");
    try {
      const deleteFn = httpsCallable(functions, "deleteAppointment");
      await deleteFn({ id: appt.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Fehler.", "Error."));
    } finally {
      setDeleting("");
    }
  };

  const messages = {
    today: t("Heute", "Hoy"),
    previous: t("Zurück", "Anterior"),
    next: t("Weiter", "Siguiente"),
    month: t("Monat", "Mes"),
    week: t("Woche", "Semana"),
    day: t("Tag", "Día"),
    agenda: t("Liste", "Lista"),
    noEventsInRange: t("Keine Termine in diesem Zeitraum.", "No hay citas en este período.")
  };

  return (
    <section className="stack">
      <article className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h2>{t("Kalender", "Calendario")}</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setSelectedAppt(null); setDefaultDate(""); setDefaultTime(""); setShowForm(true); }}
              disabled={!isOnline}
            >
              {t("+ Neuer Termin", "+ Nueva cita")}
            </button>
          )}
        </div>
        {!isAdmin && <p>{t("Ihre zugewiesenen Termine.", "Sus citas asignadas.")}</p>}
        {!isOnline && <p className="error">{t("Offline – Termine können nicht geändert werden.", "Sin conexión – no se pueden modificar citas.")}</p>}
      </article>

      {error && <p className="error">{error}</p>}

      <article className="card" style={{ padding: "8px" }}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={(v) => setView(v)}
          onNavigate={(d) => setDate(d)}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          selectable={isAdmin && isOnline}
          style={{ height: 520 }}
          messages={messages}
          culture={language}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: STATUS_COLORS[event.resource.status] ?? STATUS_COLORS.scheduled,
              borderRadius: "4px",
              border: "none",
              fontSize: "12px"
            }
          })}
          popup
        />
      </article>

      {/* Upcoming appointments list */}
      <article className="card stack">
        <h3>{t("Nächste Termine", "Próximas citas")}</h3>
        {appointments.filter((a) => a.status === "scheduled").length === 0 && (
          <p>{t("Keine bevorstehenden Termine.", "No hay citas próximas.")}</p>
        )}
        <ul className="report-list">
          {appointments
            .filter((a) => a.status === "scheduled" && a.date >= new Date().toISOString().slice(0, 10))
            .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
            .slice(0, 10)
            .map((appt) => (
              <li key={appt.id} className="report-item-row">
                <div className="report-item">
                  <span>
                    <strong>{appt.title}</strong>
                    <small>{new Date(appt.date).toLocaleDateString(locale)} {appt.startTime}–{appt.endTime}</small>
                    {isAdmin && <small>{appt.assignedToName}</small>}
                    {appt.location && <small>{appt.location}</small>}
                    {appt.clientName && <small>{appt.clientName}</small>}
                  </span>
                  <span className="status finalized">{t("Geplant", "Planificado")}</span>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => { setSelectedAppt(appt); setShowForm(true); }}
                    disabled={!isOnline}
                  >
                    {t("Bearbeiten", "Editar")}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={!isOnline || deleting === appt.id}
                      onClick={() => void handleDelete(appt)}
                    >
                      {deleting === appt.id ? t("Lösche...", "Eliminando...") : t("Löschen", "Eliminar")}
                    </button>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </article>

      {showForm && (
        <AppointmentForm
          appointment={selectedAppt}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          uid={uid}
          userRole={userRole}
          isOnline={isOnline}
          language={language}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
    </section>
  );
};

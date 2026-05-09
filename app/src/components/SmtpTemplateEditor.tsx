import { useState, useRef, useEffect } from "react";
import { Language, translate } from "../i18n";

interface SmtpTemplateEditorProps {
  language: Language;
  title: string;
  subject: string;
  body: string;
  signature: string;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (subject: string, body: string) => void;
  onSave: () => void;
  onSendTest: () => void;
  saving: boolean;
  sendingTest: boolean;
}

const VARIABLES = [
  { key: "clientName", label: { de: "Kunde", es: "Cliente" } },
  { key: "appointmentDate", label: { de: "Termin-Datum", es: "Fecha cita" } },
  { key: "locationObject", label: { de: "Adresse", es: "Dirección" } },
  { key: "technicianName", label: { de: "Techniker", es: "Técnico" } },
  { key: "projectNumber", label: { de: "Projekt-Nr", es: "Nº Proyecto" } },
  { key: "senderName", label: { de: "Absender", es: "Remitente" } },
  { key: "recipientEmail", label: { de: "Empfänger-E-Mail", es: "Email Destino" } },
  { key: "signature", label: { de: "Signatur", es: "Firma" } }
];

export function SmtpTemplateEditor({
  language,
  title,
  subject,
  body,
  signature,
  isExpanded,
  onToggle,
  onChange,
  onSave,
  onSendTest,
  saving,
  sendingTest
}: SmtpTemplateEditorProps) {
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [unrecognizedVars, setUnrecognizedVars] = useState<string[]>([]);
  const [localSubject, setLocalSubject] = useState(subject);
  const [localBody, setLocalBody] = useState(body);

  useEffect(() => {
    setLocalSubject(subject);
    setLocalBody(body);
  }, [subject, body]);

  useEffect(() => {
    // Validate variables
    const matches = localBody.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    if (matches) {
      const validKeys = VARIABLES.map(v => v.key);
      const invalid = matches
        .map(m => m.replace(/[\{\}\s]/g, ""))
        .filter(k => !validKeys.includes(k));
      setUnrecognizedVars([...new Set(invalid)]);
    } else {
      setUnrecognizedVars([]);
    }
  }, [localBody]);

  const handleInsertVariable = (variable: string) => {
    if (!bodyRef.current) return;
    
    const start = bodyRef.current.selectionStart;
    const end = bodyRef.current.selectionEnd;
    
    const textBefore = localBody.substring(0, start);
    const textAfter = localBody.substring(end, localBody.length);
    
    const newBody = textBefore + `{{${variable}}}` + textAfter;
    setLocalBody(newBody);
    onChange(localSubject, newBody);
    
    // Attempt to move cursor after the inserted variable
    setTimeout(() => {
      if (bodyRef.current) {
        const newCursorPos = start + variable.length + 4; // 4 for {{ }}
        bodyRef.current.selectionStart = newCursorPos;
        bodyRef.current.selectionEnd = newCursorPos;
        bodyRef.current.focus();
      }
    }, 0);
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalBody(e.target.value);
    onChange(localSubject, e.target.value);
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSubject(e.target.value);
    onChange(e.target.value, localBody);
  };

  const generatePreview = (template: string) => {
    const mockData: Record<string, string> = {
      clientName: "Aqua Radar GmbH",
      appointmentDate: "12.05.2026 14:00",
      locationObject: "Musterstraße 1, 10115 Berlin",
      technicianName: "Alex Techniker",
      projectNumber: "VIS-0001",
      senderName: "LeakOps Team",
      recipientEmail: "test@example.com",
      signature: signature || "LeakOps GmbH\n012345678"
    };

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return mockData[key] !== undefined ? mockData[key] : `{{${key}}}`;
    });
  };

  if (!isExpanded) {
    return (
      <div className="smtp-card">
        <div className="smtp-template-header">
          <div className="stack" style={{ gap: "4px" }}>
            <h4>{title}</h4>
            <span style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
              {t("Asunto:", "Asunto:")} {localSubject}
            </span>
          </div>
          <button className="ghost small" onClick={onToggle}>
            {t("Bearbeiten", "Editar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="smtp-card smtp-template-accordion">
      <div className="smtp-template-header">
        <h4>{t("Vorlage bearbeiten:", "Editar plantilla:")} {title}</h4>
        <button className="ghost small" onClick={onToggle}>
          {t("Schließen", "Cerrar")}
        </button>
      </div>

      <label className="smtp-label">
        {t("Betreff", "Asunto")}
        <input 
          className="smtp-input" 
          value={localSubject} 
          onChange={handleSubjectChange} 
        />
      </label>

      <div className="smtp-label" style={{ marginTop: "8px" }}>
        {t("Verfügbare Variablen (anklicken zum Einfügen):", "Variables disponibles (haz clic para insertar):")}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
          {VARIABLES.map(v => (
            <button 
              key={v.key} 
              className="smtp-chip" 
              onClick={() => handleInsertVariable(v.key)}
              title={`{{${v.key}}}`}
            >
              {language === "de" ? v.label.de : v.label.es}
            </button>
          ))}
        </div>
      </div>

      <label className="smtp-label" style={{ marginTop: "8px" }}>
        {t("Text des E-Mails", "Texto del correo")}
        <textarea 
          ref={bodyRef}
          className="smtp-textarea" 
          value={localBody} 
          onChange={handleBodyChange} 
        />
        {unrecognizedVars.length > 0 && (
          <div className="smtp-error-text">
            {t("Unbekannte Variablen gefunden:", "Variable(s) no reconocida(s):")} {unrecognizedVars.map(v => `{{${v}}}`).join(", ")}
          </div>
        )}
      </label>

      <div className="smtp-label" style={{ marginTop: "8px" }}>
        {t("Vorschau", "Vista previa")}
        <div className="smtp-preview-box">
          <strong style={{ display: "block", marginBottom: "8px" }}>
            {t("Asunto:", "Asunto:")} {generatePreview(localSubject)}
          </strong>
          {generatePreview(localBody)}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
        <button 
          className="ghost" 
          onClick={onSendTest} 
          disabled={sendingTest}
        >
          {sendingTest ? t("Senden...", "Enviando...") : t("Test-E-Mail senden", "Enviar correo de prueba")}
        </button>
        <button 
          className="smtp-button-primary" 
          onClick={onSave} 
          disabled={saving}
        >
          {saving ? t("Speichert...", "Guardando...") : t("Vorlage speichern", "Guardar plantilla")}
        </button>
      </div>
    </div>
  );
}

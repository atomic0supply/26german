import { useMemo, useState } from "react";
import { Language, translate } from "../i18n";

export interface PhotoAnnotation {
  id: string;
  x: number;
  y: number;
  note: string;
}

interface PhotoAnnotatorLiteProps {
  imageUrl: string;
  annotations: PhotoAnnotation[];
  language: Language;
  disabled?: boolean;
  onChange: (annotations: PhotoAnnotation[]) => void;
}

export const PhotoAnnotatorLite = ({
  imageUrl,
  annotations,
  language,
  disabled = false,
  onChange
}: PhotoAnnotatorLiteProps) => {
  const t = (esValue: string, deValue: string) => translate(language, deValue, esValue);
  const [selectedId, setSelectedId] = useState<string>("");

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId]
  );

  const addMarker = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const next = {
      id: crypto.randomUUID(),
      x,
      y,
      note: t("Zona a revisar", "Bereich prüfen")
    };
    const updated = [...annotations, next];
    onChange(updated);
    setSelectedId(next.id);
  };

  const updateNote = (value: string) => {
    if (!selected) {
      return;
    }
    onChange(
      annotations.map((annotation) =>
        annotation.id === selected.id
          ? {
              ...annotation,
              note: value
            }
          : annotation
      )
    );
  };

  const removeSelected = () => {
    if (!selected) {
      return;
    }
    onChange(annotations.filter((annotation) => annotation.id !== selected.id));
    setSelectedId("");
  };

  return (
    <div className="annotator">
      <div className="annotator__canvas" onClick={addMarker} role="presentation">
        <img src={imageUrl} alt="" />
        {annotations.map((annotation, index) => (
          <button
            key={annotation.id}
            type="button"
            className={selectedId === annotation.id ? "annotator__marker active" : "annotator__marker"}
            style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(annotation.id);
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div className="annotator__toolbar">
        <span>{t("Toca la imagen para añadir una marca.", "Bild antippen, um eine Markierung hinzuzufügen.")}</span>
        {selected ? (
          <div className="annotator__editor">
            <input value={selected.note} onChange={(event) => updateNote(event.target.value)} disabled={disabled} />
            <button type="button" className="ghost" disabled={disabled} onClick={removeSelected}>
              {t("Quitar", "Entfernen")}
            </button>
          </div>
        ) : (
          <small>{t("Selecciona una marca para renombrarla.", "Marker auswählen, um ihn umzubenennen.")}</small>
        )}
      </div>
    </div>
  );
};

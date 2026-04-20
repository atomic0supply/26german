import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Language, translate } from "../i18n";

interface SignaturePadProps {
  initialValue?: string;
  disabled?: boolean;
  language: Language;
  onChange: (dataUrl: string) => void;
}

export const SignaturePad = ({ initialValue, disabled, language, onChange }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const t = (deValue: string, esValue: string) => translate(language, deValue, esValue);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#0f3253";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (initialValue) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = initialValue;
    }
  }, [initialValue]);

  const getOffset = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const { x, y } = getOffset(event);
    context.beginPath();
    context.moveTo(x, y);
    setDrawing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing || disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const { x, y } = getOffset(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const onPointerUp = () => {
    if (disabled) {
      return;
    }

    setDrawing(false);
  };

  const clear = () => {
    if (disabled) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="signature-wrap">
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        className="signature-canvas"
        aria-label={t("Signaturfeld", "Campo de firma")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="signature-actions">
        <button type="button" onClick={clear} disabled={disabled}>
          {t("Leeren", "Borrar")}
        </button>
        <button type="button" onClick={commit} disabled={disabled}>
          {t("Signatur übernehmen", "Guardar firma")}
        </button>
      </div>
    </div>
  );
};

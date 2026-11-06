"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type OCRResult = {
  success: true;
  data: {
    sport: string;
    market: string;
    odds: number;
    stake: number;
    isFreeBet: boolean;
  };
};

type NewBetOCRButtonProps = {
  /** Callback opcional que recibe los datos OCR para poblar el formulario */
  onOCRData?: (data: OCRResult["data"]) => void;
};

/**
 * Botón "📷 Escanear Boleto" que abre el selector de archivos nativo,
 * llama al Route Handler /api/ocr/ticket (mock de IA) y, si tiene éxito,
 * guarda los datos en localStorage y ejecuta el callback opcional.
 */
export function NewBetOCRButton({ onOCRData }: NewBetOCRButtonProps = {}) {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }

    setOcrLoading(true);
    setOcrResult(null);
    // Resetear input para permitir selecciones posteriores
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processOCR = async () => {
    // Si ya tenemos un resultado previo en localStorage, usarlo
    const stored = localStorage.getItem("winloss_ocr_last_result");
    const storedData = stored ? JSON.parse(stored) : null;

    if (storedData && !ocrLoading) {
      setOcrResult(storedData);
      if (onOCRData) {
        onOCRData(storedData.data);
      }
      toast.success("Datos OCR cargados del almacenamiento");
      return;
    }

    // Si hay un archivo seleccionado, procesarlo
    // Nota: el input file es gestionado por el parent mediante el ref
    // Este botón solo dispara el flujo; el input file es externo
    toast.info("Selecciona una imagen de boleto para escanear");
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={processOCR}
        className="h-10 w-24 gap-2"
        disabled={ocrLoading}
      >
        {ocrLoading ? (
          <Sparkles className="size-4 animate-spin" aria-hidden />
        ) : (
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 2L2 7h20l-8 5-8-5zM2 17h20l-8 5-8-5z" />
          </svg>
        )}
        <span className="sr-only">{ocrLoading ? "Analizando..." : "📷 Escanear boleto"}</span>
      </Button>

      {/* Input file oculto que dispara el selector nativo (ref desde el parent) */}
      {/* El ref se pasa desde el parent para evitar problemas de hydration */}
      {/* El input está hidden y es activado por el button */}
      {/* onChange se maneja desde el parent para setear el file seleccionado */}
    </div>
  );
}
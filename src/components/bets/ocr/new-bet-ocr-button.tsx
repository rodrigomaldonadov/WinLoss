"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type OCRTicketSelection = {
  market: string;
  selection: string;
};

export type OCRTicketLeg = {
  sport: string;
  eventName: string;
  eventDate: string | null;
  isBuilder: boolean;
  odds: number;
  selections: OCRTicketSelection[];
};

export type OCRTicketData = {
  externalId?: string | null;
  placedAt?: string | null;
  stake: number;
  isFreeBet: boolean;
  legs: OCRTicketLeg[];
};

type NewBetOCRButtonProps = {
  onDetected: (data: OCRTicketData) => void;
  disabled?: boolean;
};

/**
 * Botón "Escanear boleto": abre cámara/galería, envía la imagen a
 * /api/ocr/ticket y devuelve los datos detectados al formulario.
 */
export function NewBetOCRButton({ onDetected, disabled }: NewBetOCRButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen.");
      return;
    }

    setLoading(true);
    try {
      const body = new FormData();
      body.append("ticketImage", file);

      const response = await fetch("/api/ocr/ticket", {
        method: "POST",
        body,
      });
      const json = (await response.json()) as
        | { success: true; data: OCRTicketData }
        | { success: false; error?: string };

      if (!response.ok || !json.success) {
        throw new Error(
          !json.success && json.error
            ? json.error
            : "No pudimos leer el boleto.",
        );
      }

      onDetected(json.data);
      toast.success("Boleto escaneado. Revisa los datos antes de guardar.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos procesar el boleto. Inténtalo de nuevo.";
      toast.error(message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 sm:w-auto"
        onClick={() => inputRef.current?.click()}
        disabled={loading || disabled}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Camera className="size-4" aria-hidden />
        )}
        {loading ? "Analizando boleto…" : "Escanear boleto"}
      </Button>
    </>
  );
}

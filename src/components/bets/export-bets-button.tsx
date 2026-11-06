"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ExportBetsButton() {
  const [pending, setPending] = useState(false);

  const handleExport = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/export/bets");
      if (!response.ok) throw new Error("export_failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `winloss-apuestas-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No pudimos generar el export de apuestas.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-10 gap-2"
      onClick={handleExport}
      disabled={pending}
    >
      <Download className="size-4" aria-hidden />
      {pending ? "Exportando…" : "Exportar mi historial"}
    </Button>
  );
}

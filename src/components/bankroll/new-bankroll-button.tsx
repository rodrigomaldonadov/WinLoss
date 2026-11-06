"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { BankrollFormSheet } from "@/components/bankroll/bankroll-form-sheet";
import { Button } from "@/components/ui/button";

type NewBankrollButtonProps = {
  label?: string;
  variant?: "default" | "outline";
  className?: string;
};

export function NewBankrollButton({
  label = "Nuevo bankroll",
  variant = "default",
  className,
}: NewBankrollButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden />
        {label}
      </Button>

      <BankrollFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

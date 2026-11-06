"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { BookmakerFormSheet } from "@/components/bookmakers/bookmaker-form-sheet";
import { Button } from "@/components/ui/button";

type NewBookmakerButtonProps = {
  label?: string;
  variant?: "default" | "outline";
  className?: string;
};

export function NewBookmakerButton({
  label = "Nueva casa",
  variant = "default",
  className,
}: NewBookmakerButtonProps) {
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
      <BookmakerFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

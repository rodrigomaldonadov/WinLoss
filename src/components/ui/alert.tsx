import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

type AlertVariant = "default" | "destructive" | "secondary";

interface AlertProps {
  title: React.ReactNode;
  description: React.ReactNode;
  action: React.ReactNode;
  variant?: AlertVariant;
}

export function Alert({ title, description, action, variant = "default" }: AlertProps) {
  const isDestructive = variant === "destructive";

  return (
    <div className="rounded-md border p-4 mb-4">
      <AlertDialog>
        <AlertDialogHeader className={cn("flex items-start gap-2", isDestructive && "border-destructive/10 text-destructive")}>
          <AlertDialogTitle className={cn("flex-1", isDestructive && "text-destructive")}>
            {title}
          </AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogDescription className="mt-1 text-sm line-clamp-3">
          {description}
        </AlertDialogDescription>

        <AlertDialogFooter className="mt-3 flex justify-end">
          {action}
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  );
}
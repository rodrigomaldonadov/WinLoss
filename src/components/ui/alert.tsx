import { cn } from "@/lib/utils";

type AlertVariant = "default" | "destructive" | "warning" | "success";

interface AlertProps {
  title: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
  variant?: AlertVariant;
  className?: string;
}

const containerStyles: Record<AlertVariant, string> = {
  default: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive/10",
  warning: "border-amber-500/30 bg-amber-500/10",
  success: "border-success/30 bg-success/10",
};

const titleStyles: Record<AlertVariant, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-success",
};

const descriptionStyles: Record<AlertVariant, string> = {
  default: "text-muted-foreground",
  destructive: "text-destructive/90",
  warning: "text-amber-700 dark:text-amber-200/90",
  success: "text-success/90",
};

export function Alert({
  title,
  description,
  action,
  variant = "default",
  className,
}: AlertProps) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between",
        containerStyles[variant],
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className={cn("text-sm font-semibold", titleStyles[variant])}>
          {title}
        </p>
        <div className={cn("text-sm leading-relaxed", descriptionStyles[variant])}>
          {description}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

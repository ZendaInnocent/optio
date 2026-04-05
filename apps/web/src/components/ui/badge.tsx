import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline";
  children: React.ReactNode;
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide",
        {
          "bg-primary/10 text-primary": variant === "default",
          "bg-bg-hover text-text-muted": variant === "secondary",
          "border border-border/50 text-text-muted/80": variant === "outline",
        },
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

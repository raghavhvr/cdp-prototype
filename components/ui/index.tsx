import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, HTMLAttributes, forwardRef } from "react";

// ---------- Button ----------
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-accent text-brand-bg hover:bg-brand-accentHover disabled:opacity-50",
  secondary:
    "bg-brand-elevated text-brand-text hover:bg-brand-border disabled:opacity-50 border border-brand-border",
  danger:
    "bg-brand-danger text-white hover:opacity-90 disabled:opacity-50",
  ghost:
    "bg-transparent text-brand-muted hover:text-brand-text hover:bg-brand-elevated",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "rounded-md font-medium inline-flex items-center justify-center gap-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
        "disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

// ---------- Card ----------
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-brand-surface border border-brand-border rounded-lg p-5",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-4", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold text-brand-text", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-brand-muted mt-1", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

// ---------- Badge ----------
type BadgeColor = "danger" | "warning" | "info" | "success" | "muted" | "accent" | "dim";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
}

const badgeColors: Record<BadgeColor, string> = {
  danger: "bg-brand-danger/15 text-brand-danger border-brand-danger/30",
  warning: "bg-brand-warning/15 text-brand-warning border-brand-warning/30",
  info: "bg-brand-info/15 text-brand-info border-brand-info/30",
  success: "bg-brand-success/15 text-brand-success border-brand-success/30",
  muted: "bg-brand-muted/15 text-brand-muted border-brand-muted/30",
  accent: "bg-brand-accent/15 text-brand-accent border-brand-accent/30",
  dim: "bg-brand-dim/15 text-brand-dim border-brand-dim/30",
};

export function Badge({ color = "muted", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        badgeColors[color],
        className
      )}
      {...props}
    />
  );
}

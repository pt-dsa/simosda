import React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onClick, role, tabIndex, ...props }, ref) => {
    const isClickable = Boolean(onClick || role === "button");
    return (
      <div
        ref={ref}
        role={role || (onClick ? "button" : undefined)}
        tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick(e as any);
                }
              }
            : undefined
        }
        className={cn(
          "rounded-3xl neuglass overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl relative",
          isClickable && "cursor-pointer active:scale-[0.99] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-bold leading-none tracking-tight text-gray-900 dark:text-gray-100", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

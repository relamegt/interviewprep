import * as React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "bg-brand-emerald text-white hover:bg-brand-emerald-light shadow-lg shadow-brand-emerald/10",
      secondary: "bg-white text-clean-ink border border-clean-border hover:bg-gray-50 shadow-sm",
      outline: "bg-transparent border border-brand-emerald text-brand-emerald hover:bg-brand-emerald/5",
      ghost: "bg-transparent hover:bg-black/5 text-clean-ink/60 hover:text-clean-ink",
      danger: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/10",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-6 py-2.5 text-base",
      lg: "px-8 py-3.5 text-lg font-medium",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export const Card = ({ className, children, ...props }: { className?: string; children: React.ReactNode; [key: string]: any }) => (
  <div className={cn("bg-white rounded-3xl p-6 border border-clean-border shadow-[0_10px_30px_-5px_rgba(0,0,0,0.03)] rotate-0", className)} {...props}>
    {children}
  </div>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-white border border-clean-border rounded-xl px-4 py-2.5 text-clean-ink focus:outline-none focus:ring-2 focus:ring-brand-emerald/20 transition-all",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full bg-white border border-clean-border rounded-xl px-4 py-2.5 text-clean-ink focus:outline-none focus:ring-2 focus:ring-brand-emerald/20 transition-all min-h-[100px]",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

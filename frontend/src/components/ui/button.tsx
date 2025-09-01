import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={
        "inline-flex items-center justify-center rounded-2xl px-4 py-2 " +
        "text-sm font-medium bg-black text-white hover:opacity-90 " +
        "disabled:opacity-50 disabled:cursor-not-allowed shadow-sm " +
        className
      }
      {...props}
    />
  )
);
Button.displayName = "Button";

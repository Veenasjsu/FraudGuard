import React from "react";

export function Card({
  className = "",
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`rounded-2xl border border-gray-200/60 bg-white ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-4 md:p-5 border-b border-gray-100 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-gray-900 font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`p-4 md:p-5 ${className}`}>{children}</div>;
}

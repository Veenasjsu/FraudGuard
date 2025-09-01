import React from "react";
import { Card, CardBody } from "./card";
import { Badge } from "./badge";

export function KPI({
  title, value, delta, deltaTone="green", icon,
}: {
  title: string; value: string; delta?: string; deltaTone?: "green"|"red"|"blue"; icon?: React.ReactNode;
}) {
  const tone = deltaTone === "red" ? "text-rose-600" : deltaTone === "blue" ? "text-sky-600" : "text-emerald-600";
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-2xl md:text-3xl font-semibold mt-1">{value}</div>
          {delta && <div className={`text-xs mt-1 ${tone}`}>{delta}</div>}
        </div>
        {icon && <div className="text-2xl">{icon}</div>}
      </CardBody>
    </Card>
  );
}

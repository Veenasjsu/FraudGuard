import React from "react";

export function Table({
  columns,
  rows,
}: {
  columns: { key: string; title: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-white">
          <tr className="border-b border-gray-100">
            {columns.map(c => (
              <th key={c.key} className={`p-3 text-gray-500 ${c.className||""}`}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
              {columns.map(c => (
                <td key={c.key} className={`p-3 ${c.className||""}`}>{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

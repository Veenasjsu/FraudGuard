import React from "react";

export default function Dashboard() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-indigo-50 p-5 md:p-6">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
          Fraud Detection Dashboard
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Monitor and manage fraud detection across your platform
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-gray-800">🎉 The new dashboard layout is active.</div>
        <div className="text-sm text-gray-500 mt-2">
          Next: add Alerts / Transactions / Reports pages.
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useModelSelector } from "../contexts/ModelSelectorContext";
import { useFraudAlerts } from "../contexts/FraudAlertsContext";

type Tx = {
  trans_num: string;
  cc_num: string | number;
  merchant?: string;
  category?: string;
  amt: number;
  city?: string;
  state?: string;
  fraud?: number | boolean;
  score?: number;
  kafka_ts?: number;
  trans_date_trans_time?: string;
  rf_fraud_prediction?: 0 | 1;
  xgb_fraud_prediction?: 0 | 1;
  if_fraud_prediction?: 0 | 1;
  rf_score?: number;
  xgb_score?: number;
  if_score?: number;
  [k: string]: any;
};

type SortKey = "time" | "amount" | "score" | "fraud" | "merchant" | "category";
const PAGE_SIZE = 10;

const maskCard = (v: string | number) => {
  const s = String(v ?? "");
  if (s.length < 6) return s;
  const first6 = s.slice(0, 6);
  const last4 = s.slice(-4);
  const masked = "•".repeat(Math.max(0, s.length - 10));
  return `${first6}${masked}${last4}`;
};

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const formatTs = (tx: Tx) => {
  if (tx.kafka_ts) return new Date(tx.kafka_ts).toLocaleString();
  if (tx.trans_date_trans_time) return new Date(tx.trans_date_trans_time).toLocaleString();
  return "—";
};

export default function Transactions() {
  const { getPrediction, getScore, getModelInfo } = useModelSelector();
  const { alerts } = useFraudAlerts(); // live app state
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "fraud" | "legit">("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Tx | null>(null);

  // Convert alerts in state → table rows
  const rows = useMemo(() => {
    return alerts.map((alert) => {
      const raw = alert.raw || {};
      const tx = {
        trans_num: String(raw.trans_num ?? alert.id),
        cc_num: raw.cc_num ?? raw.user ?? alert.user,
        merchant: raw.merchant,
        category: raw.category,
        amt: raw.amt ?? raw.amount ?? alert.amount,
        city: raw.city,
        state: raw.state,
        fraud: alert.fraud,
        score: alert.score,
        kafka_ts: raw.kafka_ts ?? alert.ts,
        trans_date_trans_time: raw.trans_date_trans_time,
        rf_fraud_prediction: raw.rf_fraud_prediction,
        xgb_fraud_prediction: raw.xgb_fraud_prediction,
        if_fraud_prediction: raw.if_fraud_prediction,
        rf_score: raw.rf_score,
        xgb_score: raw.xgb_score,
        if_score: raw.if_score,
        ...raw,
        raw, // keep raw for prediction/score helpers
      } as Tx & { raw?: any };
      return tx;
    });
  }, [alerts]);

  // Filter by fraud/legit + search
  const filtered = useMemo(() => {
    let r = rows.slice();

    if (statusFilter) {
      r = r.filter((tx) => {
        const raw = (tx as any).raw || tx;
        const f = getPrediction(raw);
        return statusFilter === "fraud" ? f === 1 : f !== 1;
      });
    }

    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(
        (tx) =>
          String(tx.trans_num ?? "").toLowerCase().includes(needle) ||
          String(tx.cc_num ?? "").toLowerCase().includes(needle) ||
          String(tx.merchant ?? "").toLowerCase().includes(needle)
      );
    }
    return r;
  }, [rows, q, statusFilter, getPrediction]);

  // Sort
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const toTime = (tx: Tx) =>
      tx.kafka_ts ?? (tx.trans_date_trans_time ? +new Date(tx.trans_date_trans_time) : 0);
    return filtered.slice().sort((a, b) => {
      const rawA = (a as any).raw || a;
      const rawB = (b as any).raw || b;
      switch (sortKey) {
        case "time":
          return (toTime(a) - toTime(b)) * mul;
        case "amount":
          return ((a.amt ?? 0) - (b.amt ?? 0)) * mul;
        case "score":
          return ((getScore(rawA) ?? -1) - (getScore(rawB) ?? -1)) * mul;
        case "fraud":
          return (
            Number(getPrediction(rawA)) - Number(getPrediction(rawB))
          ) * mul;
        case "merchant":
          return (
            String(a.merchant ?? "").localeCompare(String(b.merchant ?? "")) *
            mul
          );
        case "category":
          return (
            String(a.category ?? "").localeCompare(String(b.category ?? "")) *
            mul
          );
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir, getPrediction, getScore]);

  // Pagination
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "time" ? "desc" : "asc");
    }
  };

  const exportCSV = () => {
    const header = [
      "transaction_id",
      "card_user_id",
      "amount_inr",
      "merchant",
      "category",
      "city_state",
      "prediction",
      "score",
      "timestamp",
    ];
    const lines = [header.join(",")];
    const csvSafe = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;

    sorted.forEach((tx) => {
      const raw = (tx as any).raw || tx;
      const pred = getPrediction(raw) === 1 ? "FRAUD" : "LEGIT";
      const score = getScore(raw);
      const cityState = [tx.city, tx.state].filter(Boolean).join(", ");
      lines.push(
        [
          csvSafe(String(tx.trans_num ?? "")),
          csvSafe(String(tx.cc_num ?? "")),
          csvSafe(String(tx.amt ?? 0)),
          csvSafe(String(tx.merchant ?? "")),
          csvSafe(String(tx.category ?? "")),
          csvSafe(cityState),
          csvSafe(pred),
          csvSafe(score !== undefined ? score.toFixed(2) : ""),
          csvSafe(formatTs(tx)),
        ].join(",")
      );
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      {/* Header / controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-600 mt-1">
            Using {getModelInfo().fullName}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search card, merchant, transaction ID..."
            aria-label="Search"
            className="w-64 rounded-lg border border-gray-300 px-4 py-2 text-sm bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            aria-label="Status filter"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All statuses</option>
            <option value="fraud">Fraud only</option>
            <option value="legit">Legit only</option>
          </select>
          <button
            onClick={exportCSV}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-600 mt-3 font-medium">
        {total} result{total === 1 ? "" : "s"}
      </div>

      {/* Table */}
      <div className="overflow-x-auto mt-4 rounded-xl border border-gray-200 bg-white shadow-md">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <Th label="Transaction ID" />
              <Th label="Card/User ID" />
              <Th
                label="Merchant"
                sortKey="merchant"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Category"
                sortKey="category"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Amount"
                sortKey="amount"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Prediction"
                sortKey="fraud"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Score"
                sortKey="score"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <Th
                label="Timestamp"
                sortKey="time"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((tx) => {
              const raw = (tx as any).raw || tx;
              const isFraud = getPrediction(raw) === 1;
              const score = getScore(raw);
              return (
                <tr
                  key={tx.trans_num}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${isFraud
                      ? "bg-red-50/50 hover:bg-red-100"
                      : "bg-green-50/50 hover:bg-green-100"
                    }`}
                  onClick={() => setSelected(tx)}
                >
                  <td
                    className={`py-3 px-6 font-mono text-sm ${isFraud ? "text-red-900" : "text-green-900"
                      }`}
                  >
                    {tx.trans_num}
                  </td>
                  <td
                    className={`py-3 px-6 font-mono text-sm ${isFraud ? "text-red-900" : "text-green-900"
                      }`}
                  >
                    {maskCard(tx.cc_num)}
                  </td>
                  <td
                    className={`py-3 px-6 text-sm font-medium ${isFraud ? "text-red-800" : "text-green-800"
                      }`}
                  >
                    {tx.merchant ?? "—"}
                  </td>
                  <td
                    className={`py-3 px-6 text-sm ${isFraud ? "text-red-800" : "text-green-800"
                      }`}
                  >
                    {tx.category ?? "—"}
                  </td>
                  <td
                    className={`py-3 px-6 text-sm font-semibold ${isFraud ? "text-red-900" : "text-green-900"
                      }`}
                  >
                    {fmtINR(tx.amt ?? 0)}
                  </td>
                  <td
                    className={`py-3 px-6 text-sm font-semibold ${isFraud ? "text-red-700" : "text-green-700"
                      }`}
                  >
                    {isFraud ? "🟥 Fraud" : "✅ Legit"}
                  </td>
                  <td
                    className={`py-3 px-6 text-sm font-medium ${isFraud ? "text-red-800" : "text-green-800"
                      }`}
                  >
                    {score !== undefined ? score.toFixed(2) : "—"}
                  </td>
                  <td className="py-3 px-6 text-sm text-gray-600">
                    {formatTs(tx)}
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td
                  className="py-8 px-6 text-center text-gray-500 text-sm"
                  colSpan={8}
                >
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between bg-white/95 backdrop-blur-sm py-3 px-4 border-t border-gray-200 rounded-b-xl shadow-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 shadow-sm transition-colors"
          >
            ‹ Prev
          </button>
          <div className="text-sm text-gray-700 font-medium">
            Page <b className="text-gray-900">{page}</b> of{" "}
            <b className="text-gray-900">{totalPages}</b>
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 shadow-sm transition-colors"
          >
            Next ›
          </button>
        </div>
      )}

      {/* Details modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Transaction Details</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Transaction ID" value={selected.trans_num} mono />
              <Field
                label="Card/User ID"
                value={maskCard(selected.cc_num)}
                mono
              />
              <Field
                label="Amount"
                value={fmtINR(selected.amt ?? 0)}
              />
              <Field
                label={`Prediction (${getModelInfo().fullName})`}
                value={(() => {
                  const raw = (selected as any).raw || selected;
                  return getPrediction(raw) === 1 ? "🟥 Fraud" : "✅ Legit";
                })()}
              />
              <Field
                label={`Score (${getModelInfo().fullName})`}
                value={(() => {
                  const raw = (selected as any).raw || selected;
                  const score = getScore(raw);
                  return score !== undefined ? score.toFixed(2) : "—";
                })()}
              />
              <Field label="Timestamp" value={formatTs(selected)} />
              <Field label="Merchant" value={selected.merchant ?? "—"} />
              <Field label="Category" value={selected.category ?? "—"} />
              <Field
                label="City/State"
                value={
                  [selected.city, selected.state].filter(Boolean).join(", ") ||
                  "—"
                }
              />
              <div className="md:col-span-2">
                <div className="text-gray-600 mb-1">Raw JSON</div>
                <pre className="bg-gray-50 p-3 rounded overflow-auto text-xs">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* helpers */

function Th(props: {
  label: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) {
  const { label, sortKey, current, dir, onSort } = props;
  const sortable = !!sortKey;
  const isActive = sortable && current === sortKey;
  const arrow = isActive ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      className={`py-3 px-6 text-left font-semibold text-gray-700 ${sortable
          ? "cursor-pointer select-none hover:bg-gray-200 transition-colors"
          : ""
        }`}
      onClick={sortable ? () => onSort?.(sortKey!) : undefined}
      title={sortable ? "Sort" : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {label} {arrow && <span className="text-sm text-indigo-600">{arrow}</span>}
      </span>
    </th>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <div className="text-sm font-medium text-gray-700">{label}</div>
      <div
        className={`text-sm font-semibold text-gray-900 ${mono ? "font-mono" : ""
          }`}
      >
        {value}
      </div>
    </div>
  );
}

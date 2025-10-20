import React, { useEffect, useMemo, useState } from "react";

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
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

const formatTs = (tx: Tx) => {
  if (tx.kafka_ts) return new Date(tx.kafka_ts).toLocaleString();
  if (tx.trans_date_trans_time) return new Date(tx.trans_date_trans_time).toLocaleString();
  return "—";
};

export default function Transactions() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  // Controls (category/merchant removed)
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "fraud" | "legit">(""); // "" = all

  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Tx | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("http://localhost:8000/transactions")
      .then((r) => r.json())
      .then((data: Tx[]) => { if (alive) setRows(Array.isArray(data) ? data : []); })
      .catch((e) => console.error("Fetch /transactions failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Filtering + search (only status + search now)
  const filtered = useMemo(() => {
    let r = rows.slice();

    if (statusFilter) {
      r = r.filter(tx => {
        const f = Number(tx.fraud ?? 0);
        return statusFilter === "fraud" ? f === 1 : f !== 1;
      });
    }

    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(tx =>
        String(tx.trans_num ?? "").toLowerCase().includes(needle) ||
        String(tx.cc_num ?? "").toLowerCase().includes(needle) ||
        String(tx.merchant ?? "").toLowerCase().includes(needle)
      );
    }
    return r;
  }, [rows, q, statusFilter]);

  // Sort
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const toTime = (tx: Tx) => (tx.kafka_ts ?? (tx.trans_date_trans_time ? +new Date(tx.trans_date_trans_time) : 0));
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "time":     return (toTime(a) - toTime(b)) * mul;
        case "amount":   return ((a.amt ?? 0) - (b.amt ?? 0)) * mul;
        case "score":    return ((a.score ?? -1) - (b.score ?? -1)) * mul;
        case "fraud":    return (Number(a.fraud ?? 0) - Number(b.fraud ?? 0)) * mul;
        case "merchant": return String(a.merchant ?? "").localeCompare(String(b.merchant ?? "")) * mul;
        case "category": return String(a.category ?? "").localeCompare(String(b.category ?? "")) * mul;
        default:         return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "time" ? "desc" : "asc"); }
  };

  const exportCSV = () => {
    const header = ["transaction_id","card_user_id","amount_inr","merchant","category","city_state","prediction","score","timestamp"];
    const lines = [header.join(",")];
    const csvSafe = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n")) ? `"${v.replace(/"/g,'""')}"` : v;

    sorted.forEach(tx => {
      const pred = Number(tx.fraud ?? 0) === 1 ? "FRAUD" : "LEGIT";
      const cityState = [tx.city, tx.state].filter(Boolean).join(", ");
      lines.push([
        csvSafe(String(tx.trans_num ?? "")),
        csvSafe(String(tx.cc_num ?? "")),
        csvSafe(String(tx.amt ?? 0)),
        csvSafe(String(tx.merchant ?? "")),
        csvSafe(String(tx.category ?? "")),
        csvSafe(cityState),
        csvSafe(pred),
        csvSafe(typeof tx.score === "number" ? tx.score.toFixed(2) : ""),
        csvSafe(formatTs(tx)),
      ].join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `transactions_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search card, merchant, transaction ID..."
            aria-label="Search"
            className="w-64 rounded border px-3 py-2 text-sm"
          />
          {/* Status only */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
            aria-label="Status filter"
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="fraud">Fraud only</option>
            <option value="legit">Legit only</option>
          </select>
          <button onClick={exportCSV} className="rounded border px-3 py-2 text-sm hover:bg-gray-50">
            Export CSV
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-600 mt-2">
        {loading ? "Loading…" : `${total} result${total === 1 ? "" : "s"}`}
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="min-w-full text-sm text-left">
          <thead className="border-b bg-gray-50 text-gray-600">
            <tr>
              <Th label="Transaction ID" />
              <Th label="Card/User ID" />
              <Th label="Merchant"  sortKey="merchant" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Category"  sortKey="category" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Amount"    sortKey="amount" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Prediction" sortKey="fraud" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Score"     sortKey="score" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <Th label="Timestamp" sortKey="time"  current={sortKey} dir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((tx) => {
              const isFraud = Number(tx.fraud ?? 0) === 1;
              return (
                <tr
                  key={tx.trans_num}
                  className={`border-b cursor-pointer transition ${isFraud ? "bg-red-50 hover:bg-red-100 text-red-700" : "bg-green-50 hover:bg-green-100 text-green-700"}`}
                  onClick={() => setSelected(tx)}
                >
                  <td className="py-2 px-4 font-mono">{tx.trans_num}</td>
                  <td className="py-2 px-4 font-mono">{maskCard(tx.cc_num)}</td>
                  <td className="py-2 px-4">{tx.merchant ?? "—"}</td>
                  <td className="py-2 px-4">{tx.category ?? "—"}</td>
                  <td className="py-2 px-4">{fmtINR(tx.amt ?? 0)}</td>
                  <td className="py-2 px-4">{isFraud ? "🟥 Fraud" : "✅ Legit"}</td>
                  <td className="py-2 px-4">{typeof tx.score === "number" ? tx.score.toFixed(2) : "—"}</td>
                  <td className="py-2 px-4">{formatTs(tx)}</td>
                </tr>
              );
            })}
            {!loading && pageRows.length === 0 && (
              <tr><td className="py-6 px-4 text-center text-gray-500" colSpan={8}>No results.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50">‹ Prev</button>
          <div className="text-sm text-gray-600">Page <b>{page}</b> of <b>{totalPages}</b></div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50">Next ›</button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Transaction Details</h2>
              <button onClick={() => setSelected(null)} className="rounded border px-3 py-1 hover:bg-gray-50">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Transaction ID" value={selected.trans_num} mono />
              <Field label="Card/User ID" value={maskCard(selected.cc_num)} mono />
              <Field label="Amount" value={fmtINR(selected.amt ?? 0)} />
              <Field label="Prediction" value={Number(selected.fraud ?? 0) === 1 ? "🟥 Fraud" : "✅ Legit"} />
              <Field label="Score" value={typeof selected.score === "number" ? selected.score.toFixed(2) : "—"} />
              <Field label="Timestamp" value={formatTs(selected)} />
              <Field label="Merchant" value={selected.merchant ?? "—"} />
              <Field label="Category" value={selected.category ?? "—"} />
              <Field label="City/State" value={[selected.city, selected.state].filter(Boolean).join(", ") || "—"} />
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
function Th(props: { label: string; sortKey?: SortKey; current?: SortKey; dir?: "asc" | "desc"; onSort?: (k: SortKey) => void; }) {
  const { label, sortKey, current, dir, onSort } = props;
  const sortable = !!sortKey;
  const isActive = sortable && current === sortKey;
  const arrow = isActive ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`py-2 px-4 ${sortable ? "cursor-pointer select-none" : ""}`} onClick={sortable ? () => onSort?.(sortKey!) : undefined} title={sortable ? "Sort" : undefined}>
      <span className="inline-flex items-center gap-1">
        {label} {arrow && <span className="text-xs">{arrow}</span>}
      </span>
    </th>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border rounded p-2">
      <div className="text-gray-600">{label}</div>
      <div className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

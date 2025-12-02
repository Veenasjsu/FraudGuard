import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Dot, ListFilter } from "lucide-react";
import { useFraudAlerts } from "../contexts/FraudAlertsContext";
import { useModelSelector } from "../contexts/ModelSelectorContext";
import type { Alert } from "../contexts/FraudAlertsContext";

// ————— Utils —————
const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

// Tunables
const ITEMS_PER_PAGE = 10;   // page size

// ————— Component —————
export default function Alerts() {
  const { alerts: allAlerts, connected: isConnected } = useFraudAlerts();
  const { getPrediction, getScore, getModelInfo } = useModelSelector();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<"ts" | "amount" | "score">("ts");
  const [descending, setDescending] = useState(true);

  // Filter by selected model's predictions
  const fraudAlerts = useMemo(() => {
    return allAlerts.filter((a) => {
      const raw = a.raw || {};
      return getPrediction(raw) === 1;
    });
  }, [allAlerts, getPrediction]);

  // ————— Sorting —————
  const sortedAlerts = useMemo(() => {
    const copy = [...fraudAlerts];
    copy.sort((a, b) => {
      const dir = descending ? -1 : 1;
      if (sortBy === "amount") return dir * ((a.amount || 0) - (b.amount || 0));
      if (sortBy === "score") {
        const scoreA = getScore(a.raw || {}) ?? -Infinity;
        const scoreB = getScore(b.raw || {}) ?? -Infinity;
        return dir * (scoreA - scoreB);
      }
      // default ts
      return dir * (((a.ts ?? 0) as number) - ((b.ts ?? 0) as number));
    });
    return copy;
  }, [fraudAlerts, sortBy, descending]);

  // ————— Pagination —————
  const total = sortedAlerts.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  // Keep current page in range when list length changes
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = sortedAlerts.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const prev = () => setCurrentPage(p => Math.max(1, p - 1));
  const next = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  // ————— UI —————
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-100 text-red-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Fraud Alerts</h2>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Dot className={`w-6 h-6 ${isConnected ? "text-green-600" : "text-gray-400"}`} />
              <span className={isConnected ? "text-green-700" : "text-gray-500"}>
                {isConnected ? "Live connection" : "Reconnecting…"}
              </span>
              <span className="mx-2">•</span>
              <span>Model: <b>{getModelInfo().name}</b></span>
              <span className="mx-2">•</span>
              <span>Total frauds: <b>{total}</b></span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
            <ListFilter className="w-4 h-4" />
            <label className="sr-only" htmlFor="sortBy">Sort by</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg border bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-300"
            >
              <option value="ts">Newest</option>
              <option value="amount">Amount</option>
              <option value="score">Score</option>
            </select>
            <button
              onClick={() => setDescending((v) => !v)}
              className="px-3 py-1.5 rounded-lg border hover:bg-gray-50"
              aria-label="Toggle sort direction"
            >
              {descending ? "↓" : "↑"}
            </button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center bg-white shadow-sm">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center bg-red-50 text-red-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-xl font-semibold text-gray-900 mb-2">No frauds yet</div>
          <div className="text-sm text-gray-600">You'll see suspicious transactions appear here in real time.</div>
        </div>
      )}

      {/* List */}
      <ul className="space-y-3">
        {pageItems.map((a) => (
          <li key={a.id} className="group rounded-xl border border-gray-200 bg-white shadow-md hover:shadow-lg transition-all">
            <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Main content */}
              <div className="md:col-span-8 flex flex-wrap items-center gap-x-2 gap-y-2">
                <span className="inline-flex items-center gap-2 font-semibold text-gray-900 text-base">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
                  {a.user}
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-900 font-semibold text-base">{formatINR(a.amount)}</span>
                <span className="text-gray-400">•</span>
                <span className="inline-flex items-center text-red-700 bg-red-100 px-3 py-1 rounded-full text-xs font-semibold border border-red-200">FRAUD</span>
                {getScore(a.raw || {}) !== undefined && (
                  <span className="ml-1 text-sm text-gray-600 font-medium">score: {getScore(a.raw || {})!.toFixed(2)}</span>
                )}
              </div>

              {/* Timestamp */}
              <div className="md:col-span-3 text-sm text-gray-600 md:text-right font-medium">
                {a.ts ? new Date(a.ts).toLocaleString() : ""}
              </div>

              {/* Actions */}
              <div className="md:col-span-1 md:justify-self-end">
                <details className="cursor-pointer">
                  <summary className="text-xs text-gray-600 hover:text-gray-900 font-medium">Raw</summary>
                  <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 border border-gray-200">{JSON.stringify(a.raw, null, 2)}</pre>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Bottom bar: Prev/Next + page label */}
      {total > 0 && (
        <div className="sticky bottom-0 mt-6 bg-white/95 backdrop-blur-sm py-3 px-4 flex items-center justify-between border-t border-gray-200 rounded-b-xl shadow-sm">
          <button
            onClick={prev}
            disabled={currentPage === 1}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 shadow-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="text-sm text-gray-700 font-medium">
            Page <b className="text-gray-900">{currentPage}</b> of <b className="text-gray-900">{totalPages}</b>
          </div>

          <button
            onClick={next}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 shadow-sm transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

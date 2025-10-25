import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Dot, ListFilter } from "lucide-react";

// ————— Types —————
export type Alert = {
  id: string;         // stable id (trans_num or composed)
  user: string;
  amount: number;
  fraud: number;      // 0 or 1
  score?: number;
  ts?: number;
  raw?: any;
};

// ————— Utils —————
const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

// Tunables
const ITEMS_PER_PAGE = 10;   // page size
const MAX_STORED = 1000;     // memory cap

// ————— Component —————
export default function Alerts() {
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<"ts" | "amount" | "score">("ts");
  const [descending, setDescending] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const idSetRef = useRef<Set<string>>(new Set()); // de-dupe ids
  const [isConnected, setIsConnected] = useState(false);

  // ————— WebSocket —————
  useEffect(() => {
    function connect() {
      // If your frontend runs inside Docker, use: ws://host.docker.internal:8000/ws/alerts
      wsRef.current = new WebSocket("ws://localhost:8000/ws/alerts");

      wsRef.current.onopen = () => {
        setIsConnected(true);
        keepAliveRef.current = window.setInterval(() => {
          try { wsRef.current?.send("ping"); } catch {}
        }, 25000) as unknown as number;
      };

      wsRef.current.onmessage = (event) => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; } // ignore non-JSON
        if (data?.type === "hello" || data?.type === "ping") return;

        // Map fraud flag
        const fraudVal =
          typeof data.fraud === "number" ? data.fraud :
          typeof data.prediction === "number" ? data.prediction :
          typeof data.is_fraud === "number" ? data.is_fraud : 0;

        // Only keep FRAUD
        if (Number(fraudVal) !== 1) return;

        // Build stable-ish id
        const id = String(
          data.trans_num ??
          `${data.cc_num ?? data.user ?? "unknown"}:${data.kafka_offset ?? Date.now()}`
        );
        if (idSetRef.current.has(id)) return; // de-dupe
        idSetRef.current.add(id);

        const mapped: Alert = {
          id,
          user: String(data.user ?? data.cc_num ?? data.card_id ?? "unknown"),
          amount: Number(data.amount ?? data.amt ?? 0),
          fraud: 1,
          score: typeof data.score === "number" ? data.score : undefined,
          ts: typeof data.kafka_ts === "number" ? data.kafka_ts : Date.now(),
          raw: data,
        };

        setAllAlerts((prev) => {
          const next = [mapped, ...prev];
          if (next.length > MAX_STORED) {
            const trimmed = next.slice(0, MAX_STORED);
            idSetRef.current = new Set(trimmed.map(a => a.id)); // rebuild de-dupe set
            return trimmed;
          }
          return next;
        });
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, 3000) as unknown as number;
      };

      wsRef.current.onerror = (err) => {
        console.error("WebSocket error:", err);
        wsRef.current?.close();
      };
    }

    connect();
    return () => {
      if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  // FRAUD-only already enforced; still memoize for slicing/sorting
  const fraudAlerts = useMemo(() => allAlerts, [allAlerts]);

  // ————— Sorting —————
  const sortedAlerts = useMemo(() => {
    const copy = [...fraudAlerts];
    copy.sort((a, b) => {
      const dir = descending ? -1 : 1;
      if (sortBy === "amount") return dir * ((a.amount || 0) - (b.amount || 0));
      if (sortBy === "score") return dir * (((a.score ?? -Infinity) as number) - ((b.score ?? -Infinity) as number));
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
        <div className="rounded-2xl border border-dashed p-10 text-center text-gray-600 bg-white">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full flex items-center justify-center bg-red-50 text-red-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-lg font-medium">No frauds yet</div>
          <div className="text-sm text-gray-500">You’ll see suspicious transactions appear here in real time.</div>
        </div>
      )}

      {/* List */}
      <ul className="space-y-3">
        {pageItems.map((a) => (
          <li key={a.id} className="group rounded-2xl border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
              {/* Left status bar */}
              {/* <div className="hidden md:block md:col-span-1">
                <div className="h-full w-1 rounded-full bg-gradient-to-b from-red-500 to-orange-400" />
              </div> */}
              

              {/* Main content */}
              <div className="md:col-span-8 flex flex-wrap items-center gap-x-1 gap-y-1">
                <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                  <span className="inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-200" />
                  {a.user}
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-800 font-medium">{'$'+a.amount}</span>
                <span className="text-gray-400">•</span>
                <span className="inline-flex items-center text-red-700 bg-red-100 px-2 py-0.5 rounded-full text-xs font-medium">FRAUD</span>
                {typeof a.score === "number" && (
                  <span className="ml-1 text-xs text-gray-600">score: {a.score.toFixed(2)}</span>
                )}
              </div>

              {/* Timestamp */}
              <div className="md:col-span-3 text-sm text-gray-500 md:text-right">
                {a.ts ? new Date(a.ts).toLocaleString() : ""}
              </div>

              {/* Actions */}
              <div className="md:col-span-1 md:justify-self-end">
                <details className="cursor-pointer">
                  <summary className="text-xs text-gray-500 hover:text-gray-700">Raw</summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">{JSON.stringify(a.raw, null, 2)}</pre>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Bottom bar: Prev/Next + page label */}
      {total > 0 && (
        <div className="sticky bottom-0 mt-6 bg-white/80 backdrop-blur-sm py-2 flex items-center justify-between border-t">
          <button
            onClick={prev}
            disabled={currentPage === 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="text-sm text-gray-600">
            Page <b>{currentPage}</b> of <b>{totalPages}</b>
          </div>

          <button
            onClick={next}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

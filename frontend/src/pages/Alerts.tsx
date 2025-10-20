import { useEffect, useMemo, useRef, useState } from "react";

type Alert = {
  id: string;         // stable id (trans_num or composed)
  user: string;
  amount: number;
  fraud: number;      // 0 or 1
  score?: number;
  ts?: number;
  raw?: any;
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

const ITEMS_PER_PAGE = 10;   // page size
const MAX_STORED = 1000;     // memory cap

export default function Alerts() {
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const wsRef = useRef<WebSocket | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const idSetRef = useRef<Set<string>>(new Set()); // de-dupe ids

  useEffect(() => {
    function connect() {
      // If your frontend runs inside Docker, use: ws://host.docker.internal:8000/ws/alerts
      wsRef.current = new WebSocket("ws://localhost:8000/ws/alerts");

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected");
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
          ts: typeof data.kafka_ts === "number" ? data.kafka_ts : undefined,
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
        console.log("🔁 WebSocket disconnected. Reconnecting in 3s...");
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

  // FRAUD-only already enforced; still memoize for slicing
  const fraudAlerts = useMemo(() => allAlerts, [allAlerts]);

  // Pagination
  const total = fraudAlerts.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  // Keep current page in range when list length changes
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = fraudAlerts.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const prev = () => setCurrentPage(p => Math.max(1, p - 1));
  const next = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">🚨 Fraud Alerts</h2>
        <div className="text-sm text-gray-600">Total frauds: <b>{total}</b></div>
      </div>

      {total === 0 && (
        <div className="text-gray-600">
          No frauds yet… (POST <code>/_test_send</code> with <code>{"{\"fraud\":1}"}</code> or start the producer)
        </div>
      )}

      <ul className="space-y-2">
        {pageItems.map((a) => (
          <li
            key={a.id}
            className="p-3 rounded shadow flex items-center justify-between bg-red-100 text-red-800"
          >
            <div className="space-x-2">
              <strong>{a.user}</strong>
              <span>• {formatINR(a.amount)}</span>
              <span>• 🟥 FRAUD</span>
              {typeof a.score === "number" && <span>• score: {a.score.toFixed(2)}</span>}
            </div>
            <div className="text-xs opacity-70 text-right">
              {a.ts ? new Date(a.ts).toLocaleString() : ""}
            </div>
          </li>
        ))}
      </ul>

      {/* Bottom bar: ONLY Prev / Next + page label */}
      {totalPages > 1 && (
        <div className="sticky bottom-0 mt-4 bg-white/80 backdrop-blur py-2 flex items-center justify-between">
          <button
            onClick={prev}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            ‹ Prev
          </button>

          <div className="text-sm text-gray-600">
            Page <b>{currentPage}</b> of <b>{totalPages}</b>
          </div>

          <button
            onClick={next}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RefreshCw, WifiOff, Wifi } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";

/**
 * Fraud Guard — Dashboard
 * A live dashboard for streaming fraud alerts over WebSocket with KPIs, charts, filters, and an alerts table.
 *
 * Requirements:
 * - TailwindCSS
 * - recharts
 * - lucide-react (icons)
 *
 * Env/Config:
 * - VITE_WS_ALERTS_URL (optional). Fallbacks:
 *   localhost => ws://localhost:8000/ws/alerts
 *   prod => wss://<current-host>/ws/alerts
 */

/** Types **/
export type RawAlert = Record<string, unknown>;
export type Alert = {
  id: string; // stable id (trans_num or composed)
  user: string;
  amount: number;
  fraud: 0 | 1;
  score?: number;
  ts?: number; // epoch millis
  raw?: RawAlert;
};

/** Utils **/
const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const fmtNum = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n));

const humanTime = (t?: number) => (t ? new Date(t).toLocaleString() : "");

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const WS_URL =
  (import.meta as any)?.env?.VITE_WS_ALERTS_URL ||
  (typeof window !== "undefined" && (window as any)?.WS_ALERTS_URL) ||
  (typeof location !== "undefined" && location.hostname === "localhost"
    ? "ws://localhost:8000/ws/alerts"
    : typeof location !== "undefined"
    ? `wss://${location.host}/ws/alerts`
    : "ws://localhost:8000/ws/alerts");

/** Config **/
const MAX_STORED = 2000; // memory cap
const PING_INTERVAL_MS = 25_000;

/** A tiny bounded set for de-duping ids **/
class BoundedIdSet {
  private set = new Set<string>();
  constructor(private capacity: number) {}
  has(id: string) {
    return this.set.has(id);
  }
  add(id: string) {
    this.set.add(id);
    if (this.set.size > this.capacity) {
      const first = this.set.values().next().value as string | undefined;
      if (first) this.set.delete(first);
    }
  }
  rebuild(ids: string[]) {
    this.set = new Set(ids.slice(0, this.capacity));
  }
  clear() {
    this.set.clear();
  }
}

/** WebSocket hook with auto-retry, pause, and keepalive **/
function useFraudStream() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000); // 1s → 30s
  const idSetRef = useRef(new BoundedIdSet(MAX_STORED * 2));

  const resetBackoff = () => (backoffRef.current = 1000);

  const connect = useCallback(() => {
    if (paused) return; // don't connect while paused

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        resetBackoff();
        // keepalive ping
        pingTimerRef.current = setInterval(() => {
          try {
            wsRef.current?.send("ping");
          } catch {}
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "hello" || data?.type === "ping") return;

          // Map fraud flag from multiple possible schemas
          const fraudVal =
            typeof data.fraud === "number"
              ? data.fraud
              : typeof data.prediction === "number"
              ? data.prediction
              : typeof data.is_fraud === "number"
              ? data.is_fraud
              : 0;

          if (Number(fraudVal) !== 1) return; // dash focuses on FRAUD only

          const id = String(
            data.trans_num ??
              `${data.cc_num ?? data.user ?? "unknown"}:$${data.kafka_offset ?? Date.now()}`
          );
          if (idSetRef.current.has(id)) return;

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

          setAlerts((prev) => {
            const next = [mapped, ...prev];
            if (next.length > MAX_STORED) {
              const trimmed = next.slice(0, MAX_STORED);
              idSetRef.current.rebuild(trimmed.map((a) => a.id));
              return trimmed;
            }
            return next;
          });
        } catch {
          /* ignore non-JSON */
        }
      };

      const scheduleReconnect = () => {
        setConnected(false);
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const delay = clamp(backoffRef.current, 1000, 30_000);
        backoffRef.current = delay * 2;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = scheduleReconnect;
    } catch {
      // next retry will handle
    }
  }, [paused]);

  useEffect(() => {
    connect();
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const togglePause = () => {
    setPaused((p) => {
      const next = !p;
      if (next) {
        // going paused
        wsRef.current?.close();
      } else {
        // unpausing
        connect();
      }
      return next;
    });
  };

  const clear = () => {
    setAlerts([]);
    idSetRef.current.clear();
  };

  return { alerts, connected, paused, togglePause, clear } as const;
}

/** Bucketing helpers for charts **/
function useTimeBuckets(alerts: Alert[], minutes = 60) {
  return useMemo(() => {
    const now = Date.now();
    const start = now - minutes * 60_000;

    const buckets = new Map<number, { t: number; count: number; amount: number }>();
    for (let i = 0; i < minutes; i++) {
      const ts = start + i * 60_000;
      buckets.set(ts, { t: ts, count: 0, amount: 0 });
    }

    for (const a of alerts) {
      const t = a.ts ?? now;
      if (t < start) continue;
      const minuteTs = Math.floor((t - start) / 60_000) * 60_000 + start;
      const b = buckets.get(minuteTs);
      if (!b) continue;
      b.count += 1;
      b.amount += a.amount;
    }
    return Array.from(buckets.values());
  }, [alerts, minutes]);
}

/** CSV export **/
function exportCSV(rows: Alert[]) {
  const header = ["id", "user", "amount", "score", "ts"].join(",");
  const lines = rows.map((a) =>
    [a.id, a.user, a.amount, a.score ?? "", a.ts ? new Date(a.ts).toISOString() : ""].join(",")
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fraud_alerts_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** KPI Card **/
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-4 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

/** Toolbar Button **/
function TBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm bg-white hover:bg-neutral-50 disabled:opacity-50 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:border-neutral-800"
    >
      {children}
    </button>
  );
}

/** Main Dashboard **/
export default function Dashboard() {
  const { alerts, connected, paused, togglePause, clear } = useFraudStream();

  // Filters
  const [query, setQuery] = useState("");
  const [windowMin, setWindowMin] = useState(60); // last N minutes for charts/table

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = Date.now() - windowMin * 60_000;
    return alerts.filter((a) => (a.ts ?? 0) >= cutoff && (!q || a.user.toLowerCase().includes(q)));
  }, [alerts, query, windowMin]);

  const kpiTotalFraud = filtered.length;
  const kpiTotalAmount = filtered.reduce((sum, a) => sum + a.amount, 0);
  const kpiAvgTicket = kpiTotalFraud ? kpiTotalAmount / kpiTotalFraud : 0;
  const lastTs = filtered[0]?.ts;

  const buckets = useTimeBuckets(filtered, windowMin);

  // Amount distribution buckets (simple powers-of-two-ish)
  const amtBins = useMemo(() => {
    const ranges = [
      { label: "< ₹1k", min: 0, max: 1_000 },
      { label: "₹1k–5k", min: 1_000, max: 5_000 },
      { label: "₹5k–10k", min: 5_000, max: 10_000 },
      { label: "₹10k–25k", min: 10_000, max: 25_000 },
      { label: "₹25k–50k", min: 25_000, max: 50_000 },
      { label: "> ₹50k", min: 50_000, max: Number.POSITIVE_INFINITY },
    ];
    const counts = ranges.map((r) => ({ ...r, count: 0 }));
    for (const a of filtered) {
      const i = counts.findIndex((r) => a.amount >= r.min && a.amount < r.max);
      if (i >= 0) counts[i].count += 1;
    }
    return counts.map((c) => ({ range: c.label, count: c.count }));
  }, [filtered]);

  const download = () => exportCSV(filtered);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">🛡️ Fraud Guard Dashboard</h1>
          <div className="text-xs text-neutral-500 mt-1">
            Live fraud-only stream • {connected ? (
              <span className="inline-flex items-center gap-1 text-green-600"><Wifi className="w-3 h-3"/> connected</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-600"><WifiOff className="w-3 h-3"/> reconnecting…</span>
            )}
            {lastTs ? <span className="ml-2">Last event: {humanTime(lastTs)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TBtn onClick={togglePause} title={paused ? "Resume stream" : "Pause stream"}>
            {paused ? <Play className="w-4 h-4"/> : <Pause className="w-4 h-4"/>}
            {paused ? "Resume" : "Pause"}
          </TBtn>
          <TBtn onClick={clear} title="Clear current window">
            <RefreshCw className="w-4 h-4"/> Clear
          </TBtn>
          <TBtn onClick={download} title="Export filtered alerts to CSV">
            <Download className="w-4 h-4"/> Export
          </TBtn>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl p-3 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <label className="text-xs text-neutral-500">Search user</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. user id / cc_num"
            className="mt-1 w-full rounded-xl border px-3 py-2 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 outline-none focus:ring-2 focus:ring-neutral-300"
          />
        </div>
        <div className="rounded-2xl p-3 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <label className="text-xs text-neutral-500">Window (minutes)</label>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={windowMin}
            onChange={(e) => setWindowMin(Number(e.target.value))}
            className="w-full mt-2"
          />
          <div className="text-xs text-neutral-500 mt-1">Showing last {windowMin} minutes</div>
        </div>
        <div className="rounded-2xl p-3 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <label className="text-xs text-neutral-500">Status</label>
          <div className="mt-1 text-sm">
            {fmtNum(filtered.length)} alerts in window • Total value {INR(
              filtered.reduce((s, a) => s + a.amount, 0)
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Fraud alerts" value={fmtNum(kpiTotalFraud)} />
        <Kpi label="Total fraudulent amount" value={INR(kpiTotalAmount)} />
        <Kpi label="Avg ticket" value={INR(kpiAvgTicket)} />
        <Kpi label="Stream" value={connected ? "Connected" : "Retrying…"} sub={paused ? "Paused" : "Live"} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-2xl p-4 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <div className="mb-2 text-sm font-medium">Fraud Count (per minute)</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={buckets} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                  formatter={(v: any, n: any) => [v, n === "count" ? "alerts" : "amount"]}
                />
                <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <div className="mb-2 text-sm font-medium">Amount Distribution</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={amtBins} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="text-sm font-medium">Alerts ({fmtNum(filtered.length)})</div>
          <div className="text-xs text-neutral-500">Showing last {windowMin} minutes</div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-950 text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">User</th>
                <th className="text-left font-medium px-4 py-2">Amount</th>
                <th className="text-left font-medium px-4 py-2">Score</th>
                <th className="text-left font-medium px-4 py-2">Time</th>
                <th className="text-left font-medium px-4 py-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30">
                  <td className="px-4 py-2 font-medium">{a.user}</td>
                  <td className="px-4 py-2">{INR(a.amount)}</td>
                  <td className="px-4 py-2">{typeof a.score === "number" ? a.score.toFixed(2) : "—"}</td>
                  <td className="px-4 py-2">{humanTime(a.ts)}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500 truncate max-w-[220px]" title={a.id}>{a.id}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No frauds detected in the selected window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-[11px] text-neutral-500 mt-4">
        Tip: Set <code>VITE_WS_ALERTS_URL</code> to point the dashboard at your environment. This page only visualizes events with a fraud flag = 1.
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Download, Pause, Play, RefreshCw, WifiOff, Wifi } from "lucide-react";
import { useFraudAlerts } from "../contexts/FraudAlertsContext";
import { useModelSelector } from "../contexts/ModelSelectorContext";
import FraudMap from "../components/FraudMap";
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
import type { Alert } from "../contexts/FraudAlertsContext";

/** Utils **/
const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const fmtNum = (n: number) => new Intl.NumberFormat("en-IN").format(Math.round(n));

const humanTime = (t?: number) => (t ? new Date(t).toLocaleString() : "");

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
    <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-2 text-sm text-gray-600">{sub}</div>}
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
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow transition-shadow"
    >
      {children}
    </button>
  );
}

/** Main Dashboard **/
export default function Dashboard() {
  const { alerts, connected, paused, togglePause, clear } = useFraudAlerts();
  const { getPrediction, getScore, getModelInfo } = useModelSelector();

  // Filters
  const [query, setQuery] = useState("");
  const [windowMin, setWindowMin] = useState(60); // last N minutes for charts/table

  // Count fraud alerts per model for comparison
  const modelCounts = useMemo(() => {
    const cutoff = Date.now() - windowMin * 60_000;
    const recentAlerts = alerts.filter((a) => (a.ts ?? 0) >= cutoff);
    return {
      rf: recentAlerts.filter((a) => Number(a.raw?.rf_fraud_prediction ?? a.raw?.fraud ?? 0) === 1).length,
      xgb: recentAlerts.filter((a) => Number(a.raw?.xgb_fraud_prediction ?? 0) === 1).length,
      if: recentAlerts.filter((a) => Number(a.raw?.if_fraud_prediction ?? 0) === 1).length,
    };
  }, [alerts, windowMin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = Date.now() - windowMin * 60_000;
    return alerts
      .filter((a) => {
        // Filter by selected model's prediction
        const raw = a.raw || {};
        return getPrediction(raw) === 1;
      })
      .filter((a) => (a.ts ?? 0) >= cutoff && (!q || a.user.toLowerCase().includes(q)));
  }, [alerts, query, windowMin, getPrediction]);

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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">🛡️ Fraud Guard Dashboard</h1>
          <div className="text-sm text-gray-600 mt-1 flex flex-wrap items-center gap-2">
            <span>Model: <strong className="text-gray-900">{getModelInfo().fullName}</strong></span>
            <span className="text-gray-400">•</span>
            <span>Live fraud-only stream</span>
            <span className="text-gray-400">•</span>
            <span className="font-medium text-gray-700">RF: {modelCounts.rf} | XGB: {modelCounts.xgb} | IF: {modelCounts.if}</span>
            {connected ? (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium"><Wifi className="w-4 h-4"/> Connected</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-600 font-medium"><WifiOff className="w-4 h-4"/> Reconnecting…</span>
            )}
            {lastTs && <span className="text-gray-500">Last event: {humanTime(lastTs)}</span>}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 bg-white shadow-md border border-gray-200">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Search user</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. user id / cc_num"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="rounded-xl p-4 bg-white shadow-md border border-gray-200">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Window (minutes)</label>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={windowMin}
            onChange={(e) => setWindowMin(Number(e.target.value))}
            className="w-full mt-2"
          />
          <div className="text-sm text-gray-600 mt-2">Showing last {windowMin} minutes</div>
        </div>
        <div className="rounded-xl p-4 bg-white shadow-md border border-gray-200">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Status</label>
          <div className="text-base text-gray-900 font-medium">
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
        <div className="lg:col-span-2 rounded-xl p-5 bg-white shadow-md border border-gray-200">
          <div className="mb-3 text-base font-semibold text-gray-900">Fraud Count (per minute)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={buckets} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis allowDecimals={false} stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip
                  labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                  formatter={(v: any, n: any) => [v, n === "count" ? "alerts" : "amount"]}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200">
          <div className="mb-3 text-base font-semibold text-gray-900">Amount Distribution</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={amtBins} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="range" interval={0} angle={-20} textAnchor="end" height={50} stroke="#6b7280" style={{ fontSize: '11px' }} />
                <YAxis allowDecimals={false} stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fraud Map */}
      <div className="mb-6">
        <FraudMap />
      </div>

      {/* Alerts Table */}
      <div className="rounded-xl bg-white shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-base font-semibold text-gray-900">Alerts ({fmtNum(filtered.length)})</div>
          <div className="text-sm text-gray-600">Showing last {windowMin} minutes</div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="text-left font-semibold text-gray-700 px-6 py-3">User</th>
                <th className="text-left font-semibold text-gray-700 px-6 py-3">Amount</th>
                <th className="text-left font-semibold text-gray-700 px-6 py-3">Score</th>
                <th className="text-left font-semibold text-gray-700 px-6 py-3">Time</th>
                <th className="text-left font-semibold text-gray-700 px-6 py-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">{a.user}</td>
                  <td className="px-6 py-3 text-gray-700">{INR(a.amount)}</td>
                  <td className="px-6 py-3 text-gray-700">{getScore(a.raw || {}) !== undefined ? getScore(a.raw || {})!.toFixed(2) : "—"}</td>
                  <td className="px-6 py-3 text-gray-600">{humanTime(a.ts)}</td>
                  <td className="px-6 py-3 text-xs text-gray-500 font-mono truncate max-w-[220px]" title={a.id}>{a.id}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No frauds detected in the selected window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500 mt-6 text-center">
        Tip: Set <code className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">VITE_WS_ALERTS_URL</code> to point the dashboard at your environment.
      </div>
    </div>
  );
}

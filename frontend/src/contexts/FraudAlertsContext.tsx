import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

// Types
export type Alert = {
  id: string;
  user: string;
  amount: number;
  fraud: 0 | 1;
  score?: number;
  ts?: number;
  raw?: Record<string, unknown>;
};

type FraudAlertsContextType = {
  alerts: Alert[];
  connected: boolean;
  paused: boolean;
  togglePause: () => void;
  clear: () => void;
};

const FraudAlertsContext = createContext<FraudAlertsContextType | undefined>(undefined);

// Constants
const STORAGE_KEY = "fraudguard_global_alerts";
const MAX_STORED = 2000;
const WS_URL =
  (import.meta as any)?.env?.VITE_WS_ALERTS_URL ||
  (typeof window !== "undefined" && (window as any)?.WS_ALERTS_URL) ||
  (typeof location !== "undefined" && location.hostname === "localhost"
    ? "ws://localhost:8000/ws/alerts"
    : typeof location !== "undefined"
    ? `wss://${location.host}/ws/alerts`
    : "ws://localhost:8000/ws/alerts");
const PING_INTERVAL_MS = 25_000;

// Bounded ID Set for de-duplication
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

// Storage helpers
function loadAlertsFromStorage(): Alert[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function saveAlertsToStorage(alerts: Alert[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // ignore storage errors (quota exceeded, etc.)
  }
}

// Context Provider Component
export function FraudAlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>(() => loadAlertsFromStorage());
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const idSetRef = useRef(new BoundedIdSet(MAX_STORED * 2));

  const resetBackoff = useCallback(() => {
    backoffRef.current = 1000;
  }, []);

  const connect = useCallback(() => {
    if (paused) return;

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

          if (Number(fraudVal) !== 1) return; // Only keep fraud alerts

          const id = String(
            data.trans_num ??
              `${data.cc_num ?? data.user ?? "unknown"}:${data.kafka_offset ?? Date.now()}`
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
            let result = next;
            if (next.length > MAX_STORED) {
              result = next.slice(0, MAX_STORED);
              idSetRef.current.rebuild(result.map((a) => a.id));
            }
            // Persist to localStorage
            saveAlertsToStorage(result);
            return result;
          });
        } catch {
          /* ignore non-JSON */
        }
      };

      const scheduleReconnect = () => {
        setConnected(false);
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const delay = Math.max(1000, Math.min(backoffRef.current, 30_000));
        backoffRef.current = delay * 2;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onclose = scheduleReconnect;
      ws.onerror = scheduleReconnect;
    } catch {
      // next retry will handle
    }
  }, [paused, resetBackoff]);

  // Initialize de-duplication set from loaded alerts on mount
  useEffect(() => {
    const loaded = loadAlertsFromStorage();
    if (loaded.length > 0) {
      idSetRef.current.rebuild(loaded.map((a) => a.id));
    }
  }, []);

  // Maintain connection
  useEffect(() => {
    connect();
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const togglePause = useCallback(() => {
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
  }, [connect]);

  const clear = useCallback(() => {
    setAlerts([]);
    idSetRef.current.clear();
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <FraudAlertsContext.Provider value={{ alerts, connected, paused, togglePause, clear }}>
      {children}
    </FraudAlertsContext.Provider>
  );
}

// Hook to use the context
export function useFraudAlerts() {
  const context = useContext(FraudAlertsContext);
  if (context === undefined) {
    throw new Error("useFraudAlerts must be used within a FraudAlertsProvider");
  }
  return context;
}


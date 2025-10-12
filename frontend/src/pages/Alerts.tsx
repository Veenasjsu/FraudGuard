import { useEffect, useState } from 'react';

type Alert = {
  user: string;
  amount: number;
  fraud: number;
};

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let ws: WebSocket;
    let keepAlive: number;

    const connect = () => {
      ws = new WebSocket("ws://localhost:8000/ws/alerts");

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        // keep the connection warm for servers that expect periodic messages
        keepAlive = window.setInterval(() => {
          try { ws.send("ping"); } catch { }
        }, 25000);
      };

      ws.onmessage = (event) => {
        console.log("on message")
        const raw = JSON.parse(event.data);
        const mapped = {
          user: String(raw.user ?? raw.cc_num ?? raw.card_id ?? "unknown"),
          amount: Number(raw.amount ?? raw.amt ?? 0),
          fraud: Number(raw.fraud ?? raw.prediction ?? 0),
        };
        setAlerts(prev => [mapped, ...prev.slice(0, 9)]);
      };

      ws.onclose = () => {
        console.log("🔁 WebSocket disconnected. Reconnecting...");
        if (keepAlive) window.clearInterval(keepAlive);
        setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connect();
    return () => { if (keepAlive) window.clearInterval(keepAlive); ws?.close(); };
  }, []);



  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">🚨 Live Fraud Alerts</h2>
      <ul className="space-y-2">
        {alerts.map((alert, index) => (
          <li
            key={index}
            className={`p-3 rounded shadow ${alert.fraud ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}
          >
            <strong>{alert.user}</strong> – ₹{alert.amount} –{' '}
            {alert.fraud === 1 ? '🟥 FRAUD' : '✅ Legit'}
          </li>
        ))}
      </ul>
    </div>
  );
}

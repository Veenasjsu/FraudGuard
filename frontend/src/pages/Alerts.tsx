import { useEffect, useState } from 'react';

type Alert = {
  user: string;
  amount: number;
  fraud: number;
};

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/alerts");

    ws.onopen = () => console.log('✅ WebSocket connected');
    ws.onerror = (e) => console.error('WebSocket error:', e);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAlerts((prev) => [data, ...prev.slice(0, 9)]); // Latest 10 alerts
    };

    return () => ws.close();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">🚨 Live Fraud Alerts</h2>
      <ul className="space-y-2">
        {alerts.map((alert, index) => (
          <li
            key={index}
            className={`p-3 rounded shadow ${
              alert.fraud ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
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

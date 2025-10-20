import React from "react";

import { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Connect to the WebSocket server running in the Docker container (localhost:5000)
const socket = io('http://localhost:5000');

export default function Dashboard() {
  // State to hold the latest metrics
  const [latestMetric, setLatestMetric] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    // 1. Handle connection status
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // 2. Listen for the 'new_metric' event from the server
    socket.on('new_metric', (data) => {
      // 'data' is the JSON object from Spark/Kafka (e.g., {window_start: ..., fraud_rate_pct: 0.5})
      setLatestMetric(data);
      console.log('Received new metric:', data);
    });

    // Clean up event listeners on component unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new_metric');
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Real-Time Fraud Monitoring 📈</h1>
      <p>Server Status: <span style={{ color: isConnected ? 'green' : 'red' }}>{isConnected ? 'Connected' : 'Disconnected'}</span></p>

      {latestMetric ? (
        <div>
          <h2>Current 5-Minute Window Metrics</h2>
          
          {/* Display the main EDA metric */}
          <div style={{ fontSize: '3em', fontWeight: 'bold', color: latestMetric.fraud_rate_pct > 1 ? 'red' : 'green' }}>
            Fraud Rate: {latestMetric.fraud_rate_pct.toFixed(2)}%
          </div>

          {/* Display other aggregate EDA metrics */}
          <p>Window End: {new Date(latestMetric.window.end).toLocaleTimeString()}</p>
          <p>Total Transactions: {latestMetric.total_transactions}</p>
          <p>Average Amount: ${latestMetric.avg_amt_window.toFixed(2)}</p>
        </div>
      ) : (
        <p>Waiting for the first metrics from the Spark stream...</p>
      )}
    </div>
  );
}

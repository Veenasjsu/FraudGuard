import React, { useMemo, useState, useEffect } from "react";
import { useFraudAlerts } from "../contexts/FraudAlertsContext";
import { useModelSelector, MODELS } from "../contexts/ModelSelectorContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { TrendingUp, AlertCircle, CheckCircle, XCircle } from "lucide-react";

type MetricsData = {
  model: string;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  total_samples: number;
  timestamp?: string;
  ts?: number;
  type?: string;
};

// Helper function to extract metrics from alerts
function extractMetricsFromAlerts(alerts: any[]): MetricsData[] {
  const metricsMap = new Map<string, MetricsData>();
  
  alerts.forEach(alert => {
    const raw = alert.raw || {};
    // Check if this is a metrics message
    if (raw.type === 'metrics' && raw.model) {
      const modelKey = normalizeModelName(raw.model).toLowerCase().replace(/\s+/g, '');
      // Keep the latest metrics for each model
      const existing = metricsMap.get(modelKey);
      const alertTs = raw.ts || alert.ts || 0;
      const existingTs = existing?.ts || 0;
      
      if (!existing || (alertTs > existingTs)) {
        metricsMap.set(modelKey, {
          model: normalizeModelName(raw.model),
          tp: Number(raw.tp) || 0,
          fp: Number(raw.fp) || 0,
          tn: Number(raw.tn) || 0,
          fn: Number(raw.fn) || 0,
          accuracy: Number(raw.accuracy) || 0,
          precision: Number(raw.precision) || 0,
          recall: Number(raw.recall) || 0,
          f1_score: Number(raw.f1_score) || 0,
          total_samples: Number(raw.total_samples) || 0,
          timestamp: raw.timestamp,
          ts: alertTs,
          type: raw.type,
        });
      }
    }
  });
  
  return Array.from(metricsMap.values());
}

// Helper to map model names
function normalizeModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('random') || lower.includes('rf')) return 'RandomForest';
  if (lower.includes('xgboost') || lower.includes('xgb')) return 'XGBoost';
  if (lower.includes('isolation') || lower.includes('if')) return 'IsolationForest';
  return model;
}

export default function Reports() {
  const { alerts } = useFraudAlerts();
  const { selectedModel, getModelInfo } = useModelSelector();
  
  // Extract all metrics
  const allMetrics = useMemo(() => extractMetricsFromAlerts(alerts), [alerts]);
  
  // Get metrics for selected model
  const selectedMetrics = useMemo(() => {
    const modelName = getModelInfo().name;
    return allMetrics.find(m => normalizeModelName(m.model) === modelName) || null;
  }, [allMetrics, getModelInfo]);

  // Prepare data for metrics comparison chart
  const metricsComparisonData = useMemo(() => {
    return allMetrics.map(m => ({
      name: normalizeModelName(m.model),
      Accuracy: (m.accuracy * 100).toFixed(1),
      Precision: (m.precision * 100).toFixed(1),
      Recall: (m.recall * 100).toFixed(1),
      'F1-Score': (m.f1_score * 100).toFixed(1),
    })).map(m => ({
      ...m,
      Accuracy: parseFloat(m.Accuracy),
      Precision: parseFloat(m.Precision),
      Recall: parseFloat(m.Recall),
      'F1-Score': parseFloat(m['F1-Score']),
    }));
  }, [allMetrics]);

  // Confusion matrix data for selected model
  const confusionMatrixData = useMemo(() => {
    if (!selectedMetrics) return null;
    
    return [
      { label: 'True Negative', value: selectedMetrics.tn, color: '#10b981' },
      { label: 'False Positive', value: selectedMetrics.fp, color: '#f59e0b' },
      { label: 'False Negative', value: selectedMetrics.fn, color: '#ef4444' },
      { label: 'True Positive', value: selectedMetrics.tp, color: '#3b82f6' },
    ];
  }, [selectedMetrics]);

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

  if (!selectedMetrics && allMetrics.length === 0) {
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center bg-white shadow-sm">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center bg-blue-50 text-blue-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="text-xl font-semibold text-gray-900 mb-2">No Metrics Available</div>
          <div className="text-sm text-gray-600">
            Metrics will appear here once the metrics tracker processes {MODELS[selectedModel].fullName} model predictions.
            <br />
            Metrics are calculated every 100 transactions.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📊 Model Performance Reports</h1>
        <p className="text-sm text-gray-600">
          Performance metrics for {getModelInfo().fullName}
          {selectedMetrics && (
            <span className="ml-2">
              • {selectedMetrics.total_samples.toLocaleString()} samples evaluated
            </span>
          )}
        </p>
      </div>

      {selectedMetrics && (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Accuracy</span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {(selectedMetrics.accuracy * 100).toFixed(2)}%
              </div>
            </div>
            
            <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Precision</span>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {(selectedMetrics.precision * 100).toFixed(2)}%
              </div>
            </div>
            
            <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Recall</span>
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {(selectedMetrics.recall * 100).toFixed(2)}%
              </div>
            </div>
            
            <div className="rounded-xl p-5 bg-white shadow-md border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">F1-Score</span>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {(selectedMetrics.f1_score * 100).toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Confusion Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl p-6 bg-white shadow-md border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Confusion Matrix</h2>
              
              {/* Confusion Matrix Grid */}
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-4 rounded-lg bg-green-100 border-2 border-green-300 text-center">
                    <div className="text-xs text-gray-600 mb-1">True Negative</div>
                    <div className="text-2xl font-bold text-green-700">{selectedMetrics.tn}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-100 border-2 border-yellow-300 text-center">
                    <div className="text-xs text-gray-600 mb-1">False Positive</div>
                    <div className="text-2xl font-bold text-yellow-700">{selectedMetrics.fp}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-100 border-2 border-red-300 text-center">
                    <div className="text-xs text-gray-600 mb-1">False Negative</div>
                    <div className="text-2xl font-bold text-red-700">{selectedMetrics.fn}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-100 border-2 border-blue-300 text-center">
                    <div className="text-xs text-gray-600 mb-1">True Positive</div>
                    <div className="text-2xl font-bold text-blue-700">{selectedMetrics.tp}</div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span className="text-gray-600">Correctly identified as legitimate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500"></div>
                  <span className="text-gray-600">Correctly identified as fraud</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-yellow-500"></div>
                  <span className="text-gray-600">Legitimate flagged as fraud</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500"></div>
                  <span className="text-gray-600">Fraud missed</span>
                </div>
              </div>
            </div>

            {/* Confusion Matrix Bar Chart */}
            <div className="rounded-xl p-6 bg-white shadow-md border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Confusion Matrix Distribution</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={confusionMatrixData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    formatter={(value: any) => [value.toLocaleString(), 'Count']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {confusionMatrixData?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Metrics Comparison Chart */}
          {metricsComparisonData.length > 0 && (
            <div className="rounded-xl p-6 bg-white shadow-md border border-gray-200 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Model Comparison</h2>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={metricsComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    style={{ fontSize: '12px' }}
                    domain={[0, 100]}
                    label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', style: { fontSize: '12px', fill: '#6b7280' } }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    formatter={(value: any) => [`${value}%`, '']}
                  />
                  <Legend />
                  <Bar dataKey="Accuracy" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Precision" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Recall" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="F1-Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detailed Stats */}
          <div className="rounded-xl p-6 bg-white shadow-md border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Detailed Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">True Positives</div>
                <div className="text-2xl font-bold text-blue-600">{selectedMetrics.tp.toLocaleString()}</div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">False Positives</div>
                <div className="text-2xl font-bold text-yellow-600">{selectedMetrics.fp.toLocaleString()}</div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">True Negatives</div>
                <div className="text-2xl font-bold text-green-600">{selectedMetrics.tn.toLocaleString()}</div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">False Negatives</div>
                <div className="text-2xl font-bold text-red-600">{selectedMetrics.fn.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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


// 🌿 Soft Pastel Confusion Matrix Colors (your requested palette)
const CONFUSION_MATRIX_COLORS = {
  // True Negative
  tn_bg: "#E6F8EC",
  tn_border: "#C9F0D8",
  tn_text: "#15803D",

  // False Positive
  fp_bg: "#FFF7DB",
  fp_border: "#FBEBAF",
  fp_text: "#B45309",

  // False Negative
  fn_bg: "#FDE7E9",
  fn_border: "#F9D0D4",
  fn_text: "#B91C1C",

  // True Positive
  tp_bg: "#E3EEFF",
  tp_border: "#C7DBFE",
  tp_text: "#1D4ED8",
};

// Legend colors (matching your palette)
const LEGEND_COLORS = {
  tn: "#16A34A",  // green
  fp: "#EAB308",  // yellow
  fn: "#EF4444",  // red
  tp: "#2563EB",  // blue
};


const METRIC_STYLES = {
  Accuracy:  { color: "#22d3ee" }, // Neon Cyan
  Precision: { color: "#818cf8" }, // Soft Neon Indigo
  Recall:    { color: "#facc15" }, // Neon Yellow
  "F1-Score": { color: "#fb7185" }, // Neon Rose
};




// Global bar settings for charts
const BAR_SIZE = 26;          // width of each bar
const BAR_CATEGORY_GAP = "30%"; // gap between groups
const BAR_GAP = 4;            // gap between bars in a group



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
        <h1 className="text-3xl font-bold text-gray-900 mb-2"> Model Performance Reports</h1>
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

              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-4">

                  {/* True Negative */}
                  <div
                    className="p-4 rounded-lg text-center border-2"
                    style={{
                      background: CONFUSION_MATRIX_COLORS.tn_bg,
                      borderColor: CONFUSION_MATRIX_COLORS.tn_border,
                    }}
                  >
                    <div className="text-sm text-gray-700 mb-1">True Negative</div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: CONFUSION_MATRIX_COLORS.tn_text }}
                    >
                      {selectedMetrics.tn}
                    </div>
                  </div>

                  {/* False Positive */}
                  <div
                    className="p-4 rounded-lg text-center border-2"
                    style={{
                      background: CONFUSION_MATRIX_COLORS.fp_bg,
                      borderColor: CONFUSION_MATRIX_COLORS.fp_border,
                    }}
                  >
                    <div className="text-sm text-gray-700 mb-1">False Positive</div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: CONFUSION_MATRIX_COLORS.fp_text }}
                    >
                      {selectedMetrics.fp}
                    </div>
                  </div>

                  {/* False Negative */}
                  <div
                    className="p-4 rounded-lg text-center border-2"
                    style={{
                      background: CONFUSION_MATRIX_COLORS.fn_bg,
                      borderColor: CONFUSION_MATRIX_COLORS.fn_border,
                    }}
                  >
                    <div className="text-sm text-gray-700 mb-1">False Negative</div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: CONFUSION_MATRIX_COLORS.fn_text }}
                    >
                      {selectedMetrics.fn}
                    </div>
                  </div>

                  {/* True Positive */}
                  <div
                    className="p-4 rounded-lg text-center border-2"
                    style={{
                      background: CONFUSION_MATRIX_COLORS.tp_bg,
                      borderColor: CONFUSION_MATRIX_COLORS.tp_border,
                    }}
                  >
                    <div className="text-sm text-gray-700 mb-1">True Positive</div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: CONFUSION_MATRIX_COLORS.tp_text }}
                    >
                      {selectedMetrics.tp}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-3 text-sm mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ background: LEGEND_COLORS.tn }}></div>
                  <span className="text-gray-700">Correctly identified as legitimate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ background: LEGEND_COLORS.tp }}></div>
                  <span className="text-gray-700">Correctly identified as fraud</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ background: LEGEND_COLORS.fp }}></div>
                  <span className="text-gray-700">Legitimate flagged as fraud</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ background: LEGEND_COLORS.fn }}></div>
                  <span className="text-gray-700">Fraud missed</span>
                </div>
              </div>
            </div>


            {/* Confusion Matrix Bar Chart */}
            <div className="rounded-xl p-6 bg-white shadow-md border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Confusion Matrix Distribution</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={confusionMatrixData || []}
                  barSize={26}
                  barCategoryGap="40%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                    formatter={(value: any) => [value.toLocaleString(), "Count"]}
                  />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]}>
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
                <BarChart
                  data={metricsComparisonData}
                  barSize={BAR_SIZE}
                  barCategoryGap={BAR_CATEGORY_GAP}
                  barGap={BAR_GAP}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                    domain={[0, 100]}
                    label={{
                      value: "Percentage (%)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: "12px", fill: "#6b7280" },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                    formatter={(value: any) => [`${value}%`, ""]}
                  />
                  <Legend iconType="circle" />

                  <Bar
                    dataKey="Accuracy"
                    fill={METRIC_STYLES["Accuracy"].color}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="F1-Score"
                    fill={METRIC_STYLES["F1-Score"].color}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="Precision"
                    fill={METRIC_STYLES["Precision"].color}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="Recall"
                    fill={METRIC_STYLES["Recall"].color}
                    radius={[2, 2, 0, 0]}
                  />
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

import React, { createContext, useContext, useState, useCallback } from "react";

export type ModelType = "rf" | "xgb" | "if";

type ModelInfo = {
  id: ModelType;
  name: string;
  fullName: string;
  predictionKey: string;
  scoreKey?: string;
};

export const MODELS: Record<ModelType, ModelInfo> = {
  rf: {
    id: "rf",
    name: "RandomForest",
    fullName: "Random Forest Classifier",
    predictionKey: "rf_fraud_prediction",
    scoreKey: "rf_score",
  },
  xgb: {
    id: "xgb",
    name: "XGBoost",
    fullName: "XGBoost Classifier",
    predictionKey: "xgb_fraud_prediction",
    scoreKey: "xgb_score",
  },
  if: {
    id: "if",
    name: "IsolationForest",
    fullName: "Isolation Forest",
    predictionKey: "if_fraud_prediction",
  },
};

type ModelSelectorContextType = {
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
  getModelInfo: () => ModelInfo;
  getPrediction: (transaction: any) => number;
  getScore: (transaction: any) => number | undefined;
};

const ModelSelectorContext = createContext<ModelSelectorContextType | undefined>(undefined);

const STORAGE_KEY = "fraudguard_selected_model";

export function ModelSelectorProvider({ children }: { children: React.ReactNode }) {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(() => {
    // Load from localStorage or default to RandomForest
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && (stored === "rf" || stored === "xgb" || stored === "if")) {
        return stored as ModelType;
      }
    } catch {
      // ignore
    }
    return "rf";
  });

  const setSelectedModel = useCallback((model: ModelType) => {
    setSelectedModelState(model);
    try {
      localStorage.setItem(STORAGE_KEY, model);
    } catch {
      // ignore storage errors
    }
  }, []);

  const getModelInfo = useCallback(() => {
    return MODELS[selectedModel];
  }, [selectedModel]);

  const getPrediction = useCallback(
    (transaction: any): number => {
      const modelInfo = MODELS[selectedModel];
      // Try the specific model prediction key first
      if (transaction[modelInfo.predictionKey] !== undefined) {
        return Number(transaction[modelInfo.predictionKey]) || 0;
      }
      // Fallback to generic 'fraud' field for backward compatibility
      if (transaction.fraud !== undefined) {
        return Number(transaction.fraud) || 0;
      }
      return 0;
    },
    [selectedModel]
  );

  const getScore = useCallback(
    (transaction: any): number | undefined => {
      const modelInfo = MODELS[selectedModel];
      // Try the specific model score key
      if (modelInfo.scoreKey && transaction[modelInfo.scoreKey] !== undefined) {
        const score = Number(transaction[modelInfo.scoreKey]);
        return isNaN(score) ? undefined : score;
      }
      // Fallback to generic 'score' field for backward compatibility
      if (transaction.score !== undefined) {
        const score = Number(transaction.score);
        return isNaN(score) ? undefined : score;
      }
      return undefined;
    },
    [selectedModel]
  );

  return (
    <ModelSelectorContext.Provider
      value={{ selectedModel, setSelectedModel, getModelInfo, getPrediction, getScore }}
    >
      {children}
    </ModelSelectorContext.Provider>
  );
}

export function useModelSelector() {
  const context = useContext(ModelSelectorContext);
  if (context === undefined) {
    throw new Error("useModelSelector must be used within a ModelSelectorProvider");
  }
  return context;
}


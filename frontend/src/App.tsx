import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FraudAlertsProvider } from "./contexts/FraudAlertsContext";
import { ModelSelectorProvider } from "./contexts/ModelSelectorContext";
import Shell from "./layouts/Shell";
import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <ModelSelectorProvider>
      <FraudAlertsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FraudAlertsProvider>
    </ModelSelectorProvider>
  );
}

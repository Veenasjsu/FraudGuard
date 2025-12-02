import React from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useModelSelector, MODELS } from "../contexts/ModelSelectorContext";

export default function Shell() {
  const { selectedModel, setSelectedModel } = useModelSelector();
  const navigate = useNavigate();
  const location = useLocation();
  const item = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer";
  const active = "!bg-indigo-100 !text-indigo-700";
  
  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <aside className="hidden md:flex md:w-64 fixed inset-y-0 left-0 border-r border-gray-200 bg-white px-4 py-6">
        <div className="w-full">
          <Link to="/" className="flex items-center gap-2 px-2 mb-6">
            <span className="text-indigo-600 text-xl">🛡️</span>
            <span className="font-semibold text-gray-900">FraudGuard</span>
          </Link>
          <nav className="space-y-1">
            <div 
              onClick={() => navigate("/")}
              className={`${item} ${isActive("/") ? active : ""}`}
            >
              Dashboard
            </div>
            <div 
              onClick={() => navigate("/alerts")}
              className={`${item} ${isActive("/alerts") ? active : ""}`}
            >
              Fraud Alerts
            </div>
            <div 
              onClick={() => navigate("/transactions")}
              className={`${item} ${isActive("/transactions") ? active : ""}`}
            >
              Transactions
            </div>
            <div 
              onClick={() => navigate("/reports")}
              className={`${item} ${isActive("/reports") ? active : ""}`}
            >
              Reports
            </div>
            <div 
              onClick={() => navigate("/settings")}
              className={`${item} ${isActive("/settings") ? active : ""}`}
            >
              Settings
            </div>
          </nav>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="hidden md:block text-gray-500">FraudGuard</div>
            <div className="w-full max-w-sm relative">
              <input className="w-full rounded-xl border border-gray-200 bg-gray-50 px-9 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                     placeholder="Search transactions, alerts..." />
              <span className="absolute left-3 top-2.5">🔍</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="model-selector" className="text-xs text-gray-500 hidden md:block">Model:</label>
                <select
                  id="model-selector"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  title="Select fraud detection model"
                >
                  <option value="rf">{MODELS.rf.fullName}</option>
                  <option value="xgb">{MODELS.xgb.fullName}</option>
                  <option value="if">{MODELS.if.fullName}</option>
                </select>
              </div>
              <span className="w-2 h-2 bg-rose-500 rounded-full"></span>
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

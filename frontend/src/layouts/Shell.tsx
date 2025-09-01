import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

export default function Shell() {
  const item = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700";
  const active = "!bg-indigo-100 !text-indigo-700";

  return (
    <div className="min-h-screen bg-gray-100">
      <aside className="hidden md:flex md:w-64 fixed inset-y-0 left-0 border-r border-gray-200 bg-white px-4 py-6">
        <div className="w-full">
          <Link to="/" className="flex items-center gap-2 px-2 mb-6">
            <span className="text-indigo-600 text-xl">🛡️</span>
            <span className="font-semibold text-gray-900">FraudGuard</span>
          </Link>
          <nav className="space-y-1">
            <NavLink to="/" end className={({isActive}) => `${item} ${isActive?active:""}`}>Dashboard</NavLink>
            <NavLink to="/alerts" className={({isActive}) => `${item} ${isActive?active:""}`}>Fraud Alerts</NavLink>
            <NavLink to="/transactions" className={({isActive}) => `${item} ${isActive?active:""}`}>Transactions</NavLink>
            <NavLink to="/reports" className={({isActive}) => `${item} ${isActive?active:""}`}>Reports</NavLink>
            <NavLink to="/settings" className={({isActive}) => `${item} ${isActive?active:""}`}>Settings</NavLink>
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

import React, { useState } from 'react';
import { useBridgeData } from './services/websocket';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { McpConsole } from './components/mcp/McpConsole';
import { RiskManagementPage } from './pages/RiskManagementPage';
import { EaSetupGuide } from './components/ea/EaSetupGuide';
import { AuditLogPage } from './pages/AuditLogPage';
import { DatabaseExplorer } from './components/database/DatabaseExplorer';
import { KnowledgeBasePage } from './components/knowledge/KnowledgeBasePage';
import { Activity, ShieldCheck, Terminal, Cpu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const { state, wsStatus, lastPingMs, reloadState } = useBridgeData();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        state={state}
        wsStatus={wsStatus}
        lastPingMs={lastPingMs}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardPage state={state} onRefresh={reloadState} onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'strategies' && <KnowledgeBasePage />}
        {activeTab === 'mcp' && <McpConsole />}
        {activeTab === 'risk' && <RiskManagementPage state={state} />}
        {activeTab === 'database' && <DatabaseExplorer />}
        {activeTab === 'ea' && <EaSetupGuide />}
        {activeTab === 'logs' && <AuditLogPage state={state} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400"></span>
            <span>MT5 Bridge Tunnel: <code className="text-slate-400">http://127.0.0.1:7777</code></span>
            <span>•</span>
            <span>EA File: <code className="text-slate-400">backend/ea/AIMT5Bridge.mq5</code></span>
          </div>

          <div className="flex items-center gap-4">
            <span>Protocol: MCP 2024-11-05</span>
            <span>•</span>
            <button
              onClick={() => setActiveTab('ea')}
              className="text-cyan-400 hover:underline"
            >
              EA Configuration Guide
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

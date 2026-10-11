import React, { useState, useEffect } from 'react';
import { AppState, StrategySignal } from '../types';
import { ApiConnectionRadar } from '../components/dashboard/ApiConnectionRadar';
import { CurrentChartSymbolCard } from '../components/dashboard/CurrentChartSymbolCard';
import { AccountMetricsBar } from '../components/dashboard/AccountMetricsBar';
import { LiveTickStream } from '../components/dashboard/LiveTickStream';
import { LivePriceChart } from '../components/dashboard/LivePriceChart';
import { OrderExecutionDock } from '../components/dashboard/OrderExecutionDock';
import { OpenPositionsTable } from '../components/dashboard/OpenPositionsTable';
import { AllTrackedSymbolsTable } from '../components/dashboard/AllTrackedSymbolsTable';
import { Compass, Zap, ArrowRight, TrendingUp, TrendingDown, Layers, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

interface DashboardPageProps {
  state: AppState | null;
  onRefresh?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ state, onRefresh, onNavigateTab }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadSignals() {
      try {
        setLoadingSignals(true);
        const res = await api.evaluateStrategySignals();
        if (mounted && Array.isArray(res?.signals)) {
          setSignals(res.signals);
        }
      } catch {
        // Silently tolerate transient fetch errors during initial boot or server restarts
      } finally {
        if (mounted) setLoadingSignals(false);
      }
    }
    loadSignals();
    const interval = setInterval(loadSignals, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const ticks = state?.ticks || [];
  const currentTick = ticks.find((t) => t.symbol === selectedSymbol) || ticks[0];
  const history = (state?.tickHistory && state.tickHistory[selectedSymbol]) || [];
  const positions = state?.positions || [];
  const account = state?.account || null;
  const riskGuard = state?.riskGuard || null;
  const currentChart = state?.currentChart || null;
  const allSymbols = state?.allSymbols || [];

  const symbolSignals = signals.filter(
    (s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase()
  );

  return (
    <div className="space-y-6">
      {/* 1. Real-Time API Connection Detector */}
      <ApiConnectionRadar state={state} onRefresh={onRefresh} />

      {/* 2. Account High-Level Metrics */}
      <AccountMetricsBar account={account} />

      {/* 3. Section for Current Symbol (Direct API Connected Chart) */}
      <CurrentChartSymbolCard
        currentChart={currentChart}
        onSelectSymbol={setSelectedSymbol}
        onRefresh={onRefresh}
        onNavigateTab={onNavigateTab}
      />

      {/* 4. Real-Time Tick Stream Bar */}
      <LiveTickStream
        ticks={ticks}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* 5. Main Operational Grid: Live Chart + Async Order Pad */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <LivePriceChart
            symbol={selectedSymbol}
            history={history}
            currentTick={currentTick}
            positions={positions}
          />
        </div>
        <div className="lg:col-span-4">
          <OrderExecutionDock
            selectedSymbol={selectedSymbol}
            ticks={ticks}
            riskGuard={riskGuard}
            onSelectSymbol={setSelectedSymbol}
          />
        </div>
      </div>

      {/* 6. Quantitative Strategy Engine & Signal Radar Preview */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Compass className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Quantitative Strategy Engine & Signal Radar
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {signals.length} Active Strategies
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Site-authoritative strategy models evaluating MT5 historical & live candles. EA functions solely as an execution bridge.
              </p>
            </div>
          </div>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('strategies')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <span>Manage & Backtest Strategies</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Signals for Selected Symbol or Portfolio overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {symbolSignals.length > 0 ? (
            symbolSignals.map((sig) => (
              <div
                key={sig.strategyId}
                className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 text-xs font-mono space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white truncate max-w-[180px]">{sig.strategyName}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      sig.signal === 'BUY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : sig.signal === 'SELL'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {sig.signal} ({sig.confidence}%)
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 font-sans line-clamp-2">
                  {sig.rationale}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>TF: {sig.timeframe}</span>
                  <span>Entry: {sig.entryPrice > 0 ? sig.entryPrice.toFixed(5) : 'Market'}</span>
                  {onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab('strategies')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                    >
                      Backtest <ArrowRight className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full bg-slate-950/60 border border-slate-800/60 rounded-lg p-4 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>
                  No direct quantitative strategy registered specifically for <strong className="text-white">{selectedSymbol}</strong>.
                </span>
              </div>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('strategies')}
                  className="text-cyan-400 hover:underline flex items-center gap-1 font-sans text-xs"
                >
                  Create Strategy for {selectedSymbol} <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 7. Active MT5 Open Positions */}
      <OpenPositionsTable
        positions={positions}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* 8. Section for All Tracked Symbols from MT5 Direct API */}
      <AllTrackedSymbolsTable
        symbols={allSymbols}
        ticks={ticks}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
        onNavigateTab={onNavigateTab}
      />
    </div>
  );
};
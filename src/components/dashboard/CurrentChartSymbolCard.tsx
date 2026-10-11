import React, { useState } from 'react';
import { ChartSymbolInfo } from '../../types';
import {
  Monitor,
  Zap,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  DollarSign,
  Download,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface CurrentChartSymbolCardProps {
  currentChart: ChartSymbolInfo | null;
  onSelectSymbol?: (symbol: string) => void;
  onRefresh?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const CurrentChartSymbolCard: React.FC<CurrentChartSymbolCardProps> = ({
  currentChart,
  onSelectSymbol,
  onRefresh,
  onNavigateTab,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRequestCandles = async (symbol: string, timeframe: string) => {
    try {
      setLoadingAction('request');
      const res = await fetch('/api/candles/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, count: 100 }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Requested 100 ${timeframe} candles via direct API for ${symbol}`);
        onRefresh?.();
      }
    } catch {
      setFeedback('Failed to request candles via direct API');
    } finally {
      setLoadingAction(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const handleSimulateCandles = async (symbol: string) => {
    try {
      setLoadingAction('simulate');
      const res = await fetch('/api/candles/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe: 'M1', count: 80, basePrice: currentChart?.bid || 1.085 }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback(`Generated ${data.count} test candles & indicators for ${symbol}`);
        onRefresh?.();
      }
    } catch {
      setFeedback('Simulation failed');
    } finally {
      setLoadingAction(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  if (!currentChart) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Current Connected Chart Symbol
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
            Awaiting Chart
          </span>
        </div>

        <div className="border border-dashed border-slate-800 rounded-lg p-6 text-center text-slate-400 font-mono text-xs space-y-3">
          <p className="text-sm font-semibold text-slate-300">
            No Active MT5 Chart Connected Yet
          </p>
          <p className="text-slate-500 max-w-md mx-auto text-[11px] leading-relaxed">
            The MT5 terminal is connected via the direct API. This section displays the active symbol specifications, live quotes, and session boundaries from the connected chart.
          </p>

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => handleSimulateCandles('EURUSD')}
              disabled={loadingAction === 'simulate'}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{loadingAction === 'simulate' ? 'Seeding...' : 'Test With Synthetic Candles'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const digits = currentChart.digits || (currentChart.symbol.includes('JPY') ? 3 : 5);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border border-cyan-800/40 rounded-xl p-5 shadow-lg shadow-cyan-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white font-mono tracking-tight">
                {currentChart.symbol}
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {currentChart.timeframe}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Chart (Direct API)
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {currentChart.description || 'MetaTrader 5 Connected Chart via Direct API'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateTab && (
            <button
              onClick={() => {
                onSelectSymbol?.(currentChart.symbol);
                onNavigateTab('strategies');
              }}
              title="View quantitative strategies and backtests for this active chart"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-cyan-300 font-mono text-xs border border-cyan-800/60 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>Strategies & Backtest</span>
            </button>
          )}

          <button
            onClick={() => handleRequestCandles(currentChart.symbol, currentChart.timeframe)}
            disabled={loadingAction === 'request'}
            title="Request historical candles directly from MT5 via API"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            <span>{loadingAction === 'request' ? 'Requesting...' : 'Pull Past Candles'}</span>
          </button>

          <button
            onClick={() => onSelectSymbol?.(currentChart.symbol)}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            Trade {currentChart.symbol}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="mb-3 p-2 rounded-lg bg-cyan-950/50 border border-cyan-800/50 text-xs font-mono text-cyan-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
        {/* Bid */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Bid</span>
          <div className="text-sm font-bold text-emerald-400 mt-0.5">
            {currentChart.bid.toFixed(digits)}
          </div>
        </div>

        {/* Ask */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Ask</span>
          <div className="text-sm font-bold text-slate-200 mt-0.5">
            {currentChart.ask.toFixed(digits)}
          </div>
        </div>

        {/* Spread */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Live Spread</span>
          <div className="text-sm font-bold text-cyan-300 mt-0.5">
            {currentChart.spread} pts
          </div>
        </div>

        {/* Lot Range */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Min / Max Lot</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.minLot} - {currentChart.maxLot}
          </div>
        </div>

        {/* Lot Step */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Lot Step</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.lotStep}
          </div>
        </div>

        {/* Contract Size */}
        <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-lg">
          <span className="text-[10px] text-slate-500 block uppercase">Contract Size</span>
          <div className="text-slate-300 mt-0.5 font-bold">
            {currentChart.contractSize.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Session Aggregates if available */}
      {currentChart.sessionHigh && currentChart.sessionHigh > 0 ? (
        <div className="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Open</span>
            <div className="text-slate-300 font-semibold">{currentChart.sessionOpen?.toFixed(digits) || '—'}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session High</span>
            <div className="text-emerald-400 font-semibold">{currentChart.sessionHigh.toFixed(digits)}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Low</span>
            <div className="text-rose-400 font-semibold">{currentChart.sessionLow?.toFixed(digits) || '—'}</div>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-900">
            <span className="text-[10px] text-slate-500 block uppercase">Session Vol (ticks)</span>
            <div className="text-cyan-300 font-semibold">{currentChart.sessionVolume?.toLocaleString() || '—'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
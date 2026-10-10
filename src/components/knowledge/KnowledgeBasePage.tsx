import React, { useState, useEffect } from 'react';
import {
  Compass,
  TrendingUp,
  TrendingDown,
  Play,
  Plus,
  BookOpen,
  FlaskConical,
  Award,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit,
  Eye,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Tag,
  Shield,
  BarChart2,
  Search,
  Filter,
  Check,
  RefreshCw,
  Sliders,
  DollarSign,
  Calendar,
  Zap,
  Send,
  Crosshair,
  Database,
  LineChart,
} from 'lucide-react';
import { api } from '../../services/api';
import { StrategyDefinition, Observation, BacktestResult, StrategySignal } from '../../types';

export const KnowledgeBasePage: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'strategies' | 'signals' | 'backtests' | 'observations'>('strategies');
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [backtests, setBacktests] = useState<BacktestResult[]>([]);
  const [liveSignals, setLiveSignals] = useState<StrategySignal[]>([]);
  const [evaluatingSignals, setEvaluatingSignals] = useState(false);
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);
  const [candleReqSymbol, setCandleReqSymbol] = useState('EURUSD');
  const [candleReqTf, setCandleReqTf] = useState('M1');
  const [candleReqCount, setCandleReqCount] = useState(100);
  const [requestingCandles, setRequestingCandles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyDefinition | null>(null);
  const [activeBacktestResult, setActiveBacktestResult] = useState<BacktestResult | null>(null);

  // Filter & Search
  const [strategySearch, setStrategySearch] = useState('');
  const [obsCategoryFilter, setObsCategoryFilter] = useState('all');

  // Modal / Form States
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showObsModal, setShowObsModal] = useState(false);
  const [backtestingStrategyId, setBacktestingStrategyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Strategy Form
  const [stratForm, setStratForm] = useState<{
    id?: string;
    name: string;
    description: string;
    type: StrategyDefinition['type'];
    symbol: string;
    timeframe: string;
    rsiOversold: number;
    rsiOverbought: number;
    fastEmaPeriod: number;
    slowEmaPeriod: number;
    stopLossPoints: number;
    takeProfitPoints: number;
    lotSize: number;
    maxHoldBars: number;
    tags: string;
    notes: string;
    status: 'active' | 'draft' | 'archived';
  }>({
    name: '',
    description: '',
    type: 'RSI_REVERSAL',
    symbol: 'EURUSD',
    timeframe: 'M1',
    rsiOversold: 30,
    rsiOverbought: 70,
    fastEmaPeriod: 9,
    slowEmaPeriod: 21,
    stopLossPoints: 300,
    takeProfitPoints: 600,
    lotSize: 0.1,
    maxHoldBars: 50,
    tags: 'RSI, Reversal',
    notes: '',
    status: 'active',
  });

  // Observation Form
  const [obsForm, setObsForm] = useState<{
    title: string;
    content: string;
    symbol: string;
    timeframe: string;
    category: Observation['category'];
    tags: string;
  }>({
    title: '',
    content: '',
    symbol: 'EURUSD',
    timeframe: 'M1',
    category: 'market_insight',
    tags: 'LondonOpen, Spread',
  });

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [stratsRes, obsRes, btRes] = await Promise.all([
        api.getStrategies().catch(() => ({ strategies: [] })),
        api.getObservations().catch(() => ({ observations: [] })),
        api.getBacktestHistory().catch(() => ({ results: [] })),
      ]);
      setStrategies(stratsRes.strategies || []);
      setObservations(obsRes.observations || []);
      setBacktests(btRes.results || []);

      if (stratsRes.strategies?.length > 0 && !selectedStrategy) {
        setSelectedStrategy(stratsRes.strategies[0]);
      }

      // Automatically evaluate signals
      api.evaluateStrategySignals().then((res) => {
        if (res.signals) setLiveSignals(res.signals);
      }).catch(() => {});
    } catch {
      // Tolerate transient errors during initial load
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleEvaluateSignals = async () => {
    try {
      setEvaluatingSignals(true);
      const res = await api.evaluateStrategySignals();
      setLiveSignals(res.signals || []);
      const actionable = (res.signals || []).filter((s) => s.signal !== 'NEUTRAL').length;
      showNotification(`Live signal evaluation completed: ${actionable} actionable signals found across ${res.signals?.length || 0} strategies.`);
    } catch (err: any) {
      showNotification(`Signal evaluation failed: ${err.message}`, 'error');
    } finally {
      setEvaluatingSignals(false);
    }
  };

  const handleExecuteSignal = async (stratId: string, customVol?: number) => {
    try {
      setExecutingSignalId(stratId);
      const res = await api.executeStrategySignal(stratId, customVol);
      if (res.success) {
        showNotification(`Order dispatched to MT5 command queue! Command ID: ${res.commandId}`);
        await handleEvaluateSignals();
      } else {
        showNotification(res.message, 'error');
      }
    } catch (err: any) {
      showNotification(`Failed to execute signal: ${err.message}`, 'error');
    } finally {
      setExecutingSignalId(null);
    }
  };

  const handleRequestMt5Candles = async () => {
    try {
      setRequestingCandles(true);
      await api.requestChartHistory(candleReqSymbol, candleReqTf, candleReqCount);
      showNotification(`Requested ${candleReqCount} ${candleReqTf} candles for ${candleReqSymbol} from MT5 EA.`);
    } catch (err: any) {
      showNotification(`Candle request error: ${err.message}`, 'error');
    } finally {
      setRequestingCandles(false);
    }
  };

  const handleSimulateCandles = async () => {
    try {
      setRequestingCandles(true);
      await api.simulateCandles(candleReqSymbol, candleReqTf, candleReqCount);
      showNotification(`Generated ${candleReqCount} synthetic test candles for ${candleReqSymbol} in SQLite.`);
      await loadAllData();
    } catch (err: any) {
      showNotification(`Simulation error: ${err.message}`, 'error');
    } finally {
      setRequestingCandles(false);
    }
  };

  const handleSaveStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: stratForm.name,
        description: stratForm.description,
        type: stratForm.type,
        symbol: stratForm.symbol,
        timeframe: stratForm.timeframe,
        status: stratForm.status,
        tags: stratForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: stratForm.notes,
        parameters: {
          rsiOversold: Number(stratForm.rsiOversold),
          rsiOverbought: Number(stratForm.rsiOverbought),
          fastEmaPeriod: Number(stratForm.fastEmaPeriod),
          slowEmaPeriod: Number(stratForm.slowEmaPeriod),
          stopLossPoints: Number(stratForm.stopLossPoints),
          takeProfitPoints: Number(stratForm.takeProfitPoints),
          lotSize: Number(stratForm.lotSize),
          maxHoldBars: Number(stratForm.maxHoldBars),
        },
      };
      if (stratForm.id) payload.id = stratForm.id;

      const res = await api.saveStrategy(payload);
      if (res.success) {
        showNotification(`Strategy "${res.strategy.name}" saved!`);
        setShowStrategyModal(false);
        await loadAllData();
        setSelectedStrategy(res.strategy);
      }
    } catch (err: any) {
      showNotification(`Failed to save: ${err.message}`, 'error');
    }
  };

  const handleDeleteStrategy = async (id: string, name: string) => {
    if (!confirm(`Delete strategy "${name}" from knowledge base?`)) return;
    try {
      await api.deleteStrategy(id);
      showNotification(`Strategy "${name}" deleted.`);
      if (selectedStrategy?.id === id) setSelectedStrategy(null);
      await loadAllData();
    } catch (err: any) {
      showNotification(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleRunBacktest = async (strategy: StrategyDefinition) => {
    try {
      setBacktestingStrategyId(strategy.id);
      const res = await api.runBacktest(strategy.id, {
        candleLimit: 300,
        initialDeposit: 10000,
      });
      if (res.success) {
        setActiveBacktestResult(res.result);
        setActiveSubTab('backtests');
        showNotification(`Backtest for "${strategy.name}" completed! Net Profit: $${res.result.netProfit}`);
        await loadAllData();
      }
    } catch (err: any) {
      showNotification(`Backtest error: ${err.message}`, 'error');
    } finally {
      setBacktestingStrategyId(null);
    }
  };

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        title: obsForm.title,
        content: obsForm.content,
        symbol: obsForm.symbol ? obsForm.symbol : null,
        timeframe: obsForm.timeframe ? obsForm.timeframe : null,
        category: obsForm.category,
        tags: obsForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const res = await api.saveObservation(payload);
      if (res.success) {
        showNotification(`Observation "${res.observation.title}" logged!`);
        setShowObsModal(false);
        setObsForm({
          title: '',
          content: '',
          symbol: 'EURUSD',
          timeframe: 'M1',
          category: 'market_insight',
          tags: '',
        });
        await loadAllData();
      }
    } catch (err: any) {
      showNotification(`Failed to log observation: ${err.message}`, 'error');
    }
  };

  const handleDeleteObservation = async (id: string, title: string) => {
    if (!confirm(`Delete observation "${title}"?`)) return;
    try {
      await api.deleteObservation(id);
      showNotification(`Observation deleted.`);
      await loadAllData();
    } catch (err: any) {
      showNotification(`Failed: ${err.message}`, 'error');
    }
  };

  const filteredStrategies = strategies.filter((s) => {
    if (strategySearch) {
      const q = strategySearch.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.symbol.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredObservations = observations.filter((o) => {
    if (obsCategoryFilter !== 'all' && o.category !== obsCategoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Compass className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Knowledge Base, Strategy Lab & Backtesting Engine
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Design algorithmic rules, formulate market observations, and run simulated backtests against
              historical MT5 candles uploaded by the EA. The bridge acts purely as an execution engine — all
              strategy logic and intelligence lives on the site.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={() => {
                setStratForm({
                  name: '',
                  description: '',
                  type: 'RSI_REVERSAL',
                  symbol: 'EURUSD',
                  timeframe: 'M1',
                  rsiOversold: 30,
                  rsiOverbought: 70,
                  fastEmaPeriod: 9,
                  slowEmaPeriod: 21,
                  stopLossPoints: 300,
                  takeProfitPoints: 600,
                  lotSize: 0.1,
                  maxHoldBars: 50,
                  tags: 'RSI, Reversal',
                  notes: '',
                  status: 'active',
                });
                setShowStrategyModal(true);
              }}
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/50"
            >
              <Plus className="h-4 w-4" />
              <span>Create Strategy</span>
            </button>

            <button
              onClick={() => setShowObsModal(true)}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              <span>Record Observation</span>
            </button>

            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh Knowledge Base"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-800 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-sm font-mono overflow-x-auto pb-1">
        <button
          onClick={() => setActiveSubTab('strategies')}
          className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'strategies'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Strategies ({strategies.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('signals');
            if (liveSignals.length === 0) handleEvaluateSignals();
          }}
          className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'signals'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="h-4 w-4 text-amber-400" />
          <span>
            Live Signals ({liveSignals.filter((s) => s.signal !== 'NEUTRAL').length} Actionable)
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('backtests')}
          className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'backtests'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="h-4 w-4" />
          <span>Backtest Results ({backtests.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('observations')}
          className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeSubTab === 'observations'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Observations & Patterns ({observations.length})</span>
        </button>
      </div>

      {/* SUBTAB 1: STRATEGIES */}
      {activeSubTab === 'strategies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Strategy List */}
          <div className="lg:col-span-1 space-y-3 font-mono">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search strategies..."
                value={strategySearch}
                onChange={(e) => setStrategySearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {filteredStrategies.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  No strategies found.
                </div>
              ) : (
                filteredStrategies.map((s) => {
                  const isSelected = selectedStrategy?.id === s.id;
                  const isBacktesting = backtestingStrategyId === s.id;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedStrategy(s)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-900/90 border-cyan-500/70 shadow-md shadow-cyan-950/40'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white truncate">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono shrink-0">
                          {s.symbol} {s.timeframe}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {s.description}
                      </p>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          {s.type}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunBacktest(s);
                            }}
                            disabled={isBacktesting}
                            className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1 transition-colors"
                            title="Run Backtest on stored MT5 candles"
                          >
                            <Play className={`h-2.5 w-2.5 ${isBacktesting ? 'animate-spin' : ''}`} />
                            <span>{isBacktesting ? 'Testing...' : 'Test'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Strategy Inspector */}
          <div className="lg:col-span-2">
            {selectedStrategy ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5 font-mono">
                {/* Title & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">{selectedStrategy.name}</h2>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold uppercase">
                        {selectedStrategy.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Author: <span className="text-slate-200">{selectedStrategy.author || 'User'}</span> • Updated:{' '}
                      {new Date(selectedStrategy.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunBacktest(selectedStrategy)}
                      disabled={backtestingStrategyId === selectedStrategy.id}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>
                        {backtestingStrategyId === selectedStrategy.id ? 'Running Test...' : 'Run Backtest'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setStratForm({
                          id: selectedStrategy.id,
                          name: selectedStrategy.name,
                          description: selectedStrategy.description,
                          type: selectedStrategy.type,
                          symbol: selectedStrategy.symbol,
                          timeframe: selectedStrategy.timeframe,
                          rsiOversold: selectedStrategy.parameters?.rsiOversold ?? 30,
                          rsiOverbought: selectedStrategy.parameters?.rsiOverbought ?? 70,
                          fastEmaPeriod: selectedStrategy.parameters?.fastEmaPeriod ?? 9,
                          slowEmaPeriod: selectedStrategy.parameters?.slowEmaPeriod ?? 21,
                          stopLossPoints: selectedStrategy.parameters?.stopLossPoints ?? 300,
                          takeProfitPoints: selectedStrategy.parameters?.takeProfitPoints ?? 600,
                          lotSize: selectedStrategy.parameters?.lotSize ?? 0.1,
                          maxHoldBars: selectedStrategy.parameters?.maxHoldBars ?? 50,
                          tags: (selectedStrategy.tags || []).join(', '),
                          notes: selectedStrategy.notes || '',
                          status: (selectedStrategy.status as any) || 'active',
                        });
                        setShowStrategyModal(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Edit Strategy"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteStrategy(selectedStrategy.id, selectedStrategy.name)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors"
                      title="Delete Strategy"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Description & Thesis */}
                <div>
                  <h3 className="text-xs uppercase text-slate-400 font-bold mb-1">Thesis & Mechanics</h3>
                  <p className="text-xs text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                    {selectedStrategy.description}
                  </p>
                </div>

                {/* Parameters Matrix */}
                <div>
                  <h3 className="text-xs uppercase text-slate-400 font-bold mb-2">Algorithm Parameters</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Symbol / TF</span>
                      <span className="font-bold text-cyan-300 mt-0.5 block">
                        {selectedStrategy.symbol} • {selectedStrategy.timeframe}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">SL / TP Points</span>
                      <span className="font-bold text-amber-300 mt-0.5 block">
                        {selectedStrategy.parameters?.stopLossPoints || 300} /{' '}
                        {selectedStrategy.parameters?.takeProfitPoints || 600}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Lot Size</span>
                      <span className="font-bold text-white mt-0.5 block">
                        {selectedStrategy.parameters?.lotSize || 0.1} lots
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Max Bar Hold</span>
                      <span className="font-bold text-slate-300 mt-0.5 block">
                        {selectedStrategy.parameters?.maxHoldBars || 50} bars
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tags & Research Notes */}
                {selectedStrategy.tags && selectedStrategy.tags.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase text-slate-400 font-bold mb-1.5">Classification Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStrategy.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedStrategy.notes && (
                  <div>
                    <h3 className="text-xs uppercase text-slate-400 font-bold mb-1">Execution Notes</h3>
                    <p className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                      {selectedStrategy.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl p-12 text-center text-slate-500 font-mono text-xs">
                Select a strategy on the left or create a new one to inspect its parameters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: LIVE SIGNALS RADAR */}
      {activeSubTab === 'signals' && (
        <div className="space-y-6 font-mono">
          {/* Signal Control & MT5 History Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Zap className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-bold text-white">Live Quantitative Signal Radar</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Evaluates active algorithmic rules bar-by-bar against MT5 chart candles and quotes uploaded by the EA.
                  When a signal is active, dispatch it directly into the MT5 command queue for execution.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleEvaluateSignals}
                  disabled={evaluatingSignals}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${evaluatingSignals ? 'animate-spin' : ''}`} />
                  <span>{evaluatingSignals ? 'Evaluating...' : 'Re-Evaluate Signals'}</span>
                </button>
              </div>
            </div>

            {/* Historical MT5 Candle Synchronizer Tool */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="text-slate-300 font-bold">MT5 History Sync:</span>
                <span className="text-slate-500">Pull historical chart candles from MT5 terminal for testing:</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={candleReqSymbol}
                  onChange={(e) => setCandleReqSymbol(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                >
                  <option value="EURUSD">EURUSD</option>
                  <option value="GBPUSD">GBPUSD</option>
                  <option value="USDJPY">USDJPY</option>
                  <option value="XAUUSD">XAUUSD</option>
                  <option value="BTCUSD">BTCUSD</option>
                  <option value="AUDUSD">AUDUSD</option>
                </select>

                <select
                  value={candleReqTf}
                  onChange={(e) => setCandleReqTf(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                >
                  <option value="M1">M1</option>
                  <option value="M5">M5</option>
                  <option value="M15">M15</option>
                  <option value="H1">H1</option>
                  <option value="D1">D1</option>
                </select>

                <select
                  value={candleReqCount}
                  onChange={(e) => setCandleReqCount(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                >
                  <option value={60}>60 bars</option>
                  <option value={100}>100 bars</option>
                  <option value={300}>300 bars</option>
                  <option value={500}>500 bars</option>
                </select>

                <button
                  onClick={handleRequestMt5Candles}
                  disabled={requestingCandles}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800 text-xs font-bold transition-colors"
                  title="Request historical candles from running MT5 EA"
                >
                  {requestingCandles ? 'Requesting...' : 'Request from MT5 EA'}
                </button>

                <button
                  onClick={handleSimulateCandles}
                  disabled={requestingCandles}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors"
                  title="Seed test candlestick data into local SQLite"
                >
                  Seed Test Bars
                </button>
              </div>
            </div>
          </div>

          {/* Active Signals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveSignals.length === 0 ? (
              <div className="col-span-2 p-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
                <Crosshair className="h-6 w-6 text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-slate-400">No signals evaluated yet.</p>
                <p className="mt-1">Click "Re-Evaluate Signals" above to check all active strategies against current MT5 quotes.</p>
              </div>
            ) : (
              liveSignals.map((sig) => {
                const isBuy = sig.signal === 'BUY';
                const isSell = sig.signal === 'SELL';
                const isNeutral = sig.signal === 'NEUTRAL';
                const isExecuting = executingSignalId === sig.strategyId;

                return (
                  <div
                    key={sig.strategyId}
                    className={`bg-slate-900/90 border rounded-xl p-5 shadow-sm space-y-4 transition-all ${
                      isBuy
                        ? 'border-emerald-500/50 shadow-emerald-950/20'
                        : isSell
                        ? 'border-rose-500/50 shadow-rose-950/20'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-white">{sig.strategyName}</h3>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {sig.symbol} • {sig.timeframe} • Evaluated: {new Date(sig.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-extrabold flex items-center gap-1.5 border uppercase ${
                            isBuy
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                              : isSell
                              ? 'bg-rose-950 text-rose-300 border-rose-700'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          {isBuy && <ArrowUpRight className="h-3.5 w-3.5" />}
                          {isSell && <ArrowDownRight className="h-3.5 w-3.5" />}
                          {sig.signal}
                        </span>

                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-bold">
                          {sig.confidence}% Conviction
                        </span>
                      </div>
                    </div>

                    {/* Rationale explanation */}
                    <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-xs font-sans text-slate-200 leading-relaxed">
                      {sig.rationale}
                    </div>

                    {/* Price Matrix */}
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Est. Entry</span>
                        <span className="font-bold text-white mt-0.5 block">{sig.entryPrice || '—'}</span>
                      </div>

                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Stop Loss</span>
                        <span className="font-bold text-rose-400 mt-0.5 block">{sig.sl || '—'}</span>
                      </div>

                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Take Profit</span>
                        <span className="font-bold text-emerald-400 mt-0.5 block">{sig.tp || '—'}</span>
                      </div>

                      <div className="bg-slate-950 p-2 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Volume</span>
                        <span className="font-bold text-cyan-300 mt-0.5 block">{sig.lotSize} lots</span>
                      </div>
                    </div>

                    {/* Indicator values snapshot */}
                    {sig.indicatorsSnapshot && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 border-t border-slate-800/60 pt-3">
                        {sig.indicatorsSnapshot.rsi !== null && sig.indicatorsSnapshot.rsi !== undefined && (
                          <span>RSI: <strong className="text-white">{sig.indicatorsSnapshot.rsi.toFixed(1)}</strong></span>
                        )}
                        {sig.indicatorsSnapshot.macdHistogram !== undefined && (
                          <span>MACD Hist: <strong className="text-white">{sig.indicatorsSnapshot.macdHistogram.toFixed(4)}</strong></span>
                        )}
                        {sig.indicatorsSnapshot.summary && (
                          <span>Consensus: <strong className="text-cyan-300">{sig.indicatorsSnapshot.summary}</strong></span>
                        )}
                      </div>
                    )}

                    {/* Execution Action Button */}
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <button
                        onClick={() => {
                          const strat = strategies.find((s) => s.id === sig.strategyId);
                          if (strat) handleRunBacktest(strat);
                        }}
                        className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        <span>Run Backtest</span>
                      </button>

                      {!isNeutral ? (
                        <button
                          onClick={() => handleExecuteSignal(sig.strategyId)}
                          disabled={isExecuting}
                          className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                            isBuy
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                          }`}
                        >
                          <Send className={`h-3.5 w-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
                          <span>{isExecuting ? 'Dispatching...' : `Dispatch ${sig.signal} Order to MT5 Bridge`}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          Awaiting entry condition trigger
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: BACKTEST RESULTS */}
      {activeSubTab === 'backtests' && (
        <div className="space-y-6 font-mono">
          {activeBacktestResult ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-6">
              {/* Backtest Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Award className="h-4 w-4" />
                    </span>
                    <h2 className="text-base font-bold text-white">
                      Backtest Report: {activeBacktestResult.strategyName}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Evaluated across {activeBacktestResult.candleCount} candles ({activeBacktestResult.symbol}{' '}
                    {activeBacktestResult.timeframe}) • {new Date(activeBacktestResult.evaluatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-extrabold ${
                      activeBacktestResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {activeBacktestResult.netProfit >= 0 ? '+' : ''}${activeBacktestResult.netProfit.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400">Net Profit</span>
                </div>
              </div>

              {/* Core Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Win Rate</span>
                  <span
                    className={`text-base font-bold mt-1 block ${
                      activeBacktestResult.winRatePct >= 50 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {activeBacktestResult.winRatePct}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {activeBacktestResult.winningTrades}W / {activeBacktestResult.losingTrades}L
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Profit Factor</span>
                  <span className="text-base font-bold text-white mt-1 block">
                    {activeBacktestResult.profitFactor}
                  </span>
                  <span className="text-[10px] text-slate-500">Gross Gain / Loss</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Total Trades</span>
                  <span className="text-base font-bold text-cyan-300 mt-1 block">
                    {activeBacktestResult.totalTrades}
                  </span>
                  <span className="text-[10px] text-slate-500">Completed Orders</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Max Drawdown</span>
                  <span className="text-base font-bold text-rose-400 mt-1 block">
                    {activeBacktestResult.maxDrawdownPct}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    -${activeBacktestResult.maxDrawdownUsd.toFixed(1)}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Avg Win / Loss</span>
                  <span className="text-base font-bold text-slate-200 mt-1 block">
                    ${activeBacktestResult.averageWin} / -${activeBacktestResult.averageLoss}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    R:R {activeBacktestResult.riskRewardRatio}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Final Equity</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block">
                    ${activeBacktestResult.finalEquity.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    From ${activeBacktestResult.initialDeposit}
                  </span>
                </div>
              </div>

              {/* Equity Curve SVG Chart */}
              {activeBacktestResult.equityCurve && activeBacktestResult.equityCurve.length > 1 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 font-bold text-slate-200">
                      <LineChart className="h-4 w-4 text-cyan-400" />
                      <span>Backtest Equity Curve Trajectory</span>
                    </span>
                    <div className="flex items-center gap-4 text-[11px]">
                      <span>Deposit: <strong className="text-white">${activeBacktestResult.initialDeposit}</strong></span>
                      <span>Final: <strong className={activeBacktestResult.finalEquity >= activeBacktestResult.initialDeposit ? 'text-emerald-400' : 'text-rose-400'}>${activeBacktestResult.finalEquity.toFixed(2)}</strong></span>
                    </div>
                  </div>

                  <div className="w-full overflow-hidden">
                    {(() => {
                      const curve = activeBacktestResult.equityCurve;
                      const equities = curve.map((c) => c.equity);
                      const minEq = Math.min(...equities, activeBacktestResult.initialDeposit);
                      const maxEq = Math.max(...equities, activeBacktestResult.initialDeposit);
                      const range = maxEq - minEq || 1;
                      const width = 800;
                      const height = 160;
                      const pad = 15;

                      const points = curve.map((c, idx) => {
                        const x = pad + (idx / (curve.length - 1)) * (width - pad * 2);
                        const y = height - pad - ((c.equity - minEq) / range) * (height - pad * 2);
                        return `${x},${y}`;
                      });

                      const pathD = `M ${points.join(' L ')}`;
                      const areaD = `M ${points[0]} L ${points.join(' L ')} L ${width - pad},${height - pad} L ${pad},${height - pad} Z`;
                      const isProfit = activeBacktestResult.netProfit >= 0;
                      const baseLineY = height - pad - ((activeBacktestResult.initialDeposit - minEq) / range) * (height - pad * 2);

                      return (
                        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
                          <defs>
                            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={isProfit ? '#06b6d4' : '#f43f5e'} stopOpacity="0.4" />
                              <stop offset="100%" stopColor={isProfit ? '#06b6d4' : '#f43f5e'} stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <line
                            x1={pad}
                            y1={baseLineY}
                            x2={width - pad}
                            y2={baseLineY}
                            stroke="#475569"
                            strokeDasharray="4 4"
                            strokeWidth="1"
                          />
                          <path d={areaD} fill="url(#eqGrad)" />
                          <path d={pathD} fill="none" stroke={isProfit ? '#22d3ee' : '#f43f5e'} strokeWidth="2.5" />
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Simulated Trades Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Simulated Trade Execution Logs ({activeBacktestResult.trades?.length || 0})
                </h3>
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Trade ID</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Entry Price</th>
                        <th className="py-2.5 px-3">Exit Price</th>
                        <th className="py-2.5 px-3">Profit (USD)</th>
                        <th className="py-2.5 px-3">Points</th>
                        <th className="py-2.5 px-3">Exit Reason</th>
                        <th className="py-2.5 px-3 text-right">Exit Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {activeBacktestResult.trades?.map((trd) => {
                        const isWin = trd.profitUsd >= 0;
                        return (
                          <tr key={trd.id} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 text-slate-400">{trd.id}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  trd.type === 'BUY'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                              >
                                {trd.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-200">{trd.entryPrice}</td>
                            <td className="py-2 px-3 font-semibold text-slate-200">{trd.exitPrice}</td>
                            <td
                              className={`py-2 px-3 font-bold ${
                                isWin ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isWin ? '+' : ''}${trd.profitUsd.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{trd.profitPoints} pts</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                {trd.exitReason}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-500">
                              {new Date(trd.exitTime * 1000).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 font-mono text-xs">
              <FlaskConical className="h-6 w-6 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 font-bold">No active backtest report selected.</p>
              <p className="mt-1">
                Go to the Strategies tab and click "Run Backtest" or pick an archived run below.
              </p>
            </div>
          )}

          {/* Archived Backtest Runs */}
          {backtests.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Archived Backtest Runs in SQLite ({backtests.length})
              </h3>
              <div className="divide-y divide-slate-800/60">
                {backtests.map((bt) => (
                  <div
                    key={bt.id}
                    onClick={() => setActiveBacktestResult(bt)}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 px-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{bt.strategyName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                          {bt.symbol} {bt.timeframe}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        {new Date(bt.evaluatedAt).toLocaleString()} • {bt.totalTrades} trades • {bt.winRatePct}% win rate
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-bold text-sm block ${
                          bt.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {bt.netProfit >= 0 ? '+' : ''}${bt.netProfit.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500">PF: {bt.profitFactor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: OBSERVATIONS */}
      {activeSubTab === 'observations' && (
        <div className="space-y-4 font-mono">
          {/* Category Filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Filter Category:</span>
              {(['all', 'market_insight', 'pattern', 'execution_note', 'anomaly', 'research'] as const).map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() => setObsCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                      obsCategoryFilter === cat
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                )
              )}
            </div>

            <button
              onClick={() => setShowObsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Observation</span>
            </button>
          </div>

          {/* Observations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredObservations.length === 0 ? (
              <div className="col-span-2 p-10 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                No observations found in this category.
              </div>
            ) : (
              filteredObservations.map((obs) => (
                <div
                  key={obs.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                          <BookOpen className="h-3.5 w-3.5" />
                        </span>
                        <h3 className="font-bold text-xs text-white leading-snug">{obs.title}</h3>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 capitalize shrink-0">
                        {obs.category.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2.5 leading-relaxed font-sans bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                      {obs.content}
                    </p>

                    {obs.metrics && Object.keys(obs.metrics).length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
                        {Object.entries(obs.metrics).map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80"
                          >
                            {k}: <strong className="text-white">{String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-800 text-[10px] text-slate-500">
                    <span>
                      {obs.symbol ? `${obs.symbol} • ` : ''}
                      {new Date(obs.createdAt).toLocaleDateString()}
                    </span>

                    <button
                      onClick={() => handleDeleteObservation(obs.id, obs.title)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Delete observation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT STRATEGY */}
      {showStrategyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 font-mono text-xs space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {stratForm.id ? 'Edit Trading Strategy' : 'Create New Trading Strategy'}
              </h2>
              <button
                onClick={() => setShowStrategyModal(false)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStrategy} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Strategy Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RSI Mean Reversion Scalp"
                  value={stratForm.name}
                  onChange={(e) => setStratForm({ ...stratForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Thesis & Rules</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe when the strategy enters and exits..."
                  value={stratForm.description}
                  onChange={(e) => setStratForm({ ...stratForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Strategy Type</label>
                  <select
                    value={stratForm.type}
                    onChange={(e) => setStratForm({ ...stratForm, type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="RSI_REVERSAL">RSI Reversal</option>
                    <option value="EMA_CROSSOVER">EMA Crossover</option>
                    <option value="MACD_MOMENTUM">MACD Momentum</option>
                    <option value="BOLLINGER_BREAKOUT">Bollinger Bands</option>
                    <option value="MULTI_INDICATOR_CONSENSUS">Multi-Indicator</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Target Symbol</label>
                  <input
                    type="text"
                    required
                    value={stratForm.symbol}
                    onChange={(e) => setStratForm({ ...stratForm, symbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Timeframe</label>
                  <select
                    value={stratForm.timeframe}
                    onChange={(e) => setStratForm({ ...stratForm, timeframe: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="D1">D1</option>
                  </select>
                </div>
              </div>

              {/* Parameter Settings */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <span className="text-[10px] uppercase text-cyan-400 font-bold block">
                  Algorithm & Risk Parameters
                </span>
                <div className="grid grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">RSI Oversold</label>
                    <input
                      type="number"
                      value={stratForm.rsiOversold}
                      onChange={(e) => setStratForm({ ...stratForm, rsiOversold: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">RSI Overbought</label>
                    <input
                      type="number"
                      value={stratForm.rsiOverbought}
                      onChange={(e) => setStratForm({ ...stratForm, rsiOverbought: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Fast EMA (9)</label>
                    <input
                      type="number"
                      value={stratForm.fastEmaPeriod}
                      onChange={(e) => setStratForm({ ...stratForm, fastEmaPeriod: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Slow EMA (21)</label>
                    <input
                      type="number"
                      value={stratForm.slowEmaPeriod}
                      onChange={(e) => setStratForm({ ...stratForm, slowEmaPeriod: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">SL (Points)</label>
                    <input
                      type="number"
                      value={stratForm.stopLossPoints}
                      onChange={(e) => setStratForm({ ...stratForm, stopLossPoints: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">TP (Points)</label>
                    <input
                      type="number"
                      value={stratForm.takeProfitPoints}
                      onChange={(e) => setStratForm({ ...stratForm, takeProfitPoints: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Lot Size</label>
                    <input
                      type="number"
                      step="0.01"
                      value={stratForm.lotSize}
                      onChange={(e) => setStratForm({ ...stratForm, lotSize: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 block mb-0.5">Max Hold Bars</label>
                    <input
                      type="number"
                      value={stratForm.maxHoldBars}
                      onChange={(e) => setStratForm({ ...stratForm, maxHoldBars: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="RSI, Reversal, Forex"
                  value={stratForm.tags}
                  onChange={(e) => setStratForm({ ...stratForm, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStrategyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Save Strategy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG OBSERVATION */}
      {showObsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 font-mono text-xs space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Record Market Observation / Insight
              </h2>
              <button onClick={() => setShowObsModal(false)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveObservation} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Headline / Pattern</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. London Open EURUSD False Breakout"
                  value={obsForm.title}
                  onChange={(e) => setObsForm({ ...obsForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Notes & Empirical Finding</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Document observations, slippage patterns, session dynamics..."
                  value={obsForm.content}
                  onChange={(e) => setObsForm({ ...obsForm, content: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Category</label>
                  <select
                    value={obsForm.category}
                    onChange={(e) => setObsForm({ ...obsForm, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="market_insight">Market Insight</option>
                    <option value="pattern">Pattern</option>
                    <option value="execution_note">Execution Note</option>
                    <option value="anomaly">Anomaly</option>
                    <option value="research">Research</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Symbol</label>
                  <input
                    type="text"
                    value={obsForm.symbol}
                    onChange={(e) => setObsForm({ ...obsForm, symbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Timeframe</label>
                  <input
                    type="text"
                    value={obsForm.timeframe}
                    onChange={(e) => setObsForm({ ...obsForm, timeframe: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-slate-400 block mb-1">Tags</label>
                <input
                  type="text"
                  placeholder="LondonOpen, Spread, Volatility"
                  value={obsForm.tags}
                  onChange={(e) => setObsForm({ ...obsForm, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowObsModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  Log Observation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

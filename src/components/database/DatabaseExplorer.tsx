import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Database,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileSpreadsheet,
  Clock,
  Layers,
  Trash2,
  ShieldCheck,
  Check,
  Compass,
  FlaskConical,
} from 'lucide-react';

export const DatabaseExplorer: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [activeTable, setActiveTable] = useState<'orders' | 'strategies' | 'observations' | 'backtest_results' | 'candles_history' | 'ticks_history' | 'account_history'>('orders');
  const [tableData, setTableData] = useState<{ columns: string[]; rows: any[]; total: number } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruneFeedback, setPruneFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const loadData = async (tableToLoad = activeTable) => {
    try {
      setLoading(true);
      const [anData, tData] = await Promise.all([
        api.getDatabaseAnalytics().catch(() => null),
        api.getTableData(tableToLoad, 100).catch(() => null),
      ]);
      if (anData) setAnalytics(anData);
      if (tData) {
        setTableData(tData);
        if (tableToLoad === 'orders') setOrders(tData.rows || []);
      }
    } catch {
      // Tolerate transient errors when table data is empty or reloading
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (table: typeof activeTable) => {
    setActiveTable(table);
    setSearchTerm('');
    loadData(table);
  };

  const handlePrune = async () => {
    try {
      setPruning(true);
      const res = await api.pruneDatabase();
      setPruneFeedback(res.message);
      await loadData();
    } catch (err: any) {
      setPruneFeedback(`Pruning error: ${err?.message || err}`);
    } finally {
      setPruning(false);
      setTimeout(() => setPruneFeedback(null), 4000);
    }
  };

  useEffect(() => {
    loadData(activeTable);
  }, []);

  const filteredRows = (tableData?.rows || []).filter((row) => {
    if (activeTable === 'orders' && filterStatus !== 'all' && row.status !== filterStatus) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return Object.values(row).some((val) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Database className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Persistent SQLite Database & Order Archive
              </h1>
            </div>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Every market trade dispatched by the external AI (via MCP) or direct manual order, along with
              deal tickets, broker execution prices, slippage latencies, and risk events, is recorded to an
              embedded SQLite database.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={handlePrune}
              disabled={pruning}
              title="Purge unexecuted orders older than 24h & trim old data"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className={`h-3.5 w-3.5 ${pruning ? 'animate-spin' : ''}`} />
              <span>{pruning ? 'Pruning...' : 'Prune Stale (24h+)'}</span>
            </button>

            <button
              onClick={() => loadData()}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <a
              href="/api/database/download"
              download="mt5_bridge.sqlite"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md shadow-indigo-950/50"
            >
              <Download className="h-4 w-4" />
              Download .sqlite DB
            </a>
          </div>
        </div>

        {pruneFeedback && (
          <div className="mt-4 p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-800 text-xs font-mono text-indigo-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{pruneFeedback}</span>
          </div>
        )}
      </div>

      {/* Retention Policy Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-slate-200">24-Hour Expiration Active:</strong> Unexecuted pending orders older than 24 hours are automatically purged to prevent stale delayed orders from executing in MT5.
          </span>
        </div>
        <div className="text-[11px] text-slate-500 shrink-0">
          Retention: Max 1,000 orders • 5,000 ticks • 2,000 candles • 200 backtests
        </div>
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Database Storage</span>
          <div className="text-base font-bold text-white mt-1 flex items-center gap-1.5">
            <HardDrive className="h-4 w-4 text-indigo-400" />
            <span>
              {analytics ? `${(analytics.dbSizeBytes / 1024).toFixed(1)} KB` : 'Initializing...'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
            mt5_bridge.sqlite
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Archived Orders</span>
          <div className="text-base font-bold text-cyan-300 mt-1">
            {analytics?.totalOrders ?? orders.length}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {analytics?.executedOrders ?? 0} Executed Deals
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Strategies Stored</span>
          <div className="text-base font-bold text-emerald-400 mt-1">
            {analytics?.totalStrategies ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Quantitative Rules
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Observations Logged</span>
          <div className="text-base font-bold text-amber-300 mt-1">
            {analytics?.totalObservations ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Empirical Patterns
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Backtest Runs</span>
          <div className="text-base font-bold text-purple-400 mt-1">
            {analytics?.totalBacktests ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Evaluated Reports
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase block">Candles in Cache</span>
          <div className="text-base font-bold text-white mt-1">
            {analytics?.totalCandles ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {analytics?.totalTicks ?? 0} Live Ticks
          </span>
        </div>
      </div>

      {/* Table Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        {/* Table Selector Tabs */}
        <div className="flex border-b border-slate-800 space-x-4 text-xs font-mono overflow-x-auto pb-1">
          <button
            onClick={() => handleTableChange('orders')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'orders'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Orders & Deals ({analytics?.totalOrders ?? orders.length})</span>
          </button>

          <button
            onClick={() => handleTableChange('strategies')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'strategies'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Strategies ({analytics?.totalStrategies ?? 0})</span>
          </button>

          <button
            onClick={() => handleTableChange('observations')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'observations'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Observations ({analytics?.totalObservations ?? 0})</span>
          </button>

          <button
            onClick={() => handleTableChange('backtest_results')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'backtest_results'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>Backtest Reports ({analytics?.totalBacktests ?? 0})</span>
          </button>

          <button
            onClick={() => handleTableChange('candles_history')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'candles_history'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Candles ({analytics?.totalCandles ?? 0})</span>
          </button>

          <button
            onClick={() => handleTableChange('ticks_history')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'ticks_history'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Ticks ({analytics?.totalTicks ?? 0})</span>
          </button>

          <button
            onClick={() => handleTableChange('account_history')}
            className={`pb-2.5 font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTable === 'account_history'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Account Snapshots</span>
          </button>
        </div>

        {/* Table Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Table: <span className="text-indigo-300">{activeTable}</span> ({filteredRows.length} rows)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder={`Search ${activeTable}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none w-48"
              />
            </div>

            {activeTable === 'orders' && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-300 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="executed">Executed</option>
                <option value="failed">Failed</option>
                <option value="dispatched">Dispatched</option>
                <option value="pending">Pending</option>
              </select>
            )}
          </div>
        </div>

        {/* Dynamic Table Content */}
        {filteredRows.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-lg p-10 text-center text-slate-500 font-mono text-xs space-y-1">
            <p className="text-sm font-bold text-slate-400">0 Records Found in {activeTable}</p>
            <p className="text-slate-500">
              No entries match the current search filter or table is empty.
            </p>
          </div>
        ) : activeTable === 'orders' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Symbol / Lots</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Deal Ticket</th>
                  <th className="py-2.5 px-3">Exec Price</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Origin</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((ord: any) => {
                  const isExecuted = ord.status === 'executed';
                  const isFailed = ord.status === 'failed';

                  return (
                    <tr key={ord.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-300">
                        {ord.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[10px]">
                          {ord.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ord.symbol && (
                            <span className="font-extrabold text-white text-xs bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700">
                              {ord.symbol}
                            </span>
                          )}
                          {ord.order_type && (
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                ord.order_type === 'BUY' || ord.order_type.startsWith('BUY')
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                              }`}
                            >
                              {ord.order_type}
                            </span>
                          )}
                          {ord.volume !== null && ord.volume !== undefined && (
                            <span className="text-slate-300 font-semibold text-[11px]">
                              {ord.volume} lot{ord.volume === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {isExecuted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-1.5 py-0.2 rounded">
                            <CheckCircle2 className="h-3 w-3" /> Executed
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/70 border border-rose-800 px-1.5 py-0.2 rounded">
                            <AlertCircle className="h-3 w-3" /> Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/70 border border-amber-800 px-1.5 py-0.2 rounded">
                            <Clock className="h-3 w-3" /> {ord.status}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-bold">
                        {ord.deal_ticket ? `#${ord.deal_ticket}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-cyan-300 font-bold">
                        {ord.execution_price ? ord.execution_price : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {ord.execution_time_ms ? `${ord.execution_time_ms}ms` : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 border border-slate-800 text-slate-400">
                          {ord.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-right">
                        {ord.created_at ? new Date(ord.created_at).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  {(tableData?.columns || []).slice(0, 8).map((col) => (
                    <th key={col} className="py-2.5 px-3">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                    {(tableData?.columns || []).slice(0, 8).map((col) => {
                      const val = row[col];
                      const valStr = val !== null && val !== undefined ? String(val) : '—';
                      return (
                        <td key={col} className="py-2 px-3 text-slate-300 max-w-xs truncate">
                          {col.includes('time') && typeof val === 'number' && val > 1000000
                            ? new Date(val > 10000000000 ? val : val * 1000).toLocaleString()
                            : valStr}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

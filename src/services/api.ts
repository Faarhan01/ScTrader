import { AppState, MCPToolDefinition, RiskGuardConfig, TradeCommand } from '../types';

export const api = {
  async getState(): Promise<AppState> {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to fetch state');
    return res.json();
  },

  async sendCommand(command: {
    action: TradeCommand['action'];
    symbol?: string;
    orderType?: TradeCommand['orderType'];
    volume?: number;
    price?: number;
    sl?: number;
    tp?: number;
    ticket?: number;
    magic?: number;
    comment?: string;
    source?: TradeCommand['source'];
  }): Promise<{ success: boolean; commandId?: string; error?: string }> {
    const res = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    return res.json();
  },

  async updateRisk(risk: Partial<RiskGuardConfig>): Promise<{ status: string; riskGuard: RiskGuardConfig }> {
    const res = await fetch('/api/risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(risk),
    });
    return res.json();
  },

  async toggleKillSwitch(active: boolean): Promise<{ status: string; emergencyKillSwitch: boolean }> {
    const res = await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    return res.json();
  },

  async getMcpTools(): Promise<{ tools: MCPToolDefinition[] }> {
    const res = await fetch('/api/mcp/tools');
    return res.json();
  },

  async executeMcpTool(name: string, args: Record<string, any>): Promise<{ success: boolean; result?: any; error?: string }> {
    const res = await fetch(`/api/mcp/tools/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return res.json();
  },

  async callMcpJsonRpc(body: any): Promise<any> {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async getEaCode(): Promise<{ code: string }> {
    const res = await fetch('/api/ea/code');
    return res.json();
  },

  async checkBridgeHealth(url = '/health'): Promise<{ ok: boolean; data?: any; latencyMs: number }> {
    const start = performance.now();
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, latencyMs };
      }
      return { ok: false, latencyMs };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - start) };
    }
  },

  async simulateTick(symbol: string, bid?: number, ask?: number) {
    const res = await fetch('/api/simulate-tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, bid, ask }),
    });
    return res.json();
  },

  async getDatabaseAnalytics(): Promise<any> {
    try {
      const res = await fetch('/api/database/analytics');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async getDatabaseOrders(limit = 100): Promise<{ orders: any[] }> {
    try {
      const res = await fetch(`/api/database/orders?limit=${limit}`);
      if (!res.ok) return { orders: [] };
      return await res.json();
    } catch {
      return { orders: [] };
    }
  },

  async pruneDatabase(): Promise<{ success: boolean; purgedUnexecutedOrders: number; message: string }> {
    const res = await fetch('/api/database/prune', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to prune database');
    return res.json();
  },

  // Strategies Knowledge Base
  async getStrategies(symbol?: string): Promise<{ strategies: any[] }> {
    try {
      const url = symbol ? `/api/strategies?symbol=${encodeURIComponent(symbol)}` : '/api/strategies';
      const res = await fetch(url);
      if (!res.ok) return { strategies: [] };
      return await res.json();
    } catch {
      return { strategies: [] };
    }
  },

  async saveStrategy(strategy: any): Promise<{ success: boolean; strategy: any }> {
    const res = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strategy),
    });
    if (!res.ok) throw new Error('Failed to save strategy');
    return res.json();
  },

  async deleteStrategy(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete strategy');
    return res.json();
  },

  async runBacktest(strategyId: string, options?: { candleLimit?: number; initialDeposit?: number }): Promise<{ success: boolean; result: any }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(strategyId)}/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) throw new Error('Failed to run backtest');
    return res.json();
  },

  // Observations Knowledge Base
  async getObservations(category?: string): Promise<{ observations: any[] }> {
    try {
      const url = category && category !== 'all' ? `/api/observations?category=${encodeURIComponent(category)}` : '/api/observations';
      const res = await fetch(url);
      if (!res.ok) return { observations: [] };
      return await res.json();
    } catch {
      return { observations: [] };
    }
  },

  async saveObservation(obs: any): Promise<{ success: boolean; observation: any }> {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obs),
    });
    if (!res.ok) throw new Error('Failed to save observation');
    return res.json();
  },

  async deleteObservation(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/observations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete observation');
    return res.json();
  },

  // Backtest Results
  async getBacktestHistory(strategyId?: string): Promise<{ results: any[] }> {
    try {
      const url = strategyId ? `/api/backtests?strategyId=${encodeURIComponent(strategyId)}` : '/api/backtests';
      const res = await fetch(url);
      if (!res.ok) return { results: [] };
      return await res.json();
    } catch {
      return { results: [] };
    }
  },

  // Live Strategy Signals & Execution
  async evaluateStrategySignals(strategyId?: string): Promise<{ signals: any[] }> {
    try {
      const url = strategyId ? `/api/strategies/evaluate?strategyId=${encodeURIComponent(strategyId)}` : '/api/strategies/evaluate';
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback to legacy endpoint if needed
        const fallbackUrl = strategyId ? `/api/strategies-evaluate?strategyId=${encodeURIComponent(strategyId)}` : '/api/strategies-evaluate';
        const fallbackRes = await fetch(fallbackUrl);
        if (!fallbackRes.ok) return { signals: [] };
        return await fallbackRes.json();
      }
      return await res.json();
    } catch {
      return { signals: [] };
    }
  },

  async executeStrategySignal(strategyId: string, volume?: number): Promise<{ success: boolean; commandId?: string; signal: any; message: string }> {
    const res = await fetch(`/api/strategies/${encodeURIComponent(strategyId)}/execute-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume }),
    });
    if (!res.ok) throw new Error('Failed to execute strategy signal');
    return res.json();
  },

  // Candles & History
  async getCandles(symbol: string, timeframe = 'M1', limit = 200): Promise<{ candles: any[] }> {
    try {
      const res = await fetch(`/api/candles/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}?limit=${limit}`);
      if (!res.ok) return { candles: [] };
      return await res.json();
    } catch {
      return { candles: [] };
    }
  },

  async requestChartHistory(symbol: string, timeframe = 'M1', count = 100): Promise<any> {
    return this.executeMcpTool('mt5_request_chart_history', { symbol, timeframe, count });
  },

  async simulateCandles(symbol = 'EURUSD', timeframe = 'M1', count = 60, basePrice?: number): Promise<any> {
    return this.executeMcpTool('mt5_simulate_candles', { symbol, timeframe, count, basePrice });
  },

  // Database Table Inspection
  async getTableData(tableName: string, limit = 100): Promise<{ columns: string[]; rows: any[]; total: number }> {
    try {
      const res = await fetch(`/api/database/table/${encodeURIComponent(tableName)}?limit=${limit}`);
      if (!res.ok) return { columns: [], rows: [], total: 0 };
      return await res.json();
    } catch {
      return { columns: [], rows: [], total: 0 };
    }
  },
};


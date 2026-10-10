import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { AccountInfo, CandleData, TickData } from '../types/mt5.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'mt5_bridge.sqlite');

let dbInstance: Database | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;

export async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('Could not read existing sqlite file, creating fresh database:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  persistDatabase();
  return dbInstance;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      symbol TEXT,
      order_type TEXT,
      volume REAL,
      price REAL,
      sl REAL,
      tp REAL,
      ticket INTEGER,
      magic INTEGER,
      comment TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      deal_ticket INTEGER,
      execution_price REAL,
      execution_time_ms INTEGER,
      error_code INTEGER,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      executed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS positions_history (
      ticket INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      volume REAL NOT NULL,
      open_price REAL NOT NULL,
      close_price REAL,
      sl REAL,
      tp REAL,
      profit REAL,
      swap REAL,
      magic INTEGER,
      comment TEXT,
      open_time INTEGER NOT NULL,
      close_time INTEGER,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login INTEGER NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      margin REAL NOT NULL,
      free_margin REAL NOT NULL,
      margin_level REAL NOT NULL,
      profit REAL NOT NULL,
      currency TEXT,
      server TEXT,
      created_at INTEGER NOT NULL,
      created_at_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS candles_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      time_iso TEXT,
      UNIQUE(symbol, timeframe, time)
    );

    CREATE TABLE IF NOT EXISTS ticks_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      bid REAL NOT NULL,
      ask REAL NOT NULL,
      spread INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      time_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      source TEXT NOT NULL,
      ticket INTEGER
    );

    CREATE TABLE IF NOT EXISTS risk_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      global_tp_usd REAL NOT NULL,
      global_sl_usd REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      kill_switch INTEGER NOT NULL,
      trailing_enabled INTEGER NOT NULL,
      trailing_distance INTEGER NOT NULL,
      trailing_step INTEGER NOT NULL,
      max_lot_size REAL NOT NULL,
      max_open_positions INTEGER NOT NULL,
      allowed_symbols TEXT NOT NULL,
      auto_close_margin_level REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      parameters_json TEXT NOT NULL,
      status TEXT NOT NULL,
      tags_json TEXT,
      author TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      symbol TEXT,
      timeframe TEXT,
      strategy_id TEXT,
      category TEXT NOT NULL,
      tags_json TEXT,
      metrics_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backtest_results (
      id TEXT PRIMARY KEY,
      strategy_id TEXT NOT NULL,
      strategy_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      candle_count INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      start_time_iso TEXT,
      end_time INTEGER NOT NULL,
      end_time_iso TEXT,
      initial_deposit REAL NOT NULL,
      final_equity REAL NOT NULL,
      net_profit REAL NOT NULL,
      profit_factor REAL NOT NULL,
      win_rate_pct REAL NOT NULL,
      total_trades INTEGER NOT NULL,
      winning_trades INTEGER NOT NULL,
      losing_trades INTEGER NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      max_drawdown_usd REAL NOT NULL,
      average_trade_profit REAL NOT NULL,
      average_win REAL NOT NULL,
      average_loss REAL NOT NULL,
      risk_reward_ratio REAL NOT NULL,
      trades_json TEXT NOT NULL,
      equity_curve_json TEXT NOT NULL,
      evaluated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles_history(symbol, timeframe, time);
    CREATE INDEX IF NOT EXISTS idx_ticks_lookup ON ticks_history(symbol, timestamp);
    CREATE INDEX IF NOT EXISTS idx_strategies_symbol ON strategies(symbol, status);
    CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_id, evaluated_at);
    CREATE INDEX IF NOT EXISTS idx_observations_cat ON observations(category, created_at);
    CREATE INDEX IF NOT EXISTS idx_account_created ON account_history(created_at);
  `);

  // Migration: add columns that may be missing on older databases
  const riskCols = db.exec("PRAGMA table_info(risk_settings)");
  const colNames = riskCols.length ? riskCols[0].values.map((r) => r[1]) : [];
  if (!colNames.includes('allowed_symbols')) {
    db.run("ALTER TABLE risk_settings ADD COLUMN allowed_symbols TEXT");
  }
  if (!colNames.includes('auto_close_margin_level')) {
    db.run("ALTER TABLE risk_settings ADD COLUMN auto_close_margin_level REAL");
  }
}

export function persistDatabase() {
  if (!dbInstance) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    try {
      if (!dbInstance) return;
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_FILE, buffer);
    } catch (e) {
      console.error('Failed to write sqlite database to disk:', e);
    }
  }, 100);
}

// Prune old data so database stays lightweight, fast, and does not grow unbounded
let pruneCounter = 0;
export async function pruneDatabase() {
  pruneCounter++;
  if (pruneCounter % 20 !== 0) return; // run periodically every 20 sync cycles
  await dbPruneDatabase();
}

// Full explicit database pruning with 24-hour unexecuted order expiration
export async function dbPruneDatabase(): Promise<{
  purgedUnexecutedOrders: number;
  message: string;
}> {
  try {
    const db = await getDatabase();
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgoSec = Math.floor(now / 1000) - 48 * 3600;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 1. Delete all unexecuted orders older than 24 hours (pending or dispatched)
    const countBefore = db.exec(`SELECT COUNT(*) FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);
    const unexecutedCount = countBefore.length > 0 && countBefore[0].values.length > 0 ? Number(countBefore[0].values[0][0]) : 0;

    db.run(`DELETE FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);

    // 2. Cap total archived orders (keep last 1,000 executed/failed orders)
    db.run(`DELETE FROM orders WHERE id NOT IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1000)`);

    // 3. Cap ticks history (keep last 5,000 ticks or ticks within 48h)
    db.run(`DELETE FROM ticks_history WHERE timestamp < ${twoDaysAgoSec} OR id NOT IN (SELECT id FROM ticks_history ORDER BY id DESC LIMIT 5000)`);

    // 4. Cap account history snapshots (keep last 1,000 entries)
    db.run(`DELETE FROM account_history WHERE created_at < ${sevenDaysAgo} OR id NOT IN (SELECT id FROM account_history ORDER BY id DESC LIMIT 1000)`);

    // 5. Cap candles history (keep last 2,000 candles)
    db.run(`DELETE FROM candles_history WHERE id NOT IN (SELECT id FROM candles_history ORDER BY time DESC LIMIT 2000)`);

    // 6. Cap audit logs (keep last 500 logs)
    db.run(`DELETE FROM audit_logs WHERE timestamp < ${sevenDaysAgo} OR id NOT IN (SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 500)`);

    // 7. Cap backtest results history (keep last 200 backtests)
    db.run(`DELETE FROM backtest_results WHERE id NOT IN (SELECT id FROM backtest_results ORDER BY evaluated_at DESC LIMIT 200)`);

    persistDatabase();
    return {
      purgedUnexecutedOrders: unexecutedCount,
      message: `Database pruned successfully. Purged ${unexecutedCount} expired unexecuted orders older than 24h.`,
    };
  } catch (err: any) {
    console.error('Database prune error:', err);
    return {
      purgedUnexecutedOrders: 0,
      message: `Prune error: ${err?.message || String(err)}`,
    };
  }
}

// 1. Orders
export async function dbInsertOrder(order: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, action, symbol, order_type, volume, price, sl, tp, ticket, magic, comment,
      status, source, deal_ticket, execution_price, execution_time_ms, error_code,
      error_message, created_at, executed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    order.id,
    order.action,
    order.symbol || null,
    order.orderType || null,
    order.volume || null,
    order.price || null,
    order.sl || null,
    order.tp || null,
    order.ticket || null,
    order.magic || null,
    order.comment || null,
    order.status,
    order.source,
    order.result?.dealTicket || null,
    order.result?.executionPrice || null,
    order.result?.executionTimeMs || null,
    order.result?.errorCode || null,
    order.result?.errorMessage || null,
    order.createdAt,
    order.executedAt || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 2. Account History Snapshot
let lastAccountRecordTime = 0;
export async function dbInsertAccountSnapshot(account: AccountInfo) {
  if (!account || account.login === 0) return;
  const now = Date.now();
  // Throttle to every 5 seconds to avoid bloating
  if (now - lastAccountRecordTime < 5000) return;
  lastAccountRecordTime = now;

  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO account_history (
      login, balance, equity, margin, free_margin, margin_level, profit, currency, server, created_at, created_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    account.login,
    account.balance,
    account.equity,
    account.margin,
    account.freeMargin,
    account.marginLevel,
    account.profit,
    account.currency,
    account.server,
    now,
    new Date(now).toISOString(),
  ]);
  stmt.free();
  persistDatabase();
}

// 3. Candles History
export async function dbInsertCandles(symbol: string, timeframe: string, candles: CandleData[]) {
  if (!candles || candles.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO candles_history (
      symbol, timeframe, time, open, high, low, close, volume, time_iso
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of candles) {
    const timeIso = c.timeIso || new Date(c.time * 1000).toISOString();
    stmt.run([
      symbol.toUpperCase(),
      timeframe.toUpperCase(),
      c.time,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 4. Ticks History
export async function dbInsertTicks(ticks: TickData[]) {
  if (!ticks || ticks.length === 0) return;
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT INTO ticks_history (symbol, bid, ask, spread, timestamp, time_iso)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const t of ticks) {
    const timeIso = new Date(t.time * 1000).toISOString();
    stmt.run([
      t.symbol.toUpperCase(),
      t.bid,
      t.ask,
      t.spread,
      t.time,
      timeIso,
    ]);
  }
  stmt.free();
  persistDatabase();
}

// 5. Query Candles
export async function dbGetCandles(symbol: string, timeframe: string, limit = 100): Promise<CandleData[]> {
  const db = await getDatabase();
  const sql = `
    SELECT time, open, high, low, close, volume, time_iso
    FROM candles_history
    WHERE symbol = '${symbol.toUpperCase()}' AND timeframe = '${timeframe.toUpperCase()}'
    ORDER BY time ASC
    LIMIT ${limit}
  `;
  const res = db.exec(sql);
  if (res.length === 0) return [];
  const rows = res[0].values;
  return rows.map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    timeIso: String(r[6]),
  }));
}

// 6. Query Ticks History
export async function dbGetTicksHistory(symbol?: string, limit = 100): Promise<any[]> {
  const db = await getDatabase();
  let sql = `SELECT symbol, bid, ask, spread, timestamp, time_iso FROM ticks_history`;
  if (symbol && symbol.toUpperCase() !== 'ALL') {
    sql += ` WHERE symbol = '${symbol.toUpperCase()}'`;
  }
  sql += ` ORDER BY timestamp DESC LIMIT ${limit}`;

  const res = db.exec(sql);
  if (res.length === 0) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((c, i) => (item[c] = row[i]));
    return item;
  });
}

// 7. Query Account History
export async function dbGetAccountHistory(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM account_history ORDER BY created_at DESC LIMIT ${limit}`);
  if (res.length === 0) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((c, i) => (item[c] = row[i]));
    return item;
  });
}

// 8. Logs
export async function dbInsertLog(log: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, level, title, details, source, ticket)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    log.id,
    log.timestamp,
    log.level,
    log.title,
    log.details,
    log.source,
    log.ticket || null,
  ]);
  stmt.free();
  persistDatabase();
}

// 9. Risk Settings
export async function dbSaveRiskSettings(risk: any) {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO risk_settings (
      id, global_tp_usd, global_sl_usd, max_drawdown_pct, kill_switch,
      trailing_enabled, trailing_distance, trailing_step, max_lot_size,
      max_open_positions, allowed_symbols, auto_close_margin_level, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    risk.globalTakeProfitUSD,
    risk.globalStopLossUSD,
    risk.maxDrawdownPercent,
    risk.emergencyKillSwitch ? 1 : 0,
    risk.trailingStopEnabled ? 1 : 0,
    risk.trailingStopDistancePoints,
    risk.trailingStopStepPoints,
    risk.maxLotSizePerTrade,
    risk.maxOpenPositions,
    JSON.stringify(Array.isArray(risk.allowedSymbols) ? risk.allowedSymbols : []),
    risk.autoCloseOnMarginLevelBelow,
    Date.now(),
  ]);
  stmt.free();
  persistDatabase();
}

export async function dbGetRiskSettings(): Promise<any | null> {
  const db = await getDatabase();
  const res = db.exec('SELECT * FROM risk_settings WHERE id = 1 LIMIT 1');
  if (res.length === 0 || !res[0].values.length) return null;
  const row = res[0].values[0];
  const cols = res[0].columns;
  const obj: Record<string, any> = {};
  cols.forEach((c, i) => (obj[c] = row[i]));
  let allowedSymbols: string[] = [];
  try {
    allowedSymbols = JSON.parse(obj.allowed_symbols || '[]');
  } catch {
    allowedSymbols = [];
  }
  return {
    globalTakeProfitUSD: obj.global_tp_usd,
    globalStopLossUSD: obj.global_sl_usd,
    maxDrawdownPercent: obj.max_drawdown_pct,
    emergencyKillSwitch: Boolean(obj.kill_switch),
    trailingStopEnabled: Boolean(obj.trailing_enabled),
    trailingStopDistancePoints: obj.trailing_distance,
    trailingStepPoints: obj.trailing_step,
    maxLotSizePerTrade: obj.max_lot_size,
    maxOpenPositions: obj.max_open_positions,
    allowedSymbols,
    autoCloseOnMarginLevelBelow: obj.auto_close_margin_level ?? 100,
  };
}

// 10. Query Orders
export async function dbGetOrders(limit = 100): Promise<any[]> {
  const db = await getDatabase();
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  // Automatically purge unexecuted orders older than 24 hours
  db.run(`DELETE FROM orders WHERE status IN ('pending', 'dispatched') AND created_at < ${twentyFourHoursAgo}`);
  persistDatabase();

  const res = db.exec(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${limit}`);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item;
  });
}

// 11. Database Analytics
export async function dbGetAnalytics(): Promise<any> {
  const db = await getDatabase();
  const totalOrdersRes = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM orders`);
  const logsRes = db.exec(`SELECT COUNT(*) as total FROM audit_logs`);
  const candlesRes = db.exec(`SELECT COUNT(*) as total FROM candles_history`);
  const ticksRes = db.exec(`SELECT COUNT(*) as total FROM ticks_history`);
  const accountRes = db.exec(`SELECT COUNT(*) as total FROM account_history`);
  const stratRes = db.exec(`SELECT COUNT(*) as total FROM strategies`);
  const obsRes = db.exec(`SELECT COUNT(*) as total FROM observations`);
  const btRes = db.exec(`SELECT COUNT(*) as total FROM backtest_results`);

  let totalOrders = 0;
  let executedOrders = 0;
  let failedOrders = 0;
  let totalLogs = 0;
  let totalCandles = 0;
  let totalTicks = 0;
  let totalAccountSnapshots = 0;
  let totalStrategies = 0;
  let totalObservations = 0;
  let totalBacktests = 0;

  if (totalOrdersRes.length > 0 && totalOrdersRes[0].values.length > 0) {
    const row = totalOrdersRes[0].values[0];
    totalOrders = Number(row[0]) || 0;
    executedOrders = Number(row[1]) || 0;
    failedOrders = Number(row[2]) || 0;
  }

  if (logsRes.length > 0 && logsRes[0].values.length > 0) {
    totalLogs = Number(logsRes[0].values[0][0]) || 0;
  }
  if (candlesRes.length > 0 && candlesRes[0].values.length > 0) {
    totalCandles = Number(candlesRes[0].values[0][0]) || 0;
  }
  if (ticksRes.length > 0 && ticksRes[0].values.length > 0) {
    totalTicks = Number(ticksRes[0].values[0][0]) || 0;
  }
  if (accountRes.length > 0 && accountRes[0].values.length > 0) {
    totalAccountSnapshots = Number(accountRes[0].values[0][0]) || 0;
  }
  if (stratRes.length > 0 && stratRes[0].values.length > 0) {
    totalStrategies = Number(stratRes[0].values[0][0]) || 0;
  }
  if (obsRes.length > 0 && obsRes[0].values.length > 0) {
    totalObservations = Number(obsRes[0].values[0][0]) || 0;
  }
  if (btRes.length > 0 && btRes[0].values.length > 0) {
    totalBacktests = Number(btRes[0].values[0][0]) || 0;
  }

  let dbSizeBytes = 0;
  if (fs.existsSync(DB_FILE)) {
    dbSizeBytes = fs.statSync(DB_FILE).size;
  }

  return {
    databasePath: 'data/mt5_bridge.sqlite',
    databaseType: 'SQLite WASM (Persistent with Retention Pruning)',
    dbSizeBytes,
    totalOrders,
    executedOrders,
    failedOrders,
    executionSuccessRate: totalOrders > 0 ? Number(((executedOrders / totalOrders) * 100).toFixed(1)) : 100,
    totalLogs,
    totalCandles,
    totalTicks,
    totalAccountSnapshots,
    totalStrategies,
    totalObservations,
    totalBacktests,
  };
}

// ==========================================
// 12. Strategies Knowledge Base CRUD
// ==========================================

export async function dbSaveStrategy(strategy: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO strategies (
      id, name, description, type, symbol, timeframe, parameters_json,
      status, tags_json, author, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    strategy.id,
    strategy.name,
    strategy.description || '',
    strategy.type,
    strategy.symbol.toUpperCase(),
    strategy.timeframe.toUpperCase(),
    JSON.stringify(strategy.parameters || {}),
    strategy.status || 'active',
    JSON.stringify(strategy.tags || []),
    strategy.author || 'User',
    strategy.notes || '',
    strategy.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetStrategies(symbol?: string): Promise<any[]> {
  const db = await getDatabase();
  let sql = 'SELECT * FROM strategies';
  if (symbol && symbol.toUpperCase() !== 'ALL') {
    sql += ` WHERE symbol = '${symbol.toUpperCase()}'`;
  }
  sql += ' ORDER BY updated_at DESC';

  const res = db.exec(sql);
  if (res.length === 0) {
    // Seed default strategies if table is empty
    await seedDefaultStrategies();
    return dbGetStrategies(symbol);
  }

  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((col, idx) => (item[col] = row[idx]));
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      symbol: item.symbol,
      timeframe: item.timeframe,
      parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
      status: item.status,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      author: item.author,
      notes: item.notes,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
}

export async function dbGetStrategyById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM strategies WHERE id = '${id}' LIMIT 1`);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const row = res[0].values[0];
  const item: Record<string, any> = {};
  cols.forEach((col, idx) => (item[col] = row[idx]));
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    symbol: item.symbol,
    timeframe: item.timeframe,
    parameters: item.parameters_json ? JSON.parse(item.parameters_json) : {},
    status: item.status,
    tags: item.tags_json ? JSON.parse(item.tags_json) : [],
    author: item.author,
    notes: item.notes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function dbDeleteStrategy(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM strategies WHERE id = '${id}'`);
  persistDatabase();
  return true;
}

async function seedDefaultStrategies() {
  const defaults = [
    {
      id: 'strat-rsi-reversal-eurusd',
      name: 'RSI Reversal Mean Reversion',
      description: 'Enters BUY when 14-period RSI drops below 30 (oversold) and SELL when RSI exceeds 70 (overbought). Optimal for oscillating range-bound FX pairs.',
      type: 'RSI_REVERSAL',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        rsiOversold: 30,
        rsiOverbought: 70,
        rsiPeriod: 14,
        stopLossPoints: 250,
        takeProfitPoints: 500,
        lotSize: 0.1,
        maxHoldBars: 40,
      },
      status: 'active',
      tags: ['RSI', 'Oscillator', 'MeanReversion', 'Forex'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Best performed during London/New York session overlap with moderate volatility.',
      createdAt: Date.now() - 3600000 * 24,
      updatedAt: Date.now() - 3600000 * 24,
    },
    {
      id: 'strat-ema-trend-gold',
      name: 'EMA 9/21 Trend Scalper',
      description: 'Captures fast trend continuation when EMA 9 crosses above EMA 21 with price confirmation. Wide 2:1 profit ratio.',
      type: 'EMA_CROSSOVER',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      parameters: {
        fastEmaPeriod: 9,
        slowEmaPeriod: 21,
        stopLossPoints: 400,
        takeProfitPoints: 800,
        lotSize: 0.05,
        maxHoldBars: 60,
      },
      status: 'active',
      tags: ['EMA', 'Trend', 'Gold', 'CrossOver'],
      author: 'Cotrade Algorithmic Suite',
      notes: 'Ensure gold spread is below 35 points before live execution.',
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
    },
    {
      id: 'strat-consensus-multi-ind',
      name: 'Multi-Indicator Consensus Alpha',
      description: 'Requires synchronous alignment between RSI momentum, MACD histogram positive slope, and EMA trend bias before emitting trade signal.',
      type: 'MULTI_INDICATOR_CONSENSUS',
      symbol: 'EURUSD',
      timeframe: 'M1',
      parameters: {
        stopLossPoints: 300,
        takeProfitPoints: 600,
        lotSize: 0.1,
        maxHoldBars: 50,
      },
      status: 'active',
      tags: ['Consensus', 'RSI', 'MACD', 'EMA'],
      author: 'AI Quantitative Engine',
      notes: 'Produces high-conviction signals with lower frequency.',
      createdAt: Date.now() - 3600000 * 6,
      updatedAt: Date.now() - 3600000 * 6,
    },
  ];

  for (const s of defaults) {
    await dbSaveStrategy(s);
  }
}

// ==========================================
// 13. Observations Knowledge Base CRUD
// ==========================================

export async function dbSaveObservation(obs: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO observations (
      id, title, content, symbol, timeframe, strategy_id, category,
      tags_json, metrics_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    obs.id,
    obs.title,
    obs.content,
    obs.symbol ? obs.symbol.toUpperCase() : null,
    obs.timeframe ? obs.timeframe.toUpperCase() : null,
    obs.strategyId || null,
    obs.category || 'market_insight',
    JSON.stringify(obs.tags || []),
    JSON.stringify(obs.metrics || {}),
    obs.createdAt || Date.now(),
    Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetObservations(category?: string): Promise<any[]> {
  const db = await getDatabase();
  let sql = 'SELECT * FROM observations';
  if (category && category !== 'all') {
    sql += ` WHERE category = '${category}'`;
  }
  sql += ' ORDER BY created_at DESC';

  const res = db.exec(sql);
  if (res.length === 0) {
    await seedDefaultObservations();
    return dbGetObservations(category);
  }

  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((col, idx) => (item[col] = row[idx]));
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      symbol: item.symbol,
      timeframe: item.timeframe,
      strategyId: item.strategy_id,
      category: item.category,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      metrics: item.metrics_json ? JSON.parse(item.metrics_json) : {},
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  });
}

export async function dbDeleteObservation(id: string): Promise<boolean> {
  const db = await getDatabase();
  db.run(`DELETE FROM observations WHERE id = '${id}'`);
  persistDatabase();
  return true;
}

async function seedDefaultObservations() {
  const defaults = [
    {
      id: 'obs-london-breakout',
      title: 'London Open Spread Expansion & False Breaks',
      content: 'Consistently observed that around 08:00 UTC (London open), EURUSD spread widens from 3 to 12 points for ~90 seconds. Breakout strategies entering immediately on the first M1 candle frequently encounter whipsaws. Waiting for 3 candles (08:03 UTC) filters out 68% of false breakouts.',
      symbol: 'EURUSD',
      timeframe: 'M1',
      category: 'market_insight',
      tags: ['LondonOpen', 'Spread', 'Liquidity', 'FalseBreak'],
      metrics: { avgSpreadExpansion: '8.4 points', winRateImprovement: '+14%' },
      createdAt: Date.now() - 3600000 * 18,
      updatedAt: Date.now() - 3600000 * 18,
    },
    {
      id: 'obs-gold-volatility-us-cpi',
      title: 'Gold (XAUUSD) M5 Momentum Persistence during US CPI',
      content: 'During major US CPI releases, Gold forms impulsive 40-60 point candles. Standard RSI triggers false overbought/oversold prematurely. Trend continuation with trailing stops in 150-point increments captures 2.4x more profit than fixed TP.',
      symbol: 'XAUUSD',
      timeframe: 'M5',
      category: 'pattern',
      tags: ['Gold', 'Macro', 'CPI', 'Volatility', 'TrailingStop'],
      metrics: { avgImpulsePoints: '52.3', trailingStopGain: '2.4x' },
      createdAt: Date.now() - 3600000 * 8,
      updatedAt: Date.now() - 3600000 * 8,
    },
  ];

  for (const o of defaults) {
    await dbSaveObservation(o);
  }
}

// ==========================================
// 14. Backtest Results Storage CRUD
// ==========================================

export async function dbSaveBacktestResult(result: any): Promise<void> {
  const db = await getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO backtest_results (
      id, strategy_id, strategy_name, symbol, timeframe, candle_count,
      start_time, start_time_iso, end_time, end_time_iso, initial_deposit,
      final_equity, net_profit, profit_factor, win_rate_pct, total_trades,
      winning_trades, losing_trades, max_drawdown_pct, max_drawdown_usd,
      average_trade_profit, average_win, average_loss, risk_reward_ratio,
      trades_json, equity_curve_json, evaluated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    result.id,
    result.strategyId,
    result.strategyName,
    result.symbol.toUpperCase(),
    result.timeframe.toUpperCase(),
    result.candleCount,
    result.startTime,
    result.startTimeIso || new Date(result.startTime * 1000).toISOString(),
    result.endTime,
    result.endTimeIso || new Date(result.endTime * 1000).toISOString(),
    result.initialDeposit,
    result.finalEquity,
    result.netProfit,
    result.profitFactor,
    result.winRatePct,
    result.totalTrades,
    result.winningTrades,
    result.losingTrades,
    result.maxDrawdownPct,
    result.maxDrawdownUsd,
    result.averageTradeProfit,
    result.averageWin,
    result.averageLoss,
    result.riskRewardRatio,
    JSON.stringify(result.trades || []),
    JSON.stringify(result.equityCurve || []),
    result.evaluatedAt || Date.now(),
  ]);

  stmt.free();
  persistDatabase();
}

export async function dbGetBacktestResults(strategyId?: string, limit = 50): Promise<any[]> {
  const db = await getDatabase();
  let sql = 'SELECT * FROM backtest_results';
  if (strategyId) {
    sql += ` WHERE strategy_id = '${strategyId}'`;
  }
  sql += ` ORDER BY evaluated_at DESC LIMIT ${limit}`;

  const res = db.exec(sql);
  if (res.length === 0) return [];

  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const item: Record<string, any> = {};
    cols.forEach((col, idx) => (item[col] = row[idx]));
    return {
      id: item.id,
      strategyId: item.strategy_id,
      strategyName: item.strategy_name,
      symbol: item.symbol,
      timeframe: item.timeframe,
      candleCount: item.candle_count,
      startTime: item.start_time,
      startTimeIso: item.start_time_iso,
      endTime: item.end_time,
      endTimeIso: item.end_time_iso,
      initialDeposit: item.initial_deposit,
      finalEquity: item.final_equity,
      netProfit: item.net_profit,
      profitFactor: item.profit_factor,
      winRatePct: item.win_rate_pct,
      totalTrades: item.total_trades,
      winningTrades: item.winning_trades,
      losingTrades: item.losing_trades,
      maxDrawdownPct: item.max_drawdown_pct,
      maxDrawdownUsd: item.max_drawdown_usd,
      averageTradeProfit: item.average_trade_profit,
      averageWin: item.average_win,
      averageLoss: item.average_loss,
      riskRewardRatio: item.risk_reward_ratio,
      trades: item.trades_json ? JSON.parse(item.trades_json) : [],
      equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
      evaluatedAt: item.evaluated_at,
    };
  });
}

export async function dbGetBacktestById(id: string): Promise<any | null> {
  const db = await getDatabase();
  const res = db.exec(`SELECT * FROM backtest_results WHERE id = '${id}' LIMIT 1`);
  if (res.length === 0 || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const row = res[0].values[0];
  const item: Record<string, any> = {};
  cols.forEach((col, idx) => (item[col] = row[idx]));
  return {
    id: item.id,
    strategyId: item.strategy_id,
    strategyName: item.strategy_name,
    symbol: item.symbol,
    timeframe: item.timeframe,
    candleCount: item.candle_count,
    startTime: item.start_time,
    startTimeIso: item.start_time_iso,
    endTime: item.end_time,
    endTimeIso: item.end_time_iso,
    initialDeposit: item.initial_deposit,
    finalEquity: item.final_equity,
    netProfit: item.net_profit,
    profitFactor: item.profit_factor,
    winRatePct: item.win_rate_pct,
    totalTrades: item.total_trades,
    winningTrades: item.winning_trades,
    losingTrades: item.losing_trades,
    maxDrawdownPct: item.max_drawdown_pct,
    maxDrawdownUsd: item.max_drawdown_usd,
    averageTradeProfit: item.average_trade_profit,
    averageWin: item.average_win,
    averageLoss: item.average_loss,
    riskRewardRatio: item.risk_reward_ratio,
    trades: item.trades_json ? JSON.parse(item.trades_json) : [],
    equityCurve: item.equity_curve_json ? JSON.parse(item.equity_curve_json) : [],
    evaluatedAt: item.evaluated_at,
  };
}


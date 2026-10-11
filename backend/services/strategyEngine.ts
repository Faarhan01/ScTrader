import { CandleData } from '../types/mt5.js';
import { calculateIndicators } from './indicatorEngine.js';
import { dbGetStrategies, dbGetStrategyById, dbGetCandles } from '../database/db.js';
import { tradeStore } from './tradeStore.js';

export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  entryPrice: number;
  sl: number;
  tp: number;
  lotSize: number;
  rationale: string;
  indicatorsSnapshot?: {
    rsi?: number | null;
    macdHistogram?: number;
    ema9?: number | null;
    ema21?: number | null;
    summary?: string;
  };
  timestamp: number;
  timestampIso: string;
}

export type StrategyType =
  | 'RSI_REVERSAL'
  | 'EMA_CROSSOVER'
  | 'MACD_MOMENTUM'
  | 'BOLLINGER_BREAKOUT'
  | 'MULTI_INDICATOR_CONSENSUS'
  | 'CUSTOM_RULESET';

export interface StrategyParameters {
  rsiOversold?: number;
  rsiOverbought?: number;
  rsiPeriod?: number;
  fastEmaPeriod?: number;
  slowEmaPeriod?: number;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  stopLossPoints?: number;
  takeProfitPoints?: number;
  trailingStopPoints?: number;
  riskPercent?: number;
  lotSize?: number;
  maxHoldBars?: number;
  customRules?: string;
  [key: string]: any;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  type: StrategyType;
  symbol: string;
  timeframe: string;
  parameters: StrategyParameters;
  status: 'active' | 'draft' | 'archived' | 'testing';
  tags?: string[];
  author?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Observation {
  id: string;
  title: string;
  content: string;
  symbol?: string;
  timeframe?: string;
  strategyId?: string;
  category: 'market_insight' | 'pattern' | 'execution_note' | 'anomaly' | 'research';
  tags: string[];
  metrics?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface SimulatedTrade {
  id: string;
  type: 'BUY' | 'SELL';
  entryIndex: number;
  entryTime: number;
  entryTimeIso: string;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitTimeIso: string;
  exitPrice: number;
  profitPoints: number;
  profitUsd: number;
  returnPct: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL' | 'MAX_HOLD_BARS' | 'END_OF_DATA';
  lotSize: number;
  slPrice?: number;
  tpPrice?: number;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startTime: number;
  startTimeIso: string;
  endTime: number;
  endTimeIso: string;
  initialDeposit: number;
  finalEquity: number;
  netProfit: number;
  profitFactor: number;
  winRatePct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  averageTradeProfit: number;
  averageWin: number;
  averageLoss: number;
  riskRewardRatio: number;
  sharpeRatio?: number;
  trades: SimulatedTrade[];
  equityCurve: { time: number; timeIso: string; equity: number }[];
  evaluatedAt: number;
}

/**
 * Technical Strategy Backtester
 * Evaluates strategy rules bar-by-bar across historical candles
 */
export function runStrategyBacktest(
  strategy: StrategyDefinition,
  candles: CandleData[],
  deposit = 10000,
  pointValue = 0.0001
): BacktestResult {
  if (!candles || candles.length < 20) {
    throw new Error(`Insufficient historical candles for backtesting (requires at least 20, got ${candles?.length || 0})`);
  }

  const params = strategy.parameters || {};
  const lotSize = Number(params.lotSize) || 0.1;
  const slPoints = Number(params.stopLossPoints) || 300;
  const tpPoints = Number(params.takeProfitPoints) || 600;
  const maxHoldBars = Number(params.maxHoldBars) || 50;

  // Adapt point value for JPY or Crypto / Metals
  const sym = (strategy.symbol || 'EURUSD').toUpperCase();
  let effectivePoint = pointValue;
  if (sym.includes('JPY')) effectivePoint = 0.01;
  else if (sym.includes('XAU') || sym.includes('GOLD')) effectivePoint = 0.01;
  else if (sym.includes('BTC') || sym.includes('ETH')) effectivePoint = 0.1;

  const trades: SimulatedTrade[] = [];
  const equityCurve: { time: number; timeIso: string; equity: number }[] = [];
  let currentEquity = deposit;
  let peakEquity = deposit;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  equityCurve.push({
    time: candles[0].time,
    timeIso: candles[0].timeIso || new Date(candles[0].time * 1000).toISOString(),
    equity: currentEquity,
  });

  let openTrade: {
    type: 'BUY' | 'SELL';
    entryIndex: number;
    entryTime: number;
    entryTimeIso: string;
    entryPrice: number;
    sl: number;
    tp: number;
  } | null = null;

  // Rolling indicator window
  const lookback = 20;

  for (let i = lookback; i < candles.length; i++) {
    const currentBar = candles[i];
    const prevBar = candles[i - 1];
    const barSlice = candles.slice(0, i + 1);
    const indicators = calculateIndicators(barSlice, strategy.symbol, strategy.timeframe);

    // 1. Manage active open trade
    if (openTrade) {
      let exitReason: SimulatedTrade['exitReason'] | null = null;
      let exitPrice = currentBar.close;

      if (openTrade.type === 'BUY') {
        if (currentBar.low <= openTrade.sl) {
          exitPrice = openTrade.sl;
          exitReason = 'STOP_LOSS';
        } else if (currentBar.high >= openTrade.tp) {
          exitPrice = openTrade.tp;
          exitReason = 'TAKE_PROFIT';
        } else if (i - openTrade.entryIndex >= maxHoldBars) {
          exitPrice = currentBar.close;
          exitReason = 'MAX_HOLD_BARS';
        }
      } else {
        // SELL
        if (currentBar.high >= openTrade.sl) {
          exitPrice = openTrade.sl;
          exitReason = 'STOP_LOSS';
        } else if (currentBar.low <= openTrade.tp) {
          exitPrice = openTrade.tp;
          exitReason = 'TAKE_PROFIT';
        } else if (i - openTrade.entryIndex >= maxHoldBars) {
          exitPrice = currentBar.close;
          exitReason = 'MAX_HOLD_BARS';
        }
      }

      if (exitReason) {
        const pointDiff =
          openTrade.type === 'BUY'
            ? (exitPrice - openTrade.entryPrice) / effectivePoint
            : (openTrade.entryPrice - exitPrice) / effectivePoint;

        // Approx profit USD based on lot size (e.g. 0.1 lot = $1/point for FX)
        const profitUsd = Math.round(pointDiff * lotSize * 10 * 100) / 100;
        const returnPct = Math.round((profitUsd / currentEquity) * 10000) / 100;

        currentEquity += profitUsd;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const ddUsd = peakEquity - currentEquity;
        const ddPct = (ddUsd / peakEquity) * 100;
        if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        trades.push({
          id: `sim-trd-${trades.length + 1}`,
          type: openTrade.type,
          entryIndex: openTrade.entryIndex,
          entryTime: openTrade.entryTime,
          entryTimeIso: openTrade.entryTimeIso,
          entryPrice: openTrade.entryPrice,
          exitIndex: i,
          exitTime: currentBar.time,
          exitTimeIso: currentBar.timeIso || new Date(currentBar.time * 1000).toISOString(),
          exitPrice: Number(exitPrice.toFixed(5)),
          profitPoints: Math.round(pointDiff),
          profitUsd,
          returnPct,
          exitReason,
          lotSize,
          slPrice: openTrade.sl,
          tpPrice: openTrade.tp,
        });

        equityCurve.push({
          time: currentBar.time,
          timeIso: currentBar.timeIso || new Date(currentBar.time * 1000).toISOString(),
          equity: Math.round(currentEquity * 100) / 100,
        });

        openTrade = null;
      }
    }

    // 2. Generate entry signals if no active trade
    if (!openTrade && indicators) {
      let signal: 'BUY' | 'SELL' | null = null;

      switch (strategy.type) {
        case 'RSI_REVERSAL': {
          const oversold = params.rsiOversold ?? 30;
          const overbought = params.rsiOverbought ?? 70;
          if (indicators.rsi14 !== null) {
            if (indicators.rsi14 <= oversold) signal = 'BUY';
            else if (indicators.rsi14 >= overbought) signal = 'SELL';
          }
          break;
        }

        case 'EMA_CROSSOVER': {
          if (indicators.ema9 !== null && indicators.ema21 !== null) {
            if (indicators.ema9 > indicators.ema21 && prevBar.close <= (indicators.ema21 || 0)) {
              signal = 'BUY';
            } else if (indicators.ema9 < indicators.ema21 && prevBar.close >= (indicators.ema21 || 0)) {
              signal = 'SELL';
            }
          }
          break;
        }

        case 'MACD_MOMENTUM': {
          if (indicators.macd) {
            if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
              signal = 'BUY';
            } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
              signal = 'SELL';
            }
          }
          break;
        }

        case 'BOLLINGER_BREAKOUT': {
          if (indicators.bollinger) {
            if (currentBar.close < indicators.bollinger.lower) {
              signal = 'BUY'; // Mean reversion bounce
            } else if (currentBar.close > indicators.bollinger.upper) {
              signal = 'SELL';
            }
          }
          break;
        }

        case 'MULTI_INDICATOR_CONSENSUS':
        default: {
          if (indicators.summary === 'STRONG_BUY' || indicators.summary === 'BUY') {
            signal = 'BUY';
          } else if (indicators.summary === 'STRONG_SELL' || indicators.summary === 'SELL') {
            signal = 'SELL';
          }
          break;
        }
      }

      if (signal) {
        const entryPrice = currentBar.close;
        const sl =
          signal === 'BUY'
            ? entryPrice - slPoints * effectivePoint
            : entryPrice + slPoints * effectivePoint;
        const tp =
          signal === 'BUY'
            ? entryPrice + tpPoints * effectivePoint
            : entryPrice - tpPoints * effectivePoint;

        openTrade = {
          type: signal,
          entryIndex: i,
          entryTime: currentBar.time,
          entryTimeIso: currentBar.timeIso || new Date(currentBar.time * 1000).toISOString(),
          entryPrice,
          sl: Number(sl.toFixed(5)),
          tp: Number(tp.toFixed(5)),
        };
      }
    }
  }

  // Close lingering trade at end of history
  if (openTrade) {
    const lastBar = candles[candles.length - 1];
    const pointDiff =
      openTrade.type === 'BUY'
        ? (lastBar.close - openTrade.entryPrice) / effectivePoint
        : (openTrade.entryPrice - lastBar.close) / effectivePoint;

    const profitUsd = Math.round(pointDiff * lotSize * 10 * 100) / 100;
    const returnPct = Math.round((profitUsd / currentEquity) * 10000) / 100;
    currentEquity += profitUsd;

    trades.push({
      id: `sim-trd-${trades.length + 1}`,
      type: openTrade.type,
      entryIndex: openTrade.entryIndex,
      entryTime: openTrade.entryTime,
      entryTimeIso: openTrade.entryTimeIso,
      entryPrice: openTrade.entryPrice,
      exitIndex: candles.length - 1,
      exitTime: lastBar.time,
      exitTimeIso: lastBar.timeIso || new Date(lastBar.time * 1000).toISOString(),
      exitPrice: Number(lastBar.close.toFixed(5)),
      profitPoints: Math.round(pointDiff),
      profitUsd,
      returnPct,
      exitReason: 'END_OF_DATA',
      lotSize,
      slPrice: openTrade.sl,
      tpPrice: openTrade.tp,
    });
  }

  // Calculate Summary Statistics
  const winningTrades = trades.filter((t) => t.profitUsd > 0);
  const losingTrades = trades.filter((t) => t.profitUsd < 0);
  const totalTrades = trades.length;
  const winRatePct = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 1000) / 10 : 0;

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.profitUsd, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.profitUsd, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;
  const netProfit = Math.round((currentEquity - deposit) * 100) / 100;

  const averageWin = winningTrades.length > 0 ? Math.round((grossProfit / winningTrades.length) * 100) / 100 : 0;
  const averageLoss = losingTrades.length > 0 ? Math.round((grossLoss / losingTrades.length) * 100) / 100 : 0;
  const riskRewardRatio = averageLoss > 0 ? Math.round((averageWin / averageLoss) * 100) / 100 : 0;
  const averageTradeProfit = totalTrades > 0 ? Math.round((netProfit / totalTrades) * 100) / 100 : 0;

  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];

  return {
    id: `bt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    candleCount: candles.length,
    startTime: firstCandle.time,
    startTimeIso: firstCandle.timeIso || new Date(firstCandle.time * 1000).toISOString(),
    endTime: lastCandle.time,
    endTimeIso: lastCandle.timeIso || new Date(lastCandle.time * 1000).toISOString(),
    initialDeposit: deposit,
    finalEquity: Math.round(currentEquity * 100) / 100,
    netProfit,
    profitFactor,
    winRatePct,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
    maxDrawdownUsd: Math.round(maxDrawdownUsd * 100) / 100,
    averageTradeProfit,
    averageWin,
    averageLoss,
    riskRewardRatio,
    trades,
    equityCurve,
    evaluatedAt: Date.now(),
  };
}

/**
 * Evaluate current market conditions for a single strategy
 * Generates immediate BUY / SELL / NEUTRAL signal with SL/TP calculation
 */
export function evaluateLiveSignal(
  strategy: StrategyDefinition,
  candles: CandleData[],
  currentTick?: { bid: number; ask: number }
): StrategySignal {
  const sym = (strategy.symbol || 'EURUSD').toUpperCase();
  let effectivePoint = 0.0001;
  if (sym.includes('JPY')) effectivePoint = 0.01;
  else if (sym.includes('XAU') || sym.includes('GOLD')) effectivePoint = 0.01;
  else if (sym.includes('BTC') || sym.includes('ETH')) effectivePoint = 0.1;

  const params = strategy.parameters || {};
  const lotSize = Number(params.lotSize) || 0.1;
  const slPoints = Number(params.stopLossPoints) || 300;
  const tpPoints = Number(params.takeProfitPoints) || 600;

  if (!candles || candles.length < 15) {
    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      signal: 'NEUTRAL',
      confidence: 0,
      entryPrice: currentTick?.ask || 0,
      sl: 0,
      tp: 0,
      lotSize,
      rationale: `Insufficient candle data (${candles?.length || 0} bars available, minimum 15 required)`,
      timestamp: Date.now(),
      timestampIso: new Date().toISOString(),
    };
  }

  const indicators = calculateIndicators(candles, strategy.symbol, strategy.timeframe);
  if (!indicators) {
    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      signal: 'NEUTRAL',
      confidence: 0,
      entryPrice: currentTick?.ask || 0,
      sl: 0,
      tp: 0,
      lotSize,
      rationale: 'Could not compute indicators from chart candles',
      timestamp: Date.now(),
      timestampIso: new Date().toISOString(),
    };
  }

  const lastBar = candles[candles.length - 1];
  const prevBar = candles[candles.length - 2];
  const marketPrice = currentTick ? (currentTick.ask + currentTick.bid) / 2 : lastBar.close;

  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 50;
  let rationale = 'Conditions currently neutral; awaiting trigger thresholds.';

  switch (strategy.type) {
    case 'RSI_REVERSAL': {
      const oversold = params.rsiOversold ?? 30;
      const overbought = params.rsiOverbought ?? 70;
      const rsi = indicators.rsi14;

      if (rsi !== null) {
        if (rsi <= oversold) {
          signal = 'BUY';
          confidence = Math.min(95, Math.round(75 + (oversold - rsi) * 2));
          rationale = `RSI(14) is oversold at ${rsi.toFixed(1)} (<= ${oversold}). Mean-reversion BUY signal triggered.`;
        } else if (rsi >= overbought) {
          signal = 'SELL';
          confidence = Math.min(95, Math.round(75 + (rsi - overbought) * 2));
          rationale = `RSI(14) is overbought at ${rsi.toFixed(1)} (>= ${overbought}). Mean-reversion SELL signal triggered.`;
        } else {
          rationale = `RSI(14) is neutral at ${rsi.toFixed(1)} (thresholds: ${oversold}/${overbought}).`;
        }
      }
      break;
    }

    case 'EMA_CROSSOVER': {
      const fast = indicators.ema9;
      const slow = indicators.ema21;
      if (fast !== null && slow !== null) {
        const spread = Math.abs(fast - slow);
        if (fast > slow) {
          signal = 'BUY';
          confidence = 80;
          rationale = `Bullish trend: EMA 9 (${fast.toFixed(5)}) > EMA 21 (${slow.toFixed(5)}). Continuation BUY favored.`;
        } else if (fast < slow) {
          signal = 'SELL';
          confidence = 80;
          rationale = `Bearish trend: EMA 9 (${fast.toFixed(5)}) < EMA 21 (${slow.toFixed(5)}). Trend SELL favored.`;
        }
      }
      break;
    }

    case 'MACD_MOMENTUM': {
      if (indicators.macd) {
        const { macd, signal: sig, histogram } = indicators.macd;
        if (histogram > 0 && macd > sig) {
          signal = 'BUY';
          confidence = 82;
          rationale = `MACD histogram positive (+${histogram.toFixed(5)}) with MACD line above signal. Bullish momentum BUY.`;
        } else if (histogram < 0 && macd < sig) {
          signal = 'SELL';
          confidence = 82;
          rationale = `MACD histogram negative (${histogram.toFixed(5)}) with MACD line below signal. Bearish momentum SELL.`;
        } else {
          rationale = `MACD histogram near zero (${histogram.toFixed(5)}). Neutral momentum.`;
        }
      }
      break;
    }

    case 'BOLLINGER_BREAKOUT': {
      if (indicators.bollinger) {
        const { upper, lower, middle } = indicators.bollinger;
        if (lastBar.close < lower) {
          signal = 'BUY';
          confidence = 85;
          rationale = `Price (${lastBar.close.toFixed(5)}) closed below lower Bollinger Band (${lower.toFixed(5)}). Rebound BUY.`;
        } else if (lastBar.close > upper) {
          signal = 'SELL';
          confidence = 85;
          rationale = `Price (${lastBar.close.toFixed(5)}) closed above upper Bollinger Band (${upper.toFixed(5)}). Pullback SELL.`;
        } else {
          rationale = `Price oscillating inside Bollinger envelope (${lower.toFixed(5)} - ${upper.toFixed(5)}).`;
        }
      }
      break;
    }

    case 'MULTI_INDICATOR_CONSENSUS':
    default: {
      if (indicators.summary === 'STRONG_BUY') {
        signal = 'BUY';
        confidence = 90;
        rationale = 'Unanimous algorithmic consensus: RSI, EMAs, and MACD all indicating STRONG BUY.';
      } else if (indicators.summary === 'BUY') {
        signal = 'BUY';
        confidence = 75;
        rationale = 'Algorithmic consensus indicates BUY bias.';
      } else if (indicators.summary === 'STRONG_SELL') {
        signal = 'SELL';
        confidence = 90;
        rationale = 'Unanimous algorithmic consensus: RSI, EMAs, and MACD all indicating STRONG SELL.';
      } else if (indicators.summary === 'SELL') {
        signal = 'SELL';
        confidence = 75;
        rationale = 'Algorithmic consensus indicates SELL bias.';
      } else {
        rationale = 'Mixed indicator consensus: Indicators currently NEUTRAL.';
      }
      break;
    }
  }

  const entryPrice = signal === 'BUY'
    ? (currentTick ? currentTick.ask : lastBar.close)
    : (currentTick ? currentTick.bid : lastBar.close);

  const sl =
    signal === 'BUY'
      ? entryPrice - slPoints * effectivePoint
      : signal === 'SELL'
      ? entryPrice + slPoints * effectivePoint
      : 0;

  const tp =
    signal === 'BUY'
      ? entryPrice + tpPoints * effectivePoint
      : signal === 'SELL'
      ? entryPrice - tpPoints * effectivePoint
      : 0;

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol: strategy.symbol,
    timeframe: strategy.timeframe,
    signal,
    confidence,
    entryPrice: Number(entryPrice.toFixed(5)),
    sl: sl > 0 ? Number(sl.toFixed(5)) : 0,
    tp: tp > 0 ? Number(tp.toFixed(5)) : 0,
    lotSize,
    rationale,
    indicatorsSnapshot: {
      rsi: indicators.rsi14,
      macdHistogram: indicators.macd?.histogram,
      ema9: indicators.ema9,
      ema21: indicators.ema21,
      summary: indicators.summary,
    },
    timestamp: Date.now(),
    timestampIso: new Date().toISOString(),
  };
}

/**
 * Evaluate all active strategies stored in SQLite against current MT5 chart candles
 */
export async function evaluateAllActiveStrategies(): Promise<StrategySignal[]> {
  const strategies = await dbGetStrategies();
  const active = strategies.filter((s) => s.status === 'active');
  const results: StrategySignal[] = [];

  for (const strat of active) {
    let candles = await dbGetCandles(strat.symbol, strat.timeframe, 100);
    if (candles.length < 15) {
      const liveHistory = tradeStore.getChartHistory();
      if (liveHistory && liveHistory.length >= 15) {
        candles = liveHistory;
      }
    }

    const tick = tradeStore.getTicks()[strat.symbol];
    const sig = evaluateLiveSignal(strat, candles, tick ? { bid: tick.bid, ask: tick.ask } : undefined);
    results.push(sig);
  }

  return results;
}

/**
 * Execute a strategy signal through the site command queue to MT5 Bridge
 */
export async function executeStrategySignal(
  strategyId: string,
  customVolume?: number
): Promise<{ success: boolean; commandId?: string; signal: StrategySignal; message: string }> {
  const strategy = await dbGetStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, 100);
  if (candles.length < 15) {
    const liveHistory = tradeStore.getChartHistory();
    if (liveHistory && liveHistory.length >= 15) {
      candles = liveHistory;
    }
  }

  const tick = tradeStore.getTicks()[strategy.symbol];
  const signal = evaluateLiveSignal(strategy, candles, tick ? { bid: tick.bid, ask: tick.ask } : undefined);

  if (signal.signal === 'NEUTRAL') {
    return {
      success: false,
      signal,
      message: `Strategy "${strategy.name}" signal is currently NEUTRAL (${signal.rationale}). Order not placed.`,
    };
  }

  const vol = customVolume || signal.lotSize || 0.1;
  const enqResult = await tradeStore.enqueueCommand({
    action: 'EXECUTE_TRADE',
    symbol: signal.symbol,
    orderType: signal.signal,
    volume: vol,
    sl: signal.sl,
    tp: signal.tp,
    comment: `STRAT_${strategy.name.replace(/\s+/g, '_').slice(0, 14)}`,
    source: 'STRATEGY_ENGINE',
  });

  if (!enqResult.success) {
    return {
      success: false,
      signal,
      message: `Failed to enqueue trade: ${enqResult.error}`,
    };
  }

  tradeStore.addLog(
    'trade',
    'Strategy Trade Dispatched',
    `Site Strategy Engine dispatched ${signal.signal} ${vol} ${signal.symbol} at ~${signal.entryPrice} (SL: ${signal.sl}, TP: ${signal.tp}) for strategy "${strategy.name}"`,
    'STRATEGY_ENGINE'
  );

  return {
    success: true,
    commandId: enqResult.commandId,
    signal,
    message: `Order dispatched to MT5 queue (ID: ${enqResult.commandId}). Awaiting EA execution.`,
  };
}

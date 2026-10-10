import { CandleData, TechnicalIndicatorsResult } from '../types/mt5.js';

export function calculateIndicators(
  candles: CandleData[],
  symbol: string,
  timeframe: string
): TechnicalIndicatorsResult | null {
  if (!candles || candles.length < 5) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = closes.length;
  const currentPrice = closes[n - 1];
  const lastTime = candles[n - 1].time;

  // 1. RSI (14)
  const rsi14 = computeRSI(closes, 14);

  // 2. EMAs
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, Math.min(200, n));

  // 3. SMAs
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);

  // 4. MACD (12, 26, 9)
  const macd = computeMACD(closes, 12, 26, 9);

  // 5. Bollinger Bands (20, 2)
  const bollinger = computeBollinger(closes, 20, 2);

  // 6. ATR (14)
  const atr14 = computeATR(highs, lows, closes, 14);

  // 7. Signals & Summary
  let rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
  if (rsi14 !== null) {
    if (rsi14 >= 70) rsiSignal = 'OVERBOUGHT';
    else if (rsi14 <= 30) rsiSignal = 'OVERSOLD';
  }

  let macdSignal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL' = 'NEUTRAL';
  if (macd) {
    if (macd.histogram > 0) macdSignal = 'BULLISH_CROSS';
    else if (macd.histogram < 0) macdSignal = 'BEARISH_CROSS';
  }

  let emaSignal: 'ABOVE_200' | 'BELOW_200' | 'NEUTRAL' = 'NEUTRAL';
  if (ema200 !== null) {
    if (currentPrice > ema200) emaSignal = 'ABOVE_200';
    else if (currentPrice < ema200) emaSignal = 'BELOW_200';
  }

  let bullScore = 0;
  let bearScore = 0;

  if (rsi14 !== null) {
    if (rsi14 > 50 && rsi14 < 70) bullScore++;
    else if (rsi14 < 50 && rsi14 > 30) bearScore++;
    else if (rsi14 <= 30) bullScore += 2; // Mean reversion potential
    else if (rsi14 >= 70) bearScore += 2;
  }

  if (macd) {
    if (macd.histogram > 0) bullScore++;
    else bearScore++;
  }

  if (ema9 !== null && ema21 !== null) {
    if (ema9 > ema21) bullScore++;
    else bearScore++;
  }

  if (ema200 !== null) {
    if (currentPrice > ema200) bullScore++;
    else bearScore++;
  }

  let summary: TechnicalIndicatorsResult['summary'] = 'NEUTRAL';
  if (bullScore >= 4) summary = 'STRONG_BUY';
  else if (bullScore > bearScore) summary = 'BUY';
  else if (bearScore >= 4) summary = 'STRONG_SELL';
  else if (bearScore > bullScore) summary = 'SELL';

  return {
    symbol,
    timeframe,
    timestamp: lastTime,
    timestampIso: new Date(lastTime * 1000).toISOString(),
    price: currentPrice,
    rsi14,
    ema9,
    ema21,
    ema50,
    ema200,
    sma20,
    sma50,
    macd,
    bollinger,
    atr14,
    summary,
    signals: {
      rsiSignal,
      macdSignal,
      emaSignal,
    },
  };
}

function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(5));
}

function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(5));
}

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Number(rsi.toFixed(2));
}

function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slow + signal) return null;

  const macdLine: number[] = [];
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);

  let emaFast = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;

  for (let i = slow; i < closes.length; i++) {
    emaFast = closes[i] * kFast + emaFast * (1 - kFast);
    emaSlow = closes[i] * kSlow + emaSlow * (1 - kSlow);
    macdLine.push(emaFast - emaSlow);
  }

  if (macdLine.length < signal) return null;

  const kSignal = 2 / (signal + 1);
  let sig = macdLine.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  for (let i = signal; i < macdLine.length; i++) {
    sig = macdLine[i] * kSignal + sig * (1 - kSignal);
  }

  const currentMacd = macdLine[macdLine.length - 1];
  const hist = currentMacd - sig;

  return {
    macd: Number(currentMacd.toFixed(5)),
    signal: Number(sig.toFixed(5)),
    histogram: Number(hist.toFixed(5)),
  };
}

function computeBollinger(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number; middle: number; lower: number; bandwidth: number; percentB: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);

  const upper = mean + stdDev * sd;
  const lower = mean - stdDev * sd;
  const current = closes[closes.length - 1];
  const bandwidth = mean > 0 ? (upper - lower) / mean : 0;
  const percentB = upper !== lower ? (current - lower) / (upper - lower) : 0.5;

  return {
    upper: Number(upper.toFixed(5)),
    middle: Number(mean.toFixed(5)),
    lower: Number(lower.toFixed(5)),
    bandwidth: Number(bandwidth.toFixed(4)),
    percentB: Number(percentB.toFixed(4)),
  };
}

function computeATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  if (highs.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }

  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number(atr.toFixed(5));
}

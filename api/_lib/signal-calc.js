/**
 * Signal Calculation - Score-based System
 * Port of Python signal_calc.py
 */

const SCORE_PARAMS = {
  premium_weight: 0.30,
  lag_weight: 0.40,
  trend_weight: 0.30,
  buy_threshold: 55,
  premium_max: 14.0,
  momentum_max: 1.5,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function calcPremiumScore(premiumToday, premiumHistory) {
  if (premiumHistory.length < 5) return 50;
  const minP = Math.min(...premiumHistory);
  const maxP = Math.max(...premiumHistory);
  const avgP = mean(premiumHistory);
  if (maxP === minP) return 50;
  const position = (premiumToday - minP) / (maxP - minP);
  let score = (1 - position) * 100;
  if (premiumToday < avgP) score += 20;
  return clamp(score);
}

function calcLagScore(intlReturns, sjcReturns) {
  if (intlReturns.length < 4 || sjcReturns.length < 3) return 50;
  const intlChange = intlReturns.slice(-4).reduce((a, b) => a + b, 0);
  const sjcChange = sjcReturns.slice(-3).reduce((a, b) => a + b, 0);
  if (intlChange < -1.0) {
    if (sjcChange < -0.5) return 85;
    if (sjcChange < 0) return 70;
    return 40;
  }
  if (intlChange < 0) return 55;
  return 30;
}

function calcTrendScore(intlReturns) {
  if (intlReturns.length < 15) return 50;
  const trend = intlReturns.slice(-15).reduce((a, b) => a + b, 0);
  const recentReturns = intlReturns.slice(-3);
  const volatility = stdev(recentReturns);
  if (trend < -0.3) return volatility <= 0.5 ? 90 : 60;
  if (Math.abs(trend) < 1.0) return 70;
  return 30;
}

function calculateTodaySignal(priceData) {
  if (priceData.length < 10) {
    return {
      date: new Date().toISOString().slice(0, 10),
      signal: 'YELLOW',
      score: 0,
      scores: { premium_score: 0, lag_score: 0, trend_score: 0, total_score: 0 },
      sjc_price: 0,
      avg_30d: 0,
      savings_pct: 0,
      savings_amount: 0,
      premium_pct: 0,
      momentum_pct: 0,
      block_reason: 'Không đủ dữ liệu',
      filters: { is_hot: false, is_premium_high: false, is_price_high: false, is_score_low: true },
      prices: {},
    };
  }

  const sjcPrices = priceData.map((p) => p.sjc_price);
  const qtPrices = priceData.map((p) => p.qt_price);
  const premiumHistory = priceData.map((p) => p.premium_pct || 12.0);

  // Daily returns
  const intlReturns = [];
  const sjcReturns = [];
  for (let i = 1; i < priceData.length; i++) {
    if (qtPrices[i - 1] > 0) intlReturns.push(((qtPrices[i] - qtPrices[i - 1]) / qtPrices[i - 1]) * 100);
    if (sjcPrices[i - 1] > 0) sjcReturns.push(((sjcPrices[i] - sjcPrices[i - 1]) / sjcPrices[i - 1]) * 100);
  }

  const current = priceData[priceData.length - 1];
  const sjcToday = current.sjc_price;
  const premiumToday = current.premium_pct || 12.0;

  const sjc30d = sjcPrices.slice(-30);
  const avg30d = mean(sjc30d);
  const sjc7dAgo = sjcPrices.length >= 8 ? sjcPrices[sjcPrices.length - 8] : sjcPrices[0];
  const momentumPct = sjc7dAgo > 0 ? ((sjcToday - sjc7dAgo) / sjc7dAgo) * 100 : 0;

  const premiumScore = calcPremiumScore(premiumToday, premiumHistory.slice(-30));
  const lagScore = calcLagScore(intlReturns, sjcReturns);
  const trendScore = calcTrendScore(intlReturns);

  const totalScore =
    SCORE_PARAMS.premium_weight * premiumScore +
    SCORE_PARAMS.lag_weight * lagScore +
    SCORE_PARAMS.trend_weight * trendScore;

  // Filters
  const isHot = momentumPct > SCORE_PARAMS.momentum_max;
  const isPremiumHigh = premiumToday >= SCORE_PARAMS.premium_max;
  const isPriceHigh = sjcToday >= avg30d;
  const isScoreLow = totalScore < SCORE_PARAMS.buy_threshold;

  let blockReason = '';
  if (isHot) blockReason = `Giá đang tăng nhanh (${momentumPct.toFixed(1)}%/tuần)`;
  else if (isPremiumHigh) blockReason = `Premium cao (${premiumToday.toFixed(1)}%)`;
  else if (isPriceHigh) blockReason = 'Giá cao hơn trung bình 30 ngày';
  else if (isScoreLow) blockReason = `Điểm chưa đủ (${totalScore.toFixed(0)}/100)`;

  const anyBlock = isHot || isPremiumHigh || isPriceHigh || isScoreLow;
  const signal = anyBlock ? 'YELLOW' : 'GREEN';

  const savingsPct = avg30d > 0 ? ((avg30d - sjcToday) / avg30d) * 100 : 0;
  const savingsAmount = avg30d - sjcToday;

  return {
    date: new Date().toISOString().slice(0, 10),
    signal,
    score: Math.round(totalScore),
    scores: {
      premium_score: Math.round(premiumScore * 10) / 10,
      lag_score: Math.round(lagScore * 10) / 10,
      trend_score: Math.round(trendScore * 10) / 10,
      total_score: Math.round(totalScore * 10) / 10,
    },
    sjc_price: Math.round(sjcToday * 10) / 10,
    avg_30d: Math.round(avg30d * 10) / 10,
    savings_pct: Math.round(savingsPct * 10) / 10,
    savings_amount: Math.round(savingsAmount * 10) / 10,
    premium_pct: Math.round(premiumToday * 10) / 10,
    momentum_pct: Math.round(momentumPct * 10) / 10,
    block_reason: blockReason,
    filters: { is_hot: isHot, is_premium_high: isPremiumHigh, is_price_high: isPriceHigh, is_score_low: isScoreLow },
    prices: current,
  };
}

module.exports = { calculateTodaySignal };

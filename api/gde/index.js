const airtable = require('../_lib/airtable');
const { analyzeGold } = require('../_lib/gold-signal');
const { calculateTodaySignal } = require('../_lib/signal-calc');
const { handleCors, sendJson, sendError } = require('../_lib/cors');

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function getParams(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams;
}

function getPath(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Try route query param first (from rewrite), then path
  const route = url.searchParams.get('route');
  if (route) return route.replace(/\/$/, '');
  // Fallback: extract from pathname
  const match = url.pathname.match(/\/api\/(?:gold-d-eye|gde)\/(.*)/);
  return match ? match[1].replace(/\/$/, '') : '';
}

// ============ ROUTE HANDLERS ============

async function handleToday(req, res) {
  const prices = await airtable.getPrices(35);
  const priceHistory = [...prices].reverse();
  const result = calculateTodaySignal(priceHistory);
  if (prices.length > 0) {
    result.live_prices = {
      sjc_price: prices[0].sjc_price,
      qt_price: prices[0].qt_price,
      usd_vnd: prices[0].usd_vnd,
      premium_pct: prices[0].premium_pct,
      timestamp: new Date().toISOString(),
    };
  }
  result.last_updated = new Date().toISOString();
  result.data_source = 'airtable';
  sendJson(res, result);
}

async function handlePrices(req, res) {
  const days = Math.min(Math.max(parseInt(getParams(req).get('days') || '30'), 1), 365);
  const prices = await airtable.getPrices(days);
  sendJson(res, { prices, source: 'airtable', last_updated: new Date().toISOString() });
}

async function handlePricesCurrent(req, res) {
  const prices = await airtable.getPrices(1);
  if (prices.length > 0) {
    const l = prices[0];
    sendJson(res, { success: true, data: { qt_price: l.qt_price, sjc_price: l.sjc_price, usd_vnd: l.usd_vnd, premium_pct: l.premium_pct, premium_amount: 0, timestamp: new Date().toISOString(), source: 'airtable' } });
  } else {
    sendError(res, 'No price data available', 503);
  }
}

async function handlePricesChart(req, res) {
  const period = getParams(req).get('period') || '1M';
  const periodDays = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
  const days = periodDays[period] || 30;

  const [prices, allSignals] = await Promise.all([airtable.getPrices(days), airtable.getSignals(days)]);

  const signalsData = {};
  for (const s of allSignals) signalsData[s.date] = { signal: s.signal, score: s.score, pattern: s.pattern };
  const greenDates = Object.entries(signalsData).filter(([, d]) => d.signal === 'GREEN').map(([date]) => date);

  const seenDates = {};
  for (const p of prices) if (p.date) seenDates[p.date] = p;
  const sortedPrices = Object.values(seenDates).sort((a, b) => a.date.localeCompare(b.date));

  const chartData = sortedPrices.map((p) => {
    const usdVnd = p.usd_vnd || 25500;
    const qtUsd = p.qt_price || 0;
    const sjc = p.sjc_price || 0;
    const qtVnd = (qtUsd * 1.20566 * usdVnd) / 1_000_000;
    const diffAbs = sjc - qtVnd;
    const diffPct = qtVnd > 0 ? (diffAbs / qtVnd) * 100 : 0;
    const si = signalsData[p.date] || {};
    return { date: p.date, sjc: Math.round(sjc * 100) / 100, qt_vnd: Math.round(qtVnd * 100) / 100, qt_usd: Math.round(qtUsd * 100) / 100, usd_vnd: usdVnd, diff_abs: Math.round(diffAbs * 100) / 100, diff_pct: Math.round(diffPct * 100) / 100, is_buy: greenDates.includes(p.date), score: si.score, signal: si.signal, pattern: si.pattern };
  });

  sendJson(res, { data: chartData, period, total_points: chartData.length, buy_signals: greenDates });
}

async function handlePricesSignals(req, res) {
  const params = getParams(req);
  const days = Math.min(Math.max(parseInt(params.get('days') || '365'), 1), 1000);
  const signalFilter = params.get('signal_filter');

  const prices = signalFilter === 'GREEN' ? await airtable.getGreenPrices(days) : await airtable.getPrices(days);

  const result = [];
  for (const p of prices) {
    if (!p.date) continue;
    if (signalFilter && p.signal !== signalFilter) continue;
    const usdVnd = p.usd_vnd || 25500;
    const qtUsd = p.qt_price || 0;
    const sjc = p.sjc_price || 0;
    const qtVnd = (qtUsd * 1.20566 * usdVnd) / 1_000_000;
    result.push({ date: p.date, signal: p.signal || 'yellow', sjc_price: sjc, qt_price: qtUsd, qt_vnd: Math.round(qtVnd * 100) / 100, diff_abs: Math.round((sjc - qtVnd) * 100) / 100, premium_pct: p.premium_pct || 0, score: p.score, avg_30d: p.avg_30d, momentum: p.momentum, block_reason: p.block_reason });
  }

  sendJson(res, { signals: result, total: result.length, green_count: result.filter((r) => r.signal === 'GREEN').length, yellow_count: result.filter((r) => r.signal === 'yellow').length });
}

async function handleSignals(req, res) {
  const params = getParams(req);
  const days = Math.min(Math.max(parseInt(params.get('days') || '365'), 1), 1000);
  const signalType = params.get('signal_type');

  let signals;
  if (signalType === 'GREEN') signals = await airtable.getGreenSignals(days);
  else {
    signals = await airtable.getSignals(days);
    if (signalType && signalType !== 'GREEN') signals = signals.filter((s) => s.signal === signalType);
  }

  const counts = await airtable.getSignalCounts();
  sendJson(res, { signals, total: signals.length, summary: { green: counts.GREEN || 0, yellow: (counts.YELLOW || 0) + (counts.RED || 0) }, data_source: 'airtable' });
}

async function handleReport(req, res) {
  sendJson(res, {
    title: 'Gold Buy Signal Analysis - V10 Formula', version: '10.0', last_updated: new Date().toISOString(),
    executive_summary: 'The V10 formula identifies optimal gold buying opportunities by detecting three distinct price patterns.',
    hypothesis: { confirmed: [{ id: 'H1', title: 'SJC follows QT with lag', description: 'When international gold drops, SJC follows with 2-5 day lag', evidence: '82% correlation' }, { id: 'H2', title: 'Premium compression', description: 'Premium varies, creating buying opportunities', evidence: '3.2% average reduction' }, { id: 'H3', title: 'Pattern beats random', description: 'Pattern detection outperforms random timing', evidence: '2.8% savings' }] },
    patterns: { P1: { name: 'QT Drop + SJC Follow', frequency: '~3-5/year', avg_savings: '3.1%' }, P2: { name: 'SJC Self-Correction', frequency: '~2-3/year', avg_savings: '2.5%' }, P3: { name: 'Consolidation', frequency: '~4-6/year', avg_savings: '1.8%' } },
    backtest_results: [{ version: 'V10', metrics: { total_signals: 42, precision: 0.85, recall: 0.78, f1_score: 0.81, avg_savings_pct: 2.8, win_rate: 0.88 } }],
    limitations: ['Past performance does not guarantee future results', 'External events can override patterns'],
  });
}

async function handleReportMetrics(req, res) {
  sendJson(res, { current_version: 'V10', metrics: { precision: 0.85, recall: 0.78, f1_score: 0.81, avg_savings_pct: 2.8, win_rate: 0.88 }, improvement_vs_random: { savings_pct: 2.8, confidence: 0.95 } });
}

async function handleReportPatterns(req, res) {
  sendJson(res, { patterns: [
    { id: 'P1', name: 'QT Drop + SJC Follow', short_desc: 'Buy when QT drops and SJC follows', long_desc: 'When international gold drops >2% in 5 days, SJC typically follows with 2-5 day lag.', when_to_buy: 'After SJC shows initial drop', risk_level: 'Low-Medium' },
    { id: 'P2', name: 'SJC Self-Correction', short_desc: 'Buy when SJC drops independently', long_desc: 'SJC drops due to local factors while international gold remains stable.', when_to_buy: 'When SJC drops >1.5% while QT is stable', risk_level: 'Medium' },
    { id: 'P3', name: 'Consolidation', short_desc: 'Buy during low volatility', long_desc: 'After volatility, prices consolidate with low premium.', when_to_buy: 'During low volatility with premium <15%', risk_level: 'Low' },
  ] });
}

async function handleMacroLive(req, res) {
  const dateParam = getParams(req).get('date');
  let macroData;
  if (dateParam) {
    macroData = await airtable.getMacroByDate(dateParam);
    if (!macroData) return sendError(res, `No macro data for: ${dateParam}`, 404);
  } else {
    macroData = await airtable.getLatestMacro();
    if (!macroData) return sendError(res, 'No macro data available', 503);
  }

  const required = ['gold', 'vix', 'dxy', 'us10y', 'real_rate'];
  const missing = required.filter((k) => macroData[k] == null);
  if (missing.length) return sendError(res, `Missing: ${missing.join(', ')}`, 503);

  const result = analyzeGold(macroData);
  result.live_data = macroData;
  result.data_source = 'airtable';
  result.selected_date = dateParam;
  sendJson(res, result);
}

async function handleMacroDates(req, res) {
  const days = Math.min(Math.max(parseInt(getParams(req).get('days') || '365'), 1), 1000);
  const dates = await airtable.getMacroDateList(days);
  sendJson(res, { dates, total: dates.length });
}

async function handleMacroGram(req, res) {
  const period = Math.min(Math.max(parseInt(getParams(req).get('period') || '30'), 7), 365);
  const currentData = await airtable.getLatestMacro();
  if (!currentData) return sendError(res, 'No current macro data', 503);

  const now = new Date();
  let historicalData = null;
  const targetDate = new Date(now - period * 86400000).toISOString().slice(0, 10);
  historicalData = await airtable.getMacroByDate(targetDate);

  if (!historicalData) {
    for (let offset = 1; offset <= 7; offset++) {
      for (const dir of [-1, 1]) {
        const tryDate = new Date(now - (period + offset * dir) * 86400000).toISOString().slice(0, 10);
        historicalData = await airtable.getMacroByDate(tryDate);
        if (historicalData) break;
      }
      if (historicalData) break;
    }
  }
  if (!historicalData) return sendError(res, `No historical data for ~${period} days ago`, 503);

  const gC = currentData.gold || 0, gH = historicalData.gold || 0;
  if (gH === 0) return sendError(res, 'Invalid historical gold price', 503);

  const goldReturn = ((gC - gH) / gH) * 100;
  const vixChange = (currentData.vix || 0) - (historicalData.vix || 0);
  const dxyChangePct = historicalData.dxy ? (((currentData.dxy || 0) - historicalData.dxy) / historicalData.dxy) * 100 : 0;
  const rrChange = (currentData.real_rate || 0) - (historicalData.real_rate || 0);

  const risk = vixChange * 0.12, fx = dxyChangePct * -0.85, rate = rrChange * -1.8;
  const momentum = goldReturn > 0 ? goldReturn * 0.25 : 0;
  const total = risk + fx + rate + momentum;

  sendJson(res, {
    period_days: period, gold_return: Math.round(goldReturn * 100) / 100,
    attributions: {
      risk_uncertainty: { label: 'Risk & Uncertainty', indicator: 'VIX', contribution: Math.round(risk * 100) / 100, indicator_change: Math.round(vixChange * 10) / 10, indicator_change_unit: 'points' },
      opportunity_cost_fx: { label: 'Opportunity Cost (FX)', indicator: 'DXY', contribution: Math.round(fx * 100) / 100, indicator_change: Math.round(dxyChangePct * 100) / 100, indicator_change_unit: '%' },
      opportunity_cost_rates: { label: 'Opportunity Cost (Rates)', indicator: 'Real Rate', contribution: Math.round(rate * 100) / 100, indicator_change: Math.round(rrChange * 100) / 100, indicator_change_unit: '%' },
      momentum: { label: 'Momentum', indicator: 'Price Trend', contribution: Math.round(momentum * 100) / 100, indicator_change: null, indicator_change_unit: null },
    },
    residual: Math.round((goldReturn - total) * 100) / 100, total_explained: Math.round(total * 100) / 100,
    explanation_ratio: goldReturn !== 0 ? Math.round((total / goldReturn) * 1000) / 10 : 0,
    indicators: {
      current: { gold: Math.round(gC * 100) / 100, vix: Math.round((currentData.vix || 0) * 10) / 10, dxy: Math.round((currentData.dxy || 0) * 100) / 100, real_rate: Math.round((currentData.real_rate || 0) * 100) / 100, timestamp: currentData.timestamp },
      historical: { gold: Math.round(gH * 100) / 100, vix: Math.round((historicalData.vix || 0) * 10) / 10, dxy: Math.round((historicalData.dxy || 0) * 100) / 100, real_rate: Math.round((historicalData.real_rate || 0) * 100) / 100, timestamp: historicalData.timestamp },
    },
    methodology: { source: 'Based on WGC GRAM framework', coefficients: { vix: '+0.12% per point', dxy: '-0.85% per 1%', real_rate: '-1.8% per 1%', momentum: '0.25x of return' } },
  });
}

async function handleResearchStats(req, res) {
  const prices = await airtable.getPrices(365);
  if (!prices.length) return sendError(res, 'No data', 503);

  // Premium stats
  const premiums = prices.filter((p) => p.premium_pct != null).map((p) => p.premium_pct);
  const sortedP = [...premiums].sort((a, b) => a - b);
  const bins = [[0, 8, '<8%'], [8, 12, '8-12%'], [12, 14, '12-14%'], [14, 16, '14-16%'], [16, 20, '16-20%'], [20, 100, '>20%']];
  const distribution = bins.map(([low, high, label]) => {
    const count = premiums.filter((p) => p >= low && p < high).length;
    return { range: label, count, pct: premiums.length > 0 ? Math.round((count / premiums.length) * 100) : 0, below_threshold: high <= 14 };
  });

  const premiumStats = premiums.length ? {
    min: Math.round(Math.min(...premiums) * 10) / 10,
    max: Math.round(Math.max(...premiums) * 10) / 10,
    mean: Math.round(mean(premiums) * 10) / 10,
    median: Math.round(sortedP[Math.floor(sortedP.length / 2)] * 10) / 10,
    distribution,
  } : { min: 0, max: 0, mean: 0, median: 0, distribution: [] };

  // Backtest stats
  const valid = prices.filter((p) => p.date && p.sjc_price > 0);
  const greenP = valid.filter((p) => p.signal === 'GREEN');
  const allSjc = valid.map((p) => p.sjc_price);
  const greenSjc = greenP.map((p) => p.sjc_price);
  const randomAvg = mean(allSjc);
  const signalAvg = greenSjc.length ? mean(greenSjc) : randomAvg;
  const savingsPct = randomAvg > 0 ? ((randomAvg - signalAvg) / randomAvg) * 100 : 0;

  const validDates = prices.filter((p) => p.date).map((p) => p.date);

  sendJson(res, {
    premium_stats: premiumStats,
    lag_stats: { qt_drop_events: 0, lag_distribution: [], transmission: {}, pattern_stats: { success_count: 0, success_rate: 0, avg_premium_decrease: 0, avg_premium_on_qt_drop: 0, fail_count: 0, avg_premium_increase_on_fail: 0, by_magnitude: [] }, summary: { fast_response_pct: 0, slow_response_pct: 0, no_response_pct: 0 } },
    backtest: { total_days: valid.length, buy_signals: greenP.length, precision: 0, recall: 0, worst_case: 0, avg_savings_pct: Math.round(savingsPct * 10) / 10, vs_random: { signal_avg_price: Math.round(signalAvg * 10) / 10, random_avg_price: Math.round(randomAvg * 10) / 10 } },
    data_period: { start: validDates.length ? validDates.reduce((a, b) => (a < b ? a : b)) : null, end: validDates.length ? validDates.reduce((a, b) => (a > b ? a : b)) : null, days: new Set(validDates).size },
    last_updated: new Date().toISOString(),
  });
}

async function handleResearchExamples(req, res) {
  const prices = await airtable.getPrices(365);
  const sorted = prices.filter((p) => p.date && p.sjc_price && p.signal).sort((a, b) => a.date.localeCompare(b.date));
  const greenSignals = sorted.filter((p) => p.signal === 'GREEN');

  let success = null, failure = null;
  for (const sig of greenSignals) {
    const futureEnd = new Date(new Date(sig.date).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const fp = sorted.filter((p) => p.date > sig.date && p.date <= futureEnd).map((p) => p.sjc_price);
    if (fp.length >= 5) {
      const avg = mean(fp);
      const isSuccess = sig.sjc_price < avg;
      const changePct = Math.round(((avg - sig.sjc_price) / sig.sjc_price) * 10000) / 100;
      const ex = { date: sig.date, sjc_price: Math.round(sig.sjc_price * 10) / 10, premium_pct: sig.premium_pct ? Math.round(sig.premium_pct * 10) / 10 : null, avg_7d_after: Math.round(avg * 10) / 10, price_change_pct: changePct, outcome: isSuccess ? 'success' : 'failure' };
      if (isSuccess && !success) success = ex;
      else if (!isSuccess && !failure) failure = ex;
    }
    if (success && failure) break;
  }
  sendJson(res, { success, failure });
}

// ============ MAIN ROUTER ============

const routes = {
  'today': handleToday,
  'prices': handlePrices,
  'prices/current': handlePricesCurrent,
  'prices/chart': handlePricesChart,
  'prices/signals': handlePricesSignals,
  'signals': handleSignals,
  'report': handleReport,
  'report/metrics': handleReportMetrics,
  'report/patterns': handleReportPatterns,
  'macro/live': handleMacroLive,
  'macro/dates': handleMacroDates,
  'macro/gram': handleMacroGram,
  'research/stats': handleResearchStats,
  'research/examples': handleResearchExamples,
};

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const path = getPath(req);
    const handler = routes[path];

    if (handler) {
      await handler(req, res);
    } else {
      sendError(res, `Not found: ${path}`, 404);
    }
  } catch (e) {
    console.error('API Error:', e);
    sendError(res, e.message || 'Internal server error');
  }
};

const { getPrices } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function calcPremiumStats(prices) {
  const premiums = prices.filter(p => p.premium_pct != null).map(p => p.premium_pct);
  if (!premiums.length) return { min: 0, max: 0, mean: 0, median: 0, distribution: [] };

  const sorted = [...premiums].sort((a, b) => a - b);
  const total = premiums.length;
  const bins = [[0, 8, '<8%'], [8, 12, '8-12%'], [12, 14, '12-14%'], [14, 16, '14-16%'], [16, 20, '16-20%'], [20, 100, '>20%']];

  const distribution = bins.map(([low, high, label]) => {
    const count = premiums.filter(p => p >= low && p < high).length;
    return { range: label, count, pct: total > 0 ? Math.round(count / total * 100) : 0, below_threshold: high <= 14 };
  });

  return {
    min: Math.round(Math.min(...premiums) * 10) / 10,
    max: Math.round(Math.max(...premiums) * 10) / 10,
    mean: Math.round(mean(premiums) * 10) / 10,
    median: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
    distribution,
  };
}

function calcLagStats(prices) {
  const sorted = prices.filter(p => p.date && p.qt_price && p.sjc_price).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { qt_drop_events: 0, lag_distribution: [], transmission: {}, pattern_stats: { success_count: 0, success_rate: 0, avg_premium_decrease: 0, avg_premium_on_qt_drop: 0, fail_count: 0, avg_premium_increase_on_fail: 0, by_magnitude: [] }, summary: { fast_response_pct: 0, slow_response_pct: 0, no_response_pct: 0 } };

  const qtDropEvents = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevQt = sorted[i - 1].qt_price || 0;
    const currQt = sorted[i].qt_price || 0;
    if (prevQt > 0) {
      const change = ((currQt - prevQt) / prevQt) * 100;
      if (change <= -1.0) {
        qtDropEvents.push({ date: sorted[i].date, index: i, qt_drop_pct: Math.abs(change), premium_day0: sorted[i].premium_pct });
      }
    }
  }

  const totalEvents = qtDropEvents.length;
  if (totalEvents === 0) return { qt_drop_events: 0, lag_distribution: [], transmission: {}, pattern_stats: { success_count: 0, success_rate: 0, avg_premium_decrease: 0, avg_premium_on_qt_drop: 0, fail_count: 0, avg_premium_increase_on_fail: 0, by_magnitude: [] }, summary: { fast_response_pct: 0, slow_response_pct: 0, no_response_pct: 0 } };

  const lagCounts = {};
  const transmissionByLag = {};

  for (const event of qtDropEvents) {
    const { index: idx, qt_drop_pct: qtDrop } = event;
    const baseSjc = idx > 0 ? (sorted[idx - 1].sjc_price || 0) : 0;
    let foundResponse = false;

    for (let lag = 0; lag < 6; lag++) {
      if (idx + lag >= sorted.length) break;
      const currSjc = sorted[idx + lag].sjc_price || 0;
      if (baseSjc > 0) {
        const sjcChange = ((baseSjc - currSjc) / baseSjc) * 100;
        if (!transmissionByLag[lag]) transmissionByLag[lag] = [];
        transmissionByLag[lag].push({ sjc_drop: sjcChange, qt_drop: qtDrop });
        if (!foundResponse && sjcChange >= 0.5) {
          lagCounts[lag] = (lagCounts[lag] || 0) + 1;
          foundResponse = true;
        }
      }
    }
    if (!foundResponse) lagCounts['never'] = (lagCounts['never'] || 0) + 1;
  }

  const lagDistribution = [0, 1, 2].map(lag => ({
    lag, count: lagCounts[lag] || 0, pct: totalEvents > 0 ? Math.round(((lagCounts[lag] || 0) / totalEvents) * 100) : 0,
  }));
  const lag35 = [3, 4, 5].reduce((s, i) => s + (lagCounts[i] || 0), 0);
  lagDistribution.push({ lag: '3-5', count: lag35, pct: totalEvents > 0 ? Math.round(lag35 / totalEvents * 100) : 0 });
  const neverCount = lagCounts['never'] || 0;
  lagDistribution.push({ lag: 'never', count: neverCount, pct: totalEvents > 0 ? Math.round(neverCount / totalEvents * 100) : 0 });

  const transmission = {};
  for (const lag of [0, 1, 2, 3, 5]) {
    if (transmissionByLag[lag] && transmissionByLag[lag].length) {
      const data = transmissionByLag[lag];
      transmission[lag] = {
        avg_sjc_drop: Math.round(mean(data.map(d => d.sjc_drop)) * 100) / 100,
        avg_qt_drop: Math.round(mean(data.map(d => d.qt_drop)) * 100) / 100,
        transmission_pct: Math.round(mean(data.map(d => d.qt_drop > 0 ? d.sjc_drop / d.qt_drop * 100 : 0))),
      };
    }
  }

  // Pattern stats
  let successCount = 0, failCount = 0;
  const premiumDecreases = [], premiumIncreases = [];
  for (const event of qtDropEvents) {
    const { index: idx, premium_day0 } = event;
    if (idx + 3 < sorted.length && premium_day0 != null) {
      const premium3 = sorted[idx + 3].premium_pct;
      if (premium3 != null) {
        const change = premium_day0 - premium3;
        if (change > 0) { successCount++; premiumDecreases.push(change); }
        else { failCount++; premiumIncreases.push(Math.abs(change)); }
      }
    }
  }

  const fast = (lagCounts[0] || 0) + (lagCounts[1] || 0);
  const slow = (lagCounts[2] || 0) + lag35;

  return {
    qt_drop_events: totalEvents,
    avg_qt_drop: Math.round(mean(qtDropEvents.map(e => e.qt_drop_pct)) * 100) / 100,
    lag_distribution: lagDistribution,
    transmission,
    pattern_stats: {
      success_count: successCount,
      success_rate: totalEvents > 0 ? Math.round(successCount / totalEvents * 100) : 0,
      avg_premium_decrease: premiumDecreases.length ? Math.round(mean(premiumDecreases) * 10) / 10 : 0,
      avg_premium_on_qt_drop: Math.round(mean(qtDropEvents.filter(e => e.premium_day0 != null).map(e => e.premium_day0)) * 10) / 10,
      fail_count: failCount,
      avg_premium_increase_on_fail: premiumIncreases.length ? Math.round(mean(premiumIncreases) * 10) / 10 : 0,
      by_magnitude: [],
    },
    summary: {
      fast_response_pct: totalEvents > 0 ? Math.round(fast / totalEvents * 100) : 0,
      slow_response_pct: totalEvents > 0 ? Math.round(slow / totalEvents * 100) : 0,
      no_response_pct: totalEvents > 0 ? Math.round(neverCount / totalEvents * 100) : 0,
    },
  };
}

function calcBacktestStats(prices) {
  const valid = prices.filter(p => p.date && p.sjc_price && p.sjc_price > 0);
  if (!valid.length) return { total_days: 0, buy_signals: 0, precision: 0, recall: 0, worst_case: 0, avg_savings_pct: 0, vs_random: { signal_avg_price: 0, random_avg_price: 0 } };

  const greenPrices = valid.filter(p => p.signal === 'GREEN');
  const allSjc = valid.map(p => p.sjc_price);
  const greenSjc = greenPrices.map(p => p.sjc_price);

  const randomAvg = mean(allSjc);
  const signalAvg = greenSjc.length ? mean(greenSjc) : randomAvg;
  const savingsPct = randomAvg > 0 ? ((randomAvg - signalAvg) / randomAvg) * 100 : 0;

  let wins = 0;
  const losses = [];
  for (const gp of greenPrices) {
    const futureEnd = new Date(new Date(gp.date).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const futurePrices = valid.filter(p => p.date > gp.date && p.date <= futureEnd).map(p => p.sjc_price);
    if (futurePrices.length) {
      const avgFuture = mean(futurePrices);
      if (gp.sjc_price < avgFuture) wins++;
      else losses.push(((gp.sjc_price - avgFuture) / gp.sjc_price) * 100);
    }
  }

  const precision = greenPrices.length ? Math.round(wins / greenPrices.length * 100) : 0;
  const worstCase = losses.length ? Math.round(Math.max(...losses) * 10) / 10 : 0;

  return {
    total_days: valid.length,
    buy_signals: greenPrices.length,
    precision,
    recall: 0,
    worst_case: worstCase,
    avg_savings_pct: Math.round(savingsPct * 10) / 10,
    vs_random: { signal_avg_price: Math.round(signalAvg * 10) / 10, random_avg_price: Math.round(randomAvg * 10) / 10 },
  };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const prices = await getPrices(365);
    if (!prices.length) return sendError(res, 'No price data available', 503);

    const validDates = prices.filter(p => p.date).map(p => p.date);
    const startDate = validDates.length ? validDates.reduce((a, b) => a < b ? a : b) : null;
    const endDate = validDates.length ? validDates.reduce((a, b) => a > b ? a : b) : null;

    sendJson(res, {
      premium_stats: calcPremiumStats(prices),
      lag_stats: calcLagStats(prices),
      backtest: calcBacktestStats(prices),
      data_period: { start: startDate, end: endDate, days: new Set(validDates).size },
      last_updated: new Date().toISOString(),
    });
  } catch (e) {
    sendError(res, e.message);
  }
};

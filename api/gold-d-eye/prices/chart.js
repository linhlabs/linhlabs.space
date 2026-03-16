const { getPrices, getSignals } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const period = url.searchParams.get('period') || '1M';
    const periodDays = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
    const days = periodDays[period] || 30;

    const [prices, allSignals] = await Promise.all([
      getPrices(days),
      getSignals(days),
    ]);

    // Build signal lookup
    const signalsData = {};
    for (const s of allSignals) {
      signalsData[s.date] = { signal: s.signal, score: s.score, pattern: s.pattern };
    }
    const greenDates = Object.entries(signalsData)
      .filter(([, d]) => d.signal === 'GREEN')
      .map(([date]) => date);

    // Deduplicate and sort oldest first
    const seenDates = {};
    for (const p of prices) {
      if (p.date) seenDates[p.date] = p;
    }
    const sortedPrices = Object.values(seenDates).sort((a, b) => a.date.localeCompare(b.date));

    // Format for chart
    const chartData = sortedPrices.map((p) => {
      const usdVnd = p.usd_vnd || 25500;
      const qtUsd = p.qt_price || 0;
      const sjc = p.sjc_price || 0;
      const qtVnd = (qtUsd * 1.20566 * usdVnd) / 1_000_000;
      const diffAbs = sjc - qtVnd;
      const diffPct = qtVnd > 0 ? (diffAbs / qtVnd) * 100 : 0;
      const signalInfo = signalsData[p.date] || {};

      return {
        date: p.date,
        sjc: Math.round(sjc * 100) / 100,
        qt_vnd: Math.round(qtVnd * 100) / 100,
        qt_usd: Math.round(qtUsd * 100) / 100,
        usd_vnd: usdVnd,
        diff_abs: Math.round(diffAbs * 100) / 100,
        diff_pct: Math.round(diffPct * 100) / 100,
        is_buy: greenDates.includes(p.date),
        score: signalInfo.score,
        signal: signalInfo.signal,
        pattern: signalInfo.pattern,
      };
    });

    sendJson(res, {
      data: chartData,
      period,
      total_points: chartData.length,
      buy_signals: greenDates,
    });
  } catch (e) {
    sendError(res, e.message);
  }
};

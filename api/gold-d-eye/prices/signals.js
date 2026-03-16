const { getPrices, getGreenPrices } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '365'), 1), 1000);
    const signalFilter = url.searchParams.get('signal_filter');

    const prices = signalFilter === 'GREEN' ? await getGreenPrices(days) : await getPrices(days);

    const result = [];
    for (const p of prices) {
      if (!p.date) continue;
      if (signalFilter && p.signal !== signalFilter) continue;

      const usdVnd = p.usd_vnd || 25500;
      const qtUsd = p.qt_price || 0;
      const sjc = p.sjc_price || 0;
      const qtVnd = (qtUsd * 1.20566 * usdVnd) / 1_000_000;
      const diffAbs = sjc - qtVnd;

      result.push({
        date: p.date,
        signal: p.signal || 'yellow',
        sjc_price: sjc,
        qt_price: qtUsd,
        qt_vnd: Math.round(qtVnd * 100) / 100,
        diff_abs: Math.round(diffAbs * 100) / 100,
        premium_pct: p.premium_pct || 0,
        score: p.score,
        avg_30d: p.avg_30d,
        momentum: p.momentum,
        block_reason: p.block_reason,
      });
    }

    const greenCount = result.filter((r) => r.signal === 'GREEN').length;
    const yellowCount = result.filter((r) => r.signal === 'yellow').length;

    sendJson(res, { signals: result, total: result.length, green_count: greenCount, yellow_count: yellowCount });
  } catch (e) {
    sendError(res, e.message);
  }
};

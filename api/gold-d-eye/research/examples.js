const { getPrices } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const prices = await getPrices(365);
    const sorted = prices
      .filter((p) => p.date && p.sjc_price && p.signal)
      .sort((a, b) => a.date.localeCompare(b.date));

    const greenSignals = sorted.filter((p) => p.signal === 'GREEN');

    let success = null;
    let failure = null;

    for (const signal of greenSignals) {
      const futureEnd = new Date(new Date(signal.date).getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const futurePrices = sorted
        .filter((p) => p.date > signal.date && p.date <= futureEnd)
        .map((p) => p.sjc_price);

      if (futurePrices.length >= 5) {
        const avgFuture = futurePrices.reduce((a, b) => a + b, 0) / futurePrices.length;
        const isSuccess = signal.sjc_price < avgFuture;
        const priceChangePct = Math.round(((avgFuture - signal.sjc_price) / signal.sjc_price) * 10000) / 100;

        const example = {
          date: signal.date,
          sjc_price: Math.round(signal.sjc_price * 10) / 10,
          premium_pct: signal.premium_pct ? Math.round(signal.premium_pct * 10) / 10 : null,
          avg_7d_after: Math.round(avgFuture * 10) / 10,
          price_change_pct: priceChangePct,
          outcome: isSuccess ? 'success' : 'failure',
        };

        if (isSuccess && !success) success = example;
        else if (!isSuccess && !failure) failure = example;
      }

      if (success && failure) break;
    }

    sendJson(res, { success, failure });
  } catch (e) {
    sendJson(res, { success: null, failure: null, error: e.message });
  }
};

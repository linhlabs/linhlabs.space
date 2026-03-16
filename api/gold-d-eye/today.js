const { getPrices } = require('../_lib/airtable');
const { calculateTodaySignal } = require('../_lib/signal-calc');
const { handleCors, sendJson, sendError } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const prices = await getPrices(35);
    const priceHistory = [...prices].reverse(); // oldest first
    const result = calculateTodaySignal(priceHistory);

    // Add live prices from latest Airtable data
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
  } catch (e) {
    sendError(res, e.message);
  }
};

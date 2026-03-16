const { getPrices } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const prices = await getPrices(1);
    if (prices.length > 0) {
      const latest = prices[0];
      sendJson(res, {
        success: true,
        data: {
          qt_price: latest.qt_price,
          sjc_price: latest.sjc_price,
          usd_vnd: latest.usd_vnd,
          premium_pct: latest.premium_pct,
          premium_amount: 0,
          timestamp: new Date().toISOString(),
          source: 'airtable',
        },
      });
    } else {
      sendError(res, 'No price data available', 503);
    }
  } catch (e) {
    sendError(res, e.message);
  }
};

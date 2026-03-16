const { getPrices } = require('../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 365);
    const prices = await getPrices(days);

    sendJson(res, {
      prices,
      source: 'airtable',
      last_updated: new Date().toISOString(),
    });
  } catch (e) {
    sendError(res, e.message);
  }
};

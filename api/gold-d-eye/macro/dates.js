const { getMacroDateList } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '365'), 1), 1000);
    const dates = await getMacroDateList(days);
    sendJson(res, { dates, total: dates.length });
  } catch (e) {
    sendError(res, e.message);
  }
};

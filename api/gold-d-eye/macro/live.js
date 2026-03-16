const { getLatestMacro, getMacroByDate } = require('../../_lib/airtable');
const { analyzeGold } = require('../../_lib/gold-signal');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const dateParam = url.searchParams.get('date');

    let macroData;
    if (dateParam) {
      macroData = await getMacroByDate(dateParam);
      if (!macroData) return sendError(res, `No macro data for date: ${dateParam}`, 404);
    } else {
      macroData = await getLatestMacro();
      if (!macroData) return sendError(res, 'No macro data available', 503);
    }

    const required = ['gold', 'vix', 'dxy', 'us10y', 'real_rate'];
    const missing = required.filter((k) => macroData[k] == null);
    if (missing.length) return sendError(res, `Incomplete macro data: missing ${missing.join(', ')}`, 503);

    const result = analyzeGold(macroData);
    result.live_data = macroData;
    result.data_source = 'airtable';
    result.selected_date = dateParam;

    sendJson(res, result);
  } catch (e) {
    sendError(res, e.message);
  }
};

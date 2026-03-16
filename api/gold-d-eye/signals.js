const { getSignals, getGreenSignals, getSignalCounts } = require('../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '365'), 1), 1000);
    const signalType = url.searchParams.get('signal_type');

    let signals;
    if (signalType === 'GREEN') {
      signals = await getGreenSignals(days);
    } else {
      signals = await getSignals(days);
      if (signalType && signalType !== 'GREEN') {
        signals = signals.filter((s) => s.signal === signalType);
      }
    }

    const counts = await getSignalCounts();

    sendJson(res, {
      signals,
      total: signals.length,
      summary: {
        green: counts.GREEN || 0,
        yellow: (counts.YELLOW || 0) + (counts.RED || 0),
      },
      data_source: 'airtable',
    });
  } catch (e) {
    sendError(res, e.message);
  }
};

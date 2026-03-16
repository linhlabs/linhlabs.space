const { handleCors, sendJson } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  sendJson(res, {
    patterns: [
      { id: 'P1', name: 'QT Drop + SJC Follow', short_desc: 'Buy when QT drops and SJC follows', long_desc: 'When international gold prices drop significantly (>2% in 5 days), Vietnamese SJC gold typically follows with a 2-5 day lag.', when_to_buy: 'After SJC shows initial drop following QT decline', risk_level: 'Low-Medium' },
      { id: 'P2', name: 'SJC Self-Correction', short_desc: 'Buy when SJC drops independently', long_desc: 'Occasionally, SJC prices drop due to local market factors while international gold remains stable.', when_to_buy: 'When SJC drops >1.5% while QT is stable', risk_level: 'Medium' },
      { id: 'P3', name: 'Consolidation', short_desc: 'Buy during low volatility with compressed premium', long_desc: 'After periods of volatility, prices often consolidate with low premium and reduced downside risk.', when_to_buy: 'During low volatility periods with premium <15%', risk_level: 'Low' },
    ],
  });
};

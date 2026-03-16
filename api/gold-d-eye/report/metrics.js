const { handleCors, sendJson } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  sendJson(res, {
    current_version: 'V10',
    metrics: { precision: 0.85, recall: 0.78, f1_score: 0.81, avg_savings_pct: 2.8, win_rate: 0.88 },
    improvement_vs_random: { savings_pct: 2.8, confidence: 0.95 },
  });
};

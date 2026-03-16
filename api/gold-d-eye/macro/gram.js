const { getLatestMacro, getMacroByDate } = require('../../_lib/airtable');
const { handleCors, sendJson, sendError } = require('../../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const period = Math.min(Math.max(parseInt(url.searchParams.get('period') || '30'), 7), 365);

    const currentData = await getLatestMacro();
    if (!currentData) return sendError(res, 'No current macro data available', 503);

    // Get historical data
    const now = new Date();
    let historicalData = null;
    const targetDate = new Date(now - period * 86400000).toISOString().slice(0, 10);
    historicalData = await getMacroByDate(targetDate);

    if (!historicalData) {
      for (let offset = 1; offset <= 7; offset++) {
        for (const dir of [-1, 1]) {
          const tryDate = new Date(now - (period + offset * dir) * 86400000).toISOString().slice(0, 10);
          historicalData = await getMacroByDate(tryDate);
          if (historicalData) break;
        }
        if (historicalData) break;
      }
    }

    if (!historicalData) return sendError(res, `No historical macro data for ~${period} days ago`, 503);

    const goldCurrent = currentData.gold || 0;
    const goldHistorical = historicalData.gold || 0;
    if (goldHistorical === 0) return sendError(res, 'Invalid historical gold price', 503);

    const goldReturn = ((goldCurrent - goldHistorical) / goldHistorical) * 100;
    const vixChange = (currentData.vix || 0) - (historicalData.vix || 0);
    const dxyChangePct = historicalData.dxy ? (((currentData.dxy || 0) - historicalData.dxy) / historicalData.dxy) * 100 : 0;
    const realRateChange = (currentData.real_rate || 0) - (historicalData.real_rate || 0);

    const COEF_VIX = 0.12;
    const COEF_DXY = -0.85;
    const COEF_REAL_RATE = -1.8;
    const COEF_MOMENTUM = 0.25;

    const riskContrib = vixChange * COEF_VIX;
    const fxContrib = dxyChangePct * COEF_DXY;
    const rateContrib = realRateChange * COEF_REAL_RATE;
    const momentumContrib = goldReturn > 0 ? goldReturn * COEF_MOMENTUM : 0;
    const totalExplained = riskContrib + fxContrib + rateContrib + momentumContrib;
    const residual = goldReturn - totalExplained;

    sendJson(res, {
      period_days: period,
      gold_return: Math.round(goldReturn * 100) / 100,
      attributions: {
        risk_uncertainty: { label: 'Risk & Uncertainty', indicator: 'VIX', contribution: Math.round(riskContrib * 100) / 100, indicator_change: Math.round(vixChange * 10) / 10, indicator_change_unit: 'points' },
        opportunity_cost_fx: { label: 'Opportunity Cost (FX)', indicator: 'DXY', contribution: Math.round(fxContrib * 100) / 100, indicator_change: Math.round(dxyChangePct * 100) / 100, indicator_change_unit: '%' },
        opportunity_cost_rates: { label: 'Opportunity Cost (Rates)', indicator: 'Real Rate', contribution: Math.round(rateContrib * 100) / 100, indicator_change: Math.round(realRateChange * 100) / 100, indicator_change_unit: '%' },
        momentum: { label: 'Momentum', indicator: 'Price Trend', contribution: Math.round(momentumContrib * 100) / 100, indicator_change: null, indicator_change_unit: null },
      },
      residual: Math.round(residual * 100) / 100,
      total_explained: Math.round(totalExplained * 100) / 100,
      explanation_ratio: goldReturn !== 0 ? Math.round((totalExplained / goldReturn) * 1000) / 10 : 0,
      indicators: {
        current: { gold: Math.round(goldCurrent * 100) / 100, vix: Math.round((currentData.vix || 0) * 10) / 10, dxy: Math.round((currentData.dxy || 0) * 100) / 100, real_rate: Math.round((currentData.real_rate || 0) * 100) / 100, timestamp: currentData.timestamp },
        historical: { gold: Math.round(goldHistorical * 100) / 100, vix: Math.round((historicalData.vix || 0) * 10) / 10, dxy: Math.round((historicalData.dxy || 0) * 100) / 100, real_rate: Math.round((historicalData.real_rate || 0) * 100) / 100, timestamp: historicalData.timestamp },
      },
      methodology: {
        source: 'Based on World Gold Council GRAM framework',
        coefficients: { vix: `+${COEF_VIX}% per point`, dxy: `${COEF_DXY}% per 1%`, real_rate: `${COEF_REAL_RATE}% per 1%`, momentum: `${COEF_MOMENTUM}x of return` },
      },
    });
  } catch (e) {
    sendError(res, e.message);
  }
};

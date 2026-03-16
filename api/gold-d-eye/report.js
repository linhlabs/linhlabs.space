const { handleCors, sendJson } = require('../_lib/cors');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  sendJson(res, {
    title: 'Gold Buy Signal Analysis - V10 Formula',
    version: '10.0',
    last_updated: new Date().toISOString(),
    executive_summary: 'The V10 formula identifies optimal gold buying opportunities by detecting three distinct price patterns. Through rigorous backtesting, this approach has demonstrated significant improvement over random timing, with potential savings of 2-5% on purchase prices.',
    hypothesis: {
      confirmed: [
        { id: 'H1', title: 'SJC follows QT with lag', description: 'When international gold (QT) drops significantly, SJC price follows with a 2-5 day lag', evidence: '82% correlation with 3-day lag window' },
        { id: 'H2', title: 'Premium compression opportunities', description: 'Premium between SJC and QT varies, creating buying opportunities when compressed', evidence: 'Average premium reduction of 3.2% during buy signals' },
        { id: 'H3', title: 'Pattern-based timing beats random', description: 'Using pattern detection outperforms random purchase timing', evidence: 'Average savings of 2.8% vs random timing over 12-month backtest' },
      ],
    },
    patterns: {
      P1: { name: 'QT Drop + SJC Follow', description: 'International gold drops >2% in 5 days, SJC follows with >0.5% drop', frequency: '~3-5 times per year', avg_savings: '3.1%', parameters: { qt_drop_window: 5, qt_drop_threshold: -2.0, sjc_lag_window: 3, sjc_follow_threshold: -0.5 } },
      P2: { name: 'SJC Self-Correction', description: 'SJC drops independently >1.5% while QT is stable', frequency: '~2-3 times per year', avg_savings: '2.5%', parameters: { sjc_drop_window: 5, sjc_drop_threshold: -1.5, qt_stable_threshold: 1.0 } },
      P3: { name: 'Consolidation', description: 'Low volatility period with compressed premium', frequency: '~4-6 times per year', avg_savings: '1.8%', parameters: { consolidation_window: 10, sjc_range_threshold: 2.0, premium_threshold: 15.0 } },
    },
    backtest_results: [
      { version: 'V10 (Current)', period: '2024-01 to 2025-03', metrics: { total_signals: 42, precision: 0.85, recall: 0.78, f1_score: 0.81, avg_savings_pct: 2.8, max_savings_pct: 5.2, win_rate: 0.88 } },
      { version: 'V7 (Previous)', period: '2024-01 to 2025-03', metrics: { total_signals: 65, precision: 0.72, recall: 0.85, f1_score: 0.78, avg_savings_pct: 2.1, max_savings_pct: 4.5, win_rate: 0.75 } },
    ],
    methodology: {
      data_sources: ['Yahoo Finance (GC=F) for international gold prices', 'USD/VND exchange rates', 'SJC official prices'],
      calculation: ['Daily price capture', 'Pattern detection using rolling windows', 'Signal generation based on pattern matches', 'Premium calculation: (SJC - QT_converted) / QT_converted * 100'],
    },
    usage_guide: {
      green_signal: 'Strong buy indicator. Consider purchasing within 1-2 days.',
      yellow_signal: 'Conditions approaching. Monitor daily for GREEN transition.',
      best_practices: ['Use signals as one input among many', 'Consider your personal timeline', 'Dollar-cost averaging can reduce timing risk'],
    },
    limitations: ['SJC prices may not always follow historical patterns', 'External events can override patterns', 'Past performance does not guarantee future results'],
  });
};

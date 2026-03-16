/**
 * Gold Signal Analysis - Macro-based
 * Port of Python gold_signal.py
 */

const THRESHOLDS = {
  vix_low: 15, vix_normal: 20, vix_alert: 25, vix_elevated: 30, vix_fear: 40,
  us10y_very_low: 1, us10y_low: 2, us10y_medium: 3, us10y_high: 4,
  real_rate_negative: 0, real_rate_low: 1, real_rate_medium: 1.5,
  pullback_small: 0.02, pullback_medium: 0.05, pullback_large: 0.08, pullback_extreme: 0.10,
  dxy_low_pct: 30, dxy_high_pct: 70,
  score_buy: 0, score_strong_buy: -2,
};

const DXY_MIN = 106.5;
const DXY_MAX = 130.0;

function calcDxyPercentile(dxy) {
  if (DXY_MAX === DXY_MIN) return 50;
  return ((dxy - DXY_MIN) / (DXY_MAX - DXY_MIN)) * 100;
}

function calcPullback(gold, goldHigh60d) {
  if (!goldHigh60d || goldHigh60d === 0) return 0;
  return (gold / goldHigh60d) - 1;
}

function calcVixScore(vix) {
  const T = THRESHOLDS;
  if (vix > T.vix_fear) return [2, `VIX = ${vix.toFixed(1)} > 40 (Panic zone - Safe haven demand cao)`];
  if (vix > T.vix_elevated) return [0, `VIX = ${vix.toFixed(1)} (Elevated - Lo ngại nhưng chưa panic)`];
  if (vix > T.vix_normal) return [1, `VIX = ${vix.toFixed(1)} (Normal - Thị trường bình thường)`];
  return [0, `VIX = ${vix.toFixed(1)} < 15 (Complacent - Thị trường tự mãn)`];
}

function calcDxyScore(dxy) {
  const pct = calcDxyPercentile(dxy);
  const T = THRESHOLDS;
  if (pct < T.dxy_low_pct) return [2, `DXY ở vùng thấp (${pct.toFixed(0)}%) - Dollar yếu, tốt cho vàng`];
  if (pct < 50) return [1, `DXY ở vùng trung bình thấp (${pct.toFixed(0)}%)`];
  if (pct < T.dxy_high_pct) return [0, `DXY ở vùng trung bình cao (${pct.toFixed(0)}%)`];
  return [-1, `DXY ở vùng cao (${pct.toFixed(0)}%) - Dollar mạnh, áp lực lên vàng`];
}

function calcUs10yScore(us10y) {
  const T = THRESHOLDS;
  if (us10y < T.us10y_very_low) return [2, `US10Y = ${us10y.toFixed(2)}% < 1% (Siêu thấp - Rất tốt cho vàng)`];
  if (us10y < T.us10y_low) return [2, `US10Y = ${us10y.toFixed(2)}% (Thấp - Tốt cho vàng)`];
  if (us10y < T.us10y_medium) return [1, `US10Y = ${us10y.toFixed(2)}% (Trung bình thấp)`];
  if (us10y < T.us10y_high) return [0, `US10Y = ${us10y.toFixed(2)}% (Trung bình cao)`];
  return [-1, `US10Y = ${us10y.toFixed(2)}% > 4% (Cao - Chi phí cơ hội cao)`];
}

function calcRealRateScore(rr) {
  const T = THRESHOLDS;
  if (rr < T.real_rate_negative) return [2, `Real Rate = ${rr.toFixed(2)}% < 0 (Âm - Tiền mất giá, vàng hấp dẫn)`];
  if (rr < T.real_rate_low) return [1, `Real Rate = ${rr.toFixed(2)}% (Thấp - Khá tốt cho vàng)`];
  if (rr < T.real_rate_medium) return [0, `Real Rate = ${rr.toFixed(2)}% (Trung bình)`];
  return [-1, `Real Rate = ${rr.toFixed(2)}% > 1.5% (Cao - Trái phiếu hấp dẫn hơn)`];
}

function analyzeGold({ gold, vix, dxy, us10y, real_rate, gold_high_60d }) {
  const highRef = gold_high_60d || gold;
  const pullback = calcPullback(gold, highRef);

  const [vixScore, vixReason] = calcVixScore(vix);
  const [dxyScore, dxyReason] = calcDxyScore(dxy);
  const [us10yScore, us10yReason] = calcUs10yScore(us10y);
  const [rrScore, rrReason] = calcRealRateScore(real_rate);
  const totalScore = vixScore + dxyScore + us10yScore + rrScore;

  // Check buy conditions
  const conditions = [
    { name: 'Score thấp (Contrarian)', current_value: String(totalScore), target_value: '≤ 0', is_met: totalScore <= 0, priority: 1 },
    { name: 'VIX Fear Zone', current_value: vix.toFixed(1), target_value: '> 40', is_met: vix > 40, priority: 1 },
    { name: 'Pullback từ đỉnh', current_value: `${(pullback * 100).toFixed(1)}%`, target_value: '≤ -5%', is_met: pullback <= -0.05, priority: 2 },
    { name: 'Pullback mạnh', current_value: `${(pullback * 100).toFixed(1)}%`, target_value: '≤ -8%', is_met: pullback <= -0.08, priority: 2 },
    { name: 'Lãi suất thấp', current_value: `${us10y.toFixed(2)}%`, target_value: '< 3%', is_met: us10y < 3, priority: 3 },
  ];

  const metCount = conditions.filter((c) => c.is_met).length;

  let recommendation, confidence;
  if (metCount >= 3 || totalScore <= -2) {
    recommendation = 'BUY';
    confidence = metCount >= 4 ? 'HIGH' : 'MEDIUM';
  } else if (metCount >= 1 || totalScore <= 0) {
    recommendation = 'WAIT';
    confidence = 'MEDIUM';
  } else {
    recommendation = 'HOLD';
    confidence = 'LOW';
  }

  // Score breakdown
  const scoreBreakdown = {
    vix_score: vixScore, vix_reason: vixReason,
    dxy_score: dxyScore, dxy_reason: dxyReason,
    us10y_score: us10yScore, us10y_reason: us10yReason,
    real_rate_score: rrScore, real_rate_reason: rrReason,
    total_score: totalScore, max_score: 8, min_score: -4,
  };

  // Explanation
  let scoreInterpretation;
  if (totalScore >= 5) scoreInterpretation = 'Điểm CAO = Mọi người đang lạc quan về vàng → Return thường ÂM sau đó';
  else if (totalScore >= 1) scoreInterpretation = 'Điểm TRUNG BÌNH = Tín hiệu hỗn hợp';
  else if (totalScore >= -2) scoreInterpretation = 'Điểm THẤP = Đang có áp lực giảm giá → Cơ hội contrarian, return +8% đến +12%';
  else scoreInterpretation = 'Điểm RẤT THẤP = Bi quan cực độ → Thường là đáy! Return +15% đến +19%';

  const explanation = [
    `Giá vàng: $${gold.toLocaleString()}/oz (${(pullback * 100).toFixed(1)}% so với đỉnh 60 ngày)`,
    `Tổng điểm: ${totalScore}/8 - ${scoreInterpretation}`,
    `Đạt: ${metCount}/${conditions.length} điều kiện mua`,
  ].join('\n');

  // Price targets
  const priceTargets = {
    current: gold,
    high_60d: highRef,
    pullback_5pct: highRef * 0.95,
    pullback_8pct: highRef * 0.92,
    pullback_10pct: highRef * 0.90,
  };

  // Chart data
  const chartData = {
    gauges: {
      score: {
        value: totalScore, min: -4, max: 8,
        zones: [
          { from: -4, to: 0, color: 'green', label: 'Mua' },
          { from: 0, to: 4, color: 'yellow', label: 'Chờ' },
          { from: 4, to: 8, color: 'red', label: 'Tránh' },
        ],
      },
      vix: {
        value: vix, min: 0, max: 80,
        zones: [
          { from: 0, to: 15, color: 'green', label: 'Calm' },
          { from: 15, to: 25, color: 'yellow', label: 'Normal' },
          { from: 25, to: 40, color: 'orange', label: 'Elevated' },
          { from: 40, to: 80, color: 'red', label: 'Panic' },
        ],
      },
    },
    indicators: {
      gold: { value: gold, unit: 'USD' },
      vix: { value: vix, unit: '' },
      dxy: { value: dxy, unit: '' },
      us10y: { value: us10y, unit: '%' },
      real_rate: { value: real_rate, unit: '%' },
    },
    score_breakdown: {
      labels: ['VIX', 'DXY', 'US10Y', 'Real Rate'],
      values: [vixScore, dxyScore, us10yScore, rrScore],
      colors: [vixScore, dxyScore, us10yScore, rrScore].map(
        (v) => (v > 0 ? '#4CAF50' : v === 0 ? '#FFC107' : '#F44336')
      ),
    },
    conditions: conditions.map((c) => ({ name: c.name, met: c.is_met })),
  };

  // Action items
  const actionItems = [];
  if (metCount >= 3) actionItems.push('Có thể cân nhắc MUA một phần (30-50% vị thế)');
  else if (metCount >= 1) actionItems.push('Tiếp tục theo dõi, chờ thêm điều kiện đạt');
  else actionItems.push('Chưa phải lúc mua, kiên nhẫn chờ đợi');

  return {
    recommendation,
    confidence,
    score: totalScore,
    score_breakdown: scoreBreakdown,
    conditions_met: metCount,
    total_conditions: conditions.length,
    conditions,
    pullback_pct: pullback * 100,
    explanation,
    action_items: actionItems,
    price_targets: priceTargets,
    chart_data: chartData,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { analyzeGold };

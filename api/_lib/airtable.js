const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const PRICES_TABLE = process.env.AIRTABLE_PRICES_TABLE || 'prices';
const SIGNALS_TABLE = process.env.AIRTABLE_SIGNALS_TABLE || 'signals';
const MACRO_TABLE = process.env.AIRTABLE_MACRO_TABLE || 'macro';

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

const headers = {
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

// Simple in-memory cache
const _cache = {};
const CACHE_TTL = 300000; // 5 min in ms

function getCached(key) {
  const entry = _cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.value;
  return null;
}

function setCache(key, value) {
  _cache[key] = { value, ts: Date.now() };
}

async function fetchAirtable(table, params = {}) {
  const url = new URL(`${BASE_URL}/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
  return res.json();
}

async function getPrices(days = 30) {
  const cacheKey = `prices_${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const allPrices = [];
  let offset = null;

  while (allPrices.length < days) {
    const params = {
      pageSize: '100',
      'sort[0][field]': 'date',
      'sort[0][direction]': 'desc',
    };
    if (offset) params.offset = offset;

    const data = await fetchAirtable(PRICES_TABLE, params);
    for (const record of data.records || []) {
      if (allPrices.length >= days) break;
      const f = record.fields || {};
      allPrices.push({
        date: f.date,
        sjc_price: f.sjc_price || 0,
        qt_price: f.qt_price || 0,
        usd_vnd: f.usd_vnd || 25500,
        premium_pct: f.premium_pct || 0,
        signal: f.signal,
        score: f.score,
        avg_30d: f.avg_30d,
        momentum: f.momentum,
        block_reason: f.block_reason,
        record_id: record.id,
      });
    }
    offset = data.offset;
    if (!offset) break;
  }

  setCache(cacheKey, allPrices);
  return allPrices;
}

async function getGreenPrices(days = 365) {
  const cacheKey = `green_prices_${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const allPrices = [];
  let offset = null;

  while (true) {
    const params = {
      pageSize: '100',
      filterByFormula: "{signal}='GREEN'",
      'sort[0][field]': 'date',
      'sort[0][direction]': 'desc',
    };
    if (offset) params.offset = offset;

    const data = await fetchAirtable(PRICES_TABLE, params);
    for (const record of data.records || []) {
      const f = record.fields || {};
      allPrices.push({
        date: f.date,
        sjc_price: f.sjc_price || 0,
        qt_price: f.qt_price || 0,
        usd_vnd: f.usd_vnd || 25500,
        premium_pct: f.premium_pct || 0,
        signal: 'GREEN',
        score: f.score,
        avg_30d: f.avg_30d,
        momentum: f.momentum,
        record_id: record.id,
      });
    }
    offset = data.offset;
    if (!offset) break;
  }

  setCache(cacheKey, allPrices);
  return allPrices;
}

async function getSignals(days = 365) {
  const cacheKey = `signals_${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const allSignals = [];
  let offset = null;

  while (allSignals.length < days) {
    const params = {
      pageSize: '100',
      'sort[0][field]': 'date',
      'sort[0][direction]': 'desc',
    };
    if (offset) params.offset = offset;

    const data = await fetchAirtable(SIGNALS_TABLE, params);
    for (const record of data.records || []) {
      if (allSignals.length >= days) break;
      const f = record.fields || {};
      allSignals.push({
        date: f.date,
        signal: f.signal || 'RED',
        pattern: f.pattern,
        sjc_price: f.sjc_price || 0,
        qt_price: f.qt_price || 0,
        premium_pct: f.premium_pct || 0,
        score: f.score,
        record_id: record.id,
      });
    }
    offset = data.offset;
    if (!offset) break;
  }

  setCache(cacheKey, allSignals);
  return allSignals;
}

async function getGreenSignals(days = 365) {
  const cacheKey = `green_signals_${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = {
    filterByFormula: "{signal}='GREEN'",
    maxRecords: String(days),
    'sort[0][field]': 'date',
    'sort[0][direction]': 'desc',
  };

  const data = await fetchAirtable(SIGNALS_TABLE, params);
  const signals = (data.records || []).map((record) => {
    const f = record.fields || {};
    return {
      date: f.date,
      signal: 'GREEN',
      pattern: f.pattern,
      sjc_price: f.sjc_price || 0,
      qt_price: f.qt_price || 0,
      premium_pct: f.premium_pct || 0,
      score: f.score,
    };
  });

  setCache(cacheKey, signals);
  return signals;
}

async function getSignalCounts() {
  const signals = await getSignals(365);
  const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const s of signals) {
    const type = s.signal || 'RED';
    if (type in counts) counts[type]++;
  }
  return counts;
}

async function getLatestMacro() {
  const cacheKey = 'macro_latest';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchAirtable(MACRO_TABLE, {
    maxRecords: '1',
    'sort[0][field]': 'timestamp',
    'sort[0][direction]': 'desc',
  });

  if (data.records && data.records.length > 0) {
    const f = data.records[0].fields || {};
    const result = {
      gold: f.gold,
      vix: f.vix,
      dxy: f.dxy,
      us10y: f.us10y,
      real_rate: f.real_rate,
      gold_high_60d: f.gold_high_60d,
      timestamp: f.timestamp,
    };
    setCache(cacheKey, result);
    return result;
  }
  return null;
}

async function getMacroByDate(dateStr) {
  const cacheKey = `macro_date_${dateStr}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchAirtable(MACRO_TABLE, {
    filterByFormula: `SEARCH('${dateStr}', {timestamp})`,
    maxRecords: '1',
    'sort[0][field]': 'timestamp',
    'sort[0][direction]': 'desc',
  });

  if (data.records && data.records.length > 0) {
    const f = data.records[0].fields || {};
    const result = {
      gold: f.gold,
      vix: f.vix,
      dxy: f.dxy,
      us10y: f.us10y,
      real_rate: f.real_rate,
      gold_high_60d: f.gold_high_60d,
      timestamp: f.timestamp,
    };
    setCache(cacheKey, result);
    return result;
  }
  return null;
}

async function getMacroDateList(days = 365) {
  const cacheKey = `macro_dates_${days}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const allDates = new Set();
  let offset = null;

  while (allDates.size < days) {
    const params = {
      pageSize: '100',
      'sort[0][field]': 'timestamp',
      'sort[0][direction]': 'desc',
      'fields[]': 'timestamp',
    };
    if (offset) params.offset = offset;

    const data = await fetchAirtable(MACRO_TABLE, params);
    for (const record of data.records || []) {
      const ts = (record.fields || {}).timestamp || '';
      if (ts) allDates.add(ts.slice(0, 10));
    }
    offset = data.offset;
    if (!offset) break;
  }

  const result = [...allDates].sort().reverse().slice(0, days);
  setCache(cacheKey, result);
  return result;
}

module.exports = {
  getPrices,
  getGreenPrices,
  getSignals,
  getGreenSignals,
  getSignalCounts,
  getLatestMacro,
  getMacroByDate,
  getMacroDateList,
};

import { setTimeout as delay } from 'node:timers/promises';

// Identify the actual client rather than impersonating a browser.
export const userAgent = 'EMIC-public-data/1.0 (+https://cornellemic.com/)';

export async function fetchText(url, accept, { fetchImpl = fetch, wait = delay } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: accept },
        signal: AbortSignal.timeout(25000)
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) return response.text();
    const message = `${new URL(url).hostname} returned HTTP ${response.status}`;
    await response.body?.cancel();
    if (attempt === 2 || (response.status !== 429 && response.status < 500)) throw new Error(message);
    const retryAfter = response.headers.get('retry-after');
    const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 2 ** attempt;
    await wait(Math.min(retrySeconds, 30) * 1000);
  }
}

export function validateSeries(series, now = new Date()) {
  if (series.length < 2) throw new Error('Fewer than two valid daily observations');
  let previous = '';
  for (const point of series) {
    const time = Date.parse(`${point.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(time)
        || new Date(time).toISOString().slice(0, 10) !== point.date
        || point.date <= previous || !Number.isFinite(point.value) || point.value <= 0) {
      throw new Error('Invalid, duplicated, or unordered market observation');
    }
    previous = point.date;
  }
  const age = (now - new Date(`${series.at(-1).date}T00:00:00Z`)) / 86400000;
  if (age < 0 || age > 7) throw new Error('Market history is future-dated or more than seven days old');
  return series;
}

export function parseMarketCsv(csv, now = new Date()) {
  if (/Loading\.{3}|#N\/A|#REF!|#VALUE!/i.test(csv)) throw new Error('Published Google Sheet contains Loading/error cells');
  const series = csv.trim().split(/\r?\n/).slice(1).map(line => {
    const fields = [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
      .map(match => (match[1] ?? match[2] ?? '').replace(/""/g, '"').trim());
    const match = fields[0]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
    // Blank cells are missing values, never zero prices.
    if (!match || !fields[1]) return null;
    const value = Number(fields[1]);
    return Number.isFinite(value) && value > 0
      ? { date: `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`, value }
      : null;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  return validateSeries(series, now);
}

export function parseYahooChart(data, asset, now = new Date()) {
  const result = data.chart?.result?.[0];
  if (data.chart?.error || !result) throw new Error('Yahoo Finance returned no chart');
  if (result.meta?.symbol !== asset.yahooSymbol || result.meta?.currency !== asset.currency) {
    throw new Error('Yahoo Finance symbol or quote currency does not match the requested asset');
  }
  const timeZone = result.meta.exchangeTimezoneName;
  const session = result.meta.currentTradingPeriod?.regular;
  if (!timeZone || !Number.isFinite(session?.start) || !Number.isFinite(session?.end)) {
    throw new Error('Yahoo Finance omitted exchange timezone or trading-session metadata');
  }
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const closes = result.indicators?.quote?.[0]?.close || [];
  const byDate = new Map();
  (result.timestamp || []).forEach((timestamp, index) => {
    const value = closes[index];
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) || value <= 0) return;
    // The final chart point can be today's intraday price. Do not call it a daily close.
    if (timestamp >= session.end || (timestamp >= session.start && now.valueOf() / 1000 < session.end)) return;
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp * 1000)).map(p => [p.type, p.value]));
    byDate.set(`${parts.year}-${parts.month}-${parts.day}`, value);
  });
  return validateSeries([...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)), now);
}

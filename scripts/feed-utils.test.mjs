import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchText, userAgent, parseMarketCsv, parseYahooChart } from './feed-utils.mjs';

const now = new Date('2026-11-14T12:00:00Z');
const asset = { yahooSymbol: 'XC', currency: 'USD' };
const chart = () => ({ chart: { result: [{
  meta: { symbol: 'XC', currency: 'USD', exchangeTimezoneName: 'America/New_York',
    currentTradingPeriod: { regular: { start: Date.parse('2026-11-13T14:30Z') / 1000, end: Date.parse('2026-11-13T21:00Z') / 1000 } } },
  timestamp: ['2026-11-11T14:30Z', '2026-11-12T14:30Z', '2026-11-13T14:30Z'].map(date => Date.parse(date) / 1000),
  indicators: { quote: [{ close: [30, 31, 32] }] }
}] } });

test('HTTP requests identify EMIC, ask for the right representation, and have a deadline', async () => {
  let options;
  const body = await fetchText('https://example.com/feed', 'application/rss+xml', { fetchImpl: async (_, opts) => {
    options = opts;
    return new Response('<rss/>');
  } });
  assert.equal(body, '<rss/>');
  assert.equal(options.headers['User-Agent'], userAgent);
  assert.equal(options.headers.Accept, 'application/rss+xml');
  assert.ok(options.signal instanceof AbortSignal);
});

test('transient HTTP failures retry with a bounded backoff', async () => {
  let calls = 0;
  const waits = [];
  const body = await fetchText('https://example.com/data', 'text/csv', {
    fetchImpl: async () => ++calls < 3 ? new Response('', { status: 503 }) : new Response('data'),
    wait: async ms => waits.push(ms)
  });
  assert.equal(body, 'data');
  assert.deepEqual(waits, [1000, 2000]);
});

test('access denials are surfaced without retrying or circumventing them', async () => {
  let calls = 0;
  await assert.rejects(fetchText('https://example.com/feed', 'application/rss+xml', {
    fetchImpl: async () => { calls++; return new Response('Forbidden', { status: 403 }); }
  }), /HTTP 403/);
  assert.equal(calls, 1);
});

test('Google Sheets Loading responses are rejected, not published as empty snapshots', () => {
  assert.throws(() => parseMarketCsv('XC\r\nLoading...', now), /Loading/);
  assert.throws(() => parseMarketCsv('Date,Close\n11/12/2026,\n11/13/2026,32', now), /two valid/);
});

test('CSV parser retains valid prices but rejects stale, duplicate, and impossible dates', () => {
  assert.deepEqual(parseMarketCsv('Date,Close\n"11/12/2026 16:00:00","31"\n11/13/2026,32', now), [
    { date: '2026-11-12', value: 31 }, { date: '2026-11-13', value: 32 }
  ]);
  assert.throws(() => parseMarketCsv('Date,Close\n10/15/2026,31\n10/16/2026,32', now), /seven days/);
  assert.throws(() => parseMarketCsv('Date,Close\n11/13/2026,31\n11/13/2026,32', now), /duplicated/);
  assert.throws(() => parseMarketCsv('Date,Close\n02/30/2026,31\n11/13/2026,32', now), /Invalid/);
});

test('Yahoo uses unadjusted closes, removes incomplete sessions, and never turns null into zero', () => {
  const data = chart();
  data.chart.result[0].indicators.adjclose = [{ adjclose: [20, 21, 22] }];
  assert.equal(parseYahooChart(data, asset, now).at(-1).value, 32);
  const duringSession = new Date('2026-11-13T18:00:00Z');
  assert.equal(parseYahooChart(data, asset, duringSession).at(-1).date, '2026-11-12');
  data.chart.result[0].indicators.quote[0].close[1] = null;
  assert.deepEqual(parseYahooChart(data, asset, now).map(p => p.value), [30, 32]);
});

test('Yahoo rejects mismatched symbols, currencies, and missing session metadata', () => {
  assert.throws(() => parseYahooChart(chart(), { ...asset, currency: 'MXN' }, now), /currency/);
  assert.throws(() => parseYahooChart(chart(), { ...asset, yahooSymbol: 'ILF' }, now), /symbol/);
  const data = chart();
  delete data.chart.result[0].meta.currentTradingPeriod;
  assert.throws(() => parseYahooChart(data, asset, now), /session/);
});

test('Yahoo appended weekend quotes are excluded from completed daily histories', () => {
  const data = chart();
  data.chart.result[0].timestamp.push(Date.parse('2026-11-14T03:30:00Z') / 1000);
  data.chart.result[0].indicators.quote[0].close.push(99);
  assert.equal(parseYahooChart(data, asset, now).at(-1).value, 32);
  assert.equal(parseYahooChart(data, asset, now).at(-1).date, '2026-11-13');
});

test('FX observation dates use the source timezone, not UTC or the runner timezone', () => {
  const data = chart();
  const result = data.chart.result[0];
  result.meta.exchangeTimezoneName = 'Asia/Kolkata';
  result.timestamp = ['2026-11-10T23:00Z', '2026-11-11T23:00Z', '2026-11-12T23:00Z'].map(t => Date.parse(t) / 1000);
  assert.equal(parseYahooChart(data, asset, now).at(-1).date, '2026-11-13');
});

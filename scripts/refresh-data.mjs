import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchText, parseMarketCsv, parseYahooChart } from './feed-utils.mjs';

const dataDir = process.env.EMIC_DATA_DIR
  ? pathToFileURL(`${resolve(process.env.EMIC_DATA_DIR)}/`)
  : new URL('../data/', import.meta.url);
const substackFeed = 'https://beatingsisyphus.substack.com/feed';
const data360Root = 'https://data360api.worldbank.org/data360/data';
const embiCsv = 'https://raw.githubusercontent.com/mauforonda/credit_ratings/refs/heads/main/data/embi.csv';
const marketPublicationId = '2PACX-1vSbh54AH-bn739vOKMiXQSKff3VM_7I8PFEQN3lNgKuElnbr6NW5hf8dDgW_BTFnENn6qhkHjrVDImr';
const marketPublicationRoot = `https://docs.google.com/spreadsheets/d/e/${marketPublicationId}`;
const marketSheetUrl = `${marketPublicationRoot}/pubhtml`;

const indicators = [
  { id: 'WB_WDI_NY_GDP_MKTP_KD_ZG', name: 'GDP growth', unit: '%' },
  { id: 'WB_WDI_FP_CPI_TOTL_ZG', name: 'Inflation', unit: '%' },
  { id: 'WB_WDI_BX_KLT_DINV_WD_GD_ZS', name: 'FDI inflows', unit: '% GDP' }
];
const areas = [
  { id: 'LMC', name: 'Lower middle income' },
  { id: 'UMC', name: 'Upper middle income' }
];
const marketSheets = [
  { sheet: 'XC', gid: 0, symbol: 'XC', label: 'Emerging Markets ex-SOE', category: 'Equity ETF', currency: 'USD' },
  { sheet: 'ILF', gid: 774533258, symbol: 'ILF', label: 'Latin America 40', category: 'Equity ETF', currency: 'USD' },
  { sheet: 'EEMA', gid: 930096993, symbol: 'EEMA', label: 'Emerging Markets Asia', category: 'Equity ETF', currency: 'USD' },
  { sheet: 'AFK', gid: 188143981, symbol: 'AFK', label: 'Africa', category: 'Equity ETF', currency: 'USD' },
  { sheet: 'DBC', gid: 1126363068, symbol: 'DBC', label: 'Commodity Index', category: 'Commodity ETF', currency: 'USD' },
  { sheet: 'MXN', gid: 204912502, symbol: 'USDMXN', label: 'USD / Mexican peso', category: 'Currency', currency: 'MXN' },
  { sheet: 'CNY', gid: 1222037955, symbol: 'USDCNY', label: 'USD / Chinese yuan', category: 'Currency', currency: 'CNY' },
  { sheet: 'INR', gid: 2144002910, symbol: 'USDINR', label: 'USD / Indian rupee', category: 'Currency', currency: 'INR' }
];

async function fetchJson(url) {
  return JSON.parse(await fetchText(url, 'application/json'));
}

function decodeEntities(value = '') {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match);
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return decodeEntities(match?.[1] || '').trim();
}

function textOnly(html = '') {
  return decodeEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function refreshPosts() {
  const xml = await fetchText(substackFeed, 'application/rss+xml, application/xml, text/xml;q=0.9');
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) throw new Error('Substack response is not an RSS feed');
  const channelHeader = xml.split(/<item>/i)[0];
  const channelImage = tag(tag(channelHeader, 'image'), 'url');
  const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).map((match) => {
    const item = match[1];
    const description = tag(item, 'description');
    const content = tag(item, 'content:encoded') || description;
    const image = content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
      || item.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1]
      || item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1]
      || channelImage
      || '';
    const enclosure = item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']audio\//i)?.[1];
    const date = new Date(tag(item, 'pubDate'));
    return {
      title: textOnly(tag(item, 'title')),
      link: tag(item, 'link'),
      date: Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
      excerpt: textOnly(description).slice(0, 240),
      thumbnail: image,
      isPodcast: Boolean(enclosure)
    };
  }).filter((post) => post.title && /^https?:\/\//.test(post.link));
  if (!posts.length) throw new Error('Substack RSS contained no valid posts');
  await writeFile(new URL('posts.json', dataDir), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: substackFeed, posts }, null, 2)}\n`);
}

async function refreshDevelopment() {
  const year = new Date().getUTCFullYear();
  const items = (await Promise.all(indicators.flatMap((indicator) => areas.map(async (area) => {
      const params = new URLSearchParams({
        DATABASE_ID: 'WB_WDI',
        INDICATOR: indicator.id,
        REF_AREA: area.id,
        timePeriodFrom: String(year - 8),
        timePeriodTo: String(year)
      });
      const data = await fetchJson(`${data360Root}?${params}`);
      const observations = (data.value || []).filter((row) => Number.isFinite(Number(row.OBS_VALUE)));
      observations.sort((a, b) => Number(b.TIME_PERIOD) - Number(a.TIME_PERIOD));
      const latest = observations[0];
      return latest
        ? { label: indicator.name, area: area.name, value: Number(latest.OBS_VALUE), unit: indicator.unit, period: latest.TIME_PERIOD, indicator: indicator.id }
        : null;
    })))).filter(Boolean);
  if (items.length !== indicators.length * areas.length) {
    throw new Error(`World Bank returned ${items.length} of ${indicators.length * areas.length} expected observations`);
  }
  await writeFile(new URL('development.json', dataDir), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: 'World Bank Data360 / WDI', license: 'CC BY 4.0; verify indicator metadata for exceptions', items }, null, 2)}\n`);
}

async function refreshMarkets() {
  const items = [];
  for (const asset of marketSheets) {
    const params = new URLSearchParams({ output: 'csv', single: 'true', gid: String(asset.gid) });
    let source = `${marketPublicationRoot}/pub?${params}`;
    let sourceLabel = 'Google Finance via EMIC Google Sheet';
    let series;
    try {
      series = parseMarketCsv(await fetchText(source, 'text/csv'));
    } catch (error) {
      console.warn(`${asset.sheet}: ${error.message}; trying Yahoo Finance daily history`);
      const yahooSymbol = asset.category === 'Currency' ? `${asset.sheet}=X` : asset.symbol;
      source = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=3mo&interval=1d`;
      sourceLabel = 'Yahoo Finance';
      series = parseYahooChart(await fetchJson(source), { ...asset, yahooSymbol });
    }
    const latest = series.at(-1);
    const previous = series.at(-2);
    const changePercent = ((latest.value - previous.value) / previous.value) * 100;
    items.push({
      ...asset,
      price: latest.value,
      changePercent: Math.round(changePercent * 100) / 100,
      timestamp: latest.date,
      source,
      sourceLabel,
      series
    });
  }
  const providers = [...new Set(items.map(item => item.sourceLabel))];
  // Write only after every asset validates. Never splice different providers into one history.
  await writeFile(new URL('market.json', dataDir), `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: providers.length === 1 && providers[0] === 'Yahoo Finance' ? 'https://finance.yahoo.com/' : marketSheetUrl,
    sourceLabel: providers.join(' / '),
    delayed: true,
    items
  }, null, 2)}\n`);
}

async function refreshCredit() {
  const csv = await fetchText(embiCsv, 'text/csv, text/plain;q=0.9');
  const rows = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, region, rawValue] = line.split(',');
    const value = Number(rawValue);
    return { date, region, value };
  }).filter((row) => row.date && row.region && Number.isFinite(row.value));

  const included = new Set(['LATINO', 'Argentina', 'Brasil', 'Colombia', 'Ecuador', 'México', 'Perú', 'Venezuela']);
  const labels = { LATINO: 'EMBI Latin America', Brasil: 'EMBI Brazil', México: 'EMBI Mexico', Perú: 'EMBI Peru' };
  const grouped = new Map();
  rows.forEach((row) => {
    if (!included.has(row.region)) return;
    if (!grouped.has(row.region)) grouped.set(row.region, []);
    grouped.get(row.region).push(row);
  });
  const items = [...grouped.entries()].map(([region, observations]) => {
    observations.sort((a, b) => a.date.localeCompare(b.date));
    const series = observations.map((observation) => ({
      date: observation.date,
      value: Math.round(observation.value * 10000) / 100
    }));
    const latest = observations.at(-1);
    const previous = observations.at(-2);
    const spreadBps = Math.round(latest.value * 10000) / 100;
    return {
      label: labels[region] || `EMBI ${region}`,
      region,
      date: latest.date,
      spreadBps,
      changeBps: previous ? Math.round((latest.value - previous.value) * 10000) / 100 : null,
      series
    };
  }).sort((a, b) => (a.region === 'LATINO' ? -1 : b.region === 'LATINO' ? 1 : a.region.localeCompare(b.region)));

  await writeFile(new URL('credit.json', dataDir), `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: embiCsv,
    upstreamSource: 'https://bcrdgdcprod.blob.core.windows.net/documents/entorno-internacional/documents/Serie_Historica_Spread_del_EMBI.xlsx',
    publisher: 'Central Bank of the Dominican Republic',
    unit: 'basis points over U.S. Treasuries',
    items
  }, null, 2)}\n`);
}

await mkdir(dataDir, { recursive: true });
if (process.argv.includes('--market-only')) {
  await refreshMarkets();
} else if (process.argv.includes('--posts-only')) {
  await refreshPosts();
} else {
  const refreshes = [
    ['publication', refreshPosts],
    ['development', refreshDevelopment],
    ['market', refreshMarkets],
    ['credit', refreshCredit]
  ];
  const results = await Promise.allSettled(refreshes.map(([, refresh]) => refresh()));
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.warn(`${refreshes[index][0]} refresh failed; retaining its stored snapshot: ${result.reason?.message || result.reason}`);
  });
  if (results.every((result) => result.status === 'rejected')) {
    throw new Error('All public data refreshes failed');
  }
}

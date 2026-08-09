import { mkdir, readFile, writeFile } from 'node:fs/promises';

const dataDir = new URL('../data/', import.meta.url);
const substackFeed = 'https://beatingsisyphus.substack.com/feed';
const data360Root = 'https://data360api.worldbank.org/data360/data';
const embiCsv = 'https://raw.githubusercontent.com/mauforonda/credit_ratings/refs/heads/main/data/embi.csv';

const indicators = [
  { id: 'WB_WDI_NY_GDP_MKTP_KD_ZG', name: 'GDP growth', unit: '%' },
  { id: 'WB_WDI_FP_CPI_TOTL_ZG', name: 'Inflation', unit: '%' },
  { id: 'WB_WDI_BX_KLT_DINV_WD_GD_ZS', name: 'FDI inflows', unit: '% GDP' }
];
const areas = [
  { id: 'LMC', name: 'Lower middle income' },
  { id: 'UMC', name: 'Upper middle income' }
];
const marketSymbols = [
  { symbol: 'EEM', label: 'Emerging markets ETF' },
  { symbol: 'VWO', label: 'Vanguard EM ETF' },
  { symbol: 'INDA', label: 'India ETF' },
  { symbol: 'EWZ', label: 'Brazil ETF' },
  { symbol: 'MCHI', label: 'China ETF' }
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
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
  const response = await fetch(substackFeed);
  if (!response.ok) throw new Error(`Substack returned ${response.status}`);
  const xml = await response.text();
  const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).map((match) => {
    const item = match[1];
    const description = tag(item, 'description');
    const content = tag(item, 'content:encoded') || description;
    const image = content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
      || item.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1]
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
  await writeFile(new URL('posts.json', dataDir), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: substackFeed, posts }, null, 2)}\n`);
}

async function refreshDevelopment() {
  const year = new Date().getUTCFullYear();
  const items = [];
  for (const indicator of indicators) {
    for (const area of areas) {
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
      if (latest) items.push({ label: indicator.name, area: area.name, value: Number(latest.OBS_VALUE), unit: indicator.unit, period: latest.TIME_PERIOD, indicator: indicator.id });
    }
  }
  await writeFile(new URL('development.json', dataDir), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: 'World Bank Data360 / WDI', license: 'CC BY 4.0; verify indicator metadata for exceptions', items }, null, 2)}\n`);
}

async function refreshMarkets() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    console.log('TWELVE_DATA_API_KEY is not configured; retaining the current market snapshot.');
    return;
  }
  const items = [];
  for (const asset of marketSymbols) {
    const params = new URLSearchParams({ symbol: asset.symbol, apikey: key });
    const quote = await fetchJson(`https://api.twelvedata.com/quote?${params}`);
    const price = Number(quote.close);
    const changePercent = Number(quote.percent_change);
    if (Number.isFinite(price)) items.push({ ...asset, price, changePercent: Number.isFinite(changePercent) ? changePercent : null, timestamp: quote.datetime || null });
  }
  await writeFile(new URL('market.json', dataDir), `${JSON.stringify({ updatedAt: new Date().toISOString(), source: 'Twelve Data', delayed: true, items }, null, 2)}\n`);
}

async function refreshCredit() {
  const response = await fetch(embiCsv);
  if (!response.ok) throw new Error(`EMBI dataset returned ${response.status}`);
  const rows = (await response.text()).trim().split(/\r?\n/).slice(1).map((line) => {
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
    observations.sort((a, b) => b.date.localeCompare(a.date));
    const latest = observations[0];
    const previous = observations[1];
    const spreadBps = Math.round(latest.value * 10000) / 100;
    return {
      label: labels[region] || `EMBI ${region}`,
      region,
      date: latest.date,
      spreadBps,
      changeBps: previous ? Math.round((latest.value - previous.value) * 10000) / 100 : null
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
await Promise.all([refreshPosts(), refreshDevelopment(), refreshMarkets(), refreshCredit()]);

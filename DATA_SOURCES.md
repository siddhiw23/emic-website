# EMIC public data feeds

The website reads versioned JSON snapshots from `data/`. Browsers never call a
credentialed third-party API directly.

## Automated sources

- `data/posts.json`: recent public posts from the Beating Sisyphus Substack RSS
  feed.
- `data/development.json`: selected World Development Indicators from the World
  Bank Data360 API. The current pulse compares lower-middle-income and
  upper-middle-income economies on GDP growth, inflation, and foreign direct
  investment inflows.
- `data/market.json`: delayed ETF and currency histories read from EMIC's
  published Google Sheet CSV endpoints, with Yahoo Finance daily histories as
  a fallback when a sheet is unavailable, invalid, or stale.
- `data/credit.json`: latest Latin American EMBI sovereign spreads and their
  daily changes, converted from percentage-point values to basis points.

The `Refresh public data` GitHub Actions workflow updates these files every six
hours and can also be run manually.

## Market quotes

The market adapter reads only the sheet's published-web identifier and public
CSV tab endpoints. It does not use or expose the editable spreadsheet URL or a
Google account identity. The observations are labeled as delayed rather than
real-time exchange data.

Google's published CSV can return HTTP 200 with only `Loading...`. This is a
source failure, not an empty price history. In that case the adapter requests
three months of daily history from Yahoo Finance's public chart endpoint for
the same symbol. Currency mappings are USDMXN → MXN=X, USDCNY → CNY=X, and
USDINR → INR=X; the expected quote currency is checked before accepting data.
This public endpoint has no guaranteed service contract, so failures retain
the last complete snapshot rather than substituting unverified observations.

Each asset records its exact `source` URL and `sourceLabel`; the dashboard
displays the provider and last observation date. A fallback replaces the whole
asset history, never appending one provider's prices to another's. The adapter
uses unadjusted closes, omits null/nonpositive prices, derives dates in the
exchange timezone, and excludes unfinished trading sessions and quotes
appended beyond the reported trading session. At least two observations are
required, with no duplicate dates and a last observation at most seven calendar
days old. The snapshot is written only after all eight assets pass validation.

## Refresh reliability

Requests identify themselves as `EMIC-public-data/1.0 (+https://cornellemic.com/)`
and request an appropriate content type. This restores access to the public
Substack RSS feed without impersonating a browser. Each request times out after
25 seconds; network errors, HTTP 429, and HTTP 5xx retry up to three times.
Access denials such as HTTP 403 are reported without repeated retries. An HTML
error page or empty RSS response cannot overwrite the publication snapshot.

Both Pages workflows serialize deployment jobs through the same `pages`
concurrency group. Failed deployments retry after 10 and 30 seconds to tolerate
temporary artifact-discovery failures. A failed final attempt still marks the
workflow as failed; successful retries provide the deployment URL.

Run regression checks with `node --test scripts/feed-utils.test.mjs`. To test
live sources without replacing the site's snapshots, use
`EMIC_DATA_DIR=/private/tmp/emic-feed-validation node scripts/refresh-data.mjs`.
`--posts-only` and `--market-only` limit a run to the corresponding feed.

## Attribution and review

World Bank Data360 material is generally available under CC BY 4.0, but the
metadata for each selected indicator should be reviewed for third-party
exceptions before production publication. Preserve source attribution in the
site or accompanying methodology page.

The EMBI CSV is the machine-readable mirror used for automation. Its upstream
source is the Central Bank of the Dominican Republic's `Serie_Historica_Spread_del_EMBI.xlsx`
workbook. Preserve both the central-bank attribution and the mirror URL in the
published methodology.

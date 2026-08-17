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
  published Google Sheet CSV endpoints.
- `data/credit.json`: latest Latin American EMBI sovereign spreads and their
  daily changes, converted from percentage-point values to basis points.

The `Refresh public data` GitHub Actions workflow updates these files every six
hours and can also be run manually.

## Market quotes

The market adapter reads only the sheet's published-web identifier and public
CSV tab endpoints. It does not use or expose the editable spreadsheet URL or a
Google account identity. The observations are labeled as delayed rather than
real-time exchange data.

## Attribution and review

World Bank Data360 material is generally available under CC BY 4.0, but the
metadata for each selected indicator should be reviewed for third-party
exceptions before production publication. Preserve source attribution in the
site or accompanying methodology page.

The EMBI CSV is the machine-readable mirror used for automation. Its upstream
source is the Central Bank of the Dominican Republic's `Serie_Historica_Spread_del_EMBI.xlsx`
workbook. Preserve both the central-bank attribution and the mirror URL in the
published methodology.

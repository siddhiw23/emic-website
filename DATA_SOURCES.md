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
- `data/market.json`: a delayed ETF snapshot. This remains empty until a market
  data provider is configured.
- `data/credit.json`: latest Latin American EMBI sovereign spreads and their
  daily changes, converted from percentage-point values to basis points.

The `Refresh public data` GitHub Actions workflow updates these files every six
hours and can also be run manually.

## Optional market quotes

The current adapter supports Twelve Data. Add a repository Actions secret named
`TWELVE_DATA_API_KEY` only after confirming that the selected plan permits the
intended public display. The key is used by GitHub Actions and is never included
in the published site.

The configured symbols are EEM, VWO, INDA, EWZ, and MCHI. They are labeled as a
delayed snapshot rather than real-time exchange data.

## Attribution and review

World Bank Data360 material is generally available under CC BY 4.0, but the
metadata for each selected indicator should be reviewed for third-party
exceptions before production publication. Preserve source attribution in the
site or accompanying methodology page.

The current EMBI CSV is maintained in a third-party GitHub repository that does
not state a license or primary-source methodology. It is suitable for internal
testing, but its provenance and redistribution permission must be confirmed
before production publication.

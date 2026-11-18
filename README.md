# BC Place Names Explorer

A browser tool for exploring the names of peaks, creeks, parks and communities in British Columbia. Search the provincial record by name or around a chosen point, distinguish official from other recorded names, inspect naming decisions, and follow the original record for historical notes.

**Use in browser:** https://coolcode.ca/bcplacenames/

## What it does

- Live name search, optional similar spellings, feature-group filters and official/other-recorded name searches.
- Nearby search from a map click, typed coordinates or an explicitly requested device location (1, 5, 10 or 25 km).
- Paginated results, coloured map markers, name details, naming decision dates and links to other name records for the same feature when supplied.
- Share a selected record with `#name=9757`; export the visible page as CSV or GeoJSON.
- Source links for historical narratives and pronunciation. These are not invented or inferred from the name.

The nearby endpoint has no documented official-status parameter: status is applied **to the current page**, and the UI says so. Pagination retains the underlying service total. Name searches apply status on the server. Distances are straight-line distances to reference points. A creek point may be its mouth, a municipal point its hall. These are not boundaries or navigation directions. Rescinded names do not establish abandonment; naming decision dates do not establish founding dates.

This complements [Names That Time Forgot](https://coolcode.ca/namesforget/), which uses a national snapshot of current official names. This tool queries BC's live service and includes other recorded names. Photo GPS extraction is not part of this first version.

## Run locally

Use Python 3.12+ and Node 24+ for the build and tests. The deployed application needs only a modern browser and internet access.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open http://localhost:8000/. No PHP, database, npm install, Netlify or API key is required. App files live in `web/`; `dist/` is generated and must not be committed.

CI installs the test-only requirements in `tests/browser-requirements.txt` and Chromium, then runs `python3 tests/browser_smoke.py`. Those checks mock the API with representative responses so upstream outages do not block a valid app deployment. They cover pagination, shared links, exports, failure/empty states, safe text rendering and mobile layout. Live API behavior should also be checked when changing integration code.

## Publish and register

In this repository, set **Settings → Pages → Source → GitHub Actions**. Successful `main` builds deploy; PRs only check/build and save a preview artifact. Keep paths relative. Do not add a CNAME: the account site supplies the CoolCode domain.

After verifying the live tool, copy `tool.json` into the main site's `data/tools.json`. The main site links here and does not rebuild this application.

## Sources, attribution and limits

- Data: [BC Geographical Names Office](https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/historic-places/geographical-names), Province of British Columbia; [official API specification](https://github.com/bcgov/api-specs/blob/master/bcgnws/bcgnws.json). Crown copyright/source terms apply to government data. This project does not assert an open licence over source records.
- API: `https://apps.gov.bc.ca/pub/bcgnws/`. Queries explicitly request `outputSRS=4326`; the parser rejects other declared systems rather than plotting Albers metres as degrees. Single-record responses use `feature`, whereas searches use `features`.
- Narrative origin notes and audio are linked on the official record, not scraped or republished. Preserve the original source attribution when quoting those records. Some historical records contain outdated or offensive terminology.
- Map: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Standard tiles follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, normal browser caching, no prefetch or offline tile downloads.
- Mapping library: locally vendored Leaflet **1.9.4**, BSD-2-Clause licence in `web/vendor/LICENSE`. Its runtime JS and CSS come from the versioned official npm distribution. No map library CDN is contacted by visitors.

The service may be unavailable or change its response schema. Searches happen on submission, with timeouts, cancellation and a bounded five-minute in-memory response cache. No scheduled bulk harvesting is performed. Exports contain only the currently displayed page; a successful HTTP response is not a guarantee that the government record is complete or current.

## Privacy

The BC service receives your submitted name or coordinates. OpenStreetMap receives tile requests for the area you view. Device location is requested only after **Use my location**, and is sent to BC only after you press **Explore names**. There are no accounts, analytics, cookies or persistent app storage. Nothing uploads photographs. Shared links contain a name-record ID, not the search coordinates. Exported files are generated locally.

For problems with this independent explorer, [open an issue](https://github.com/jsdyer/bcplacenames/issues). For corrections to name records, use the BC Geographical Names Office's contact information.

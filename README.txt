MAPLE JOURNAL — MapleStory Classic grind journal

Open dist/index.html directly, or run node preview.cjs and visit http://127.0.0.1:4173.
No installation or build is needed. Calculations work offline; Google Fonts fall back to system fonts.
The header slider remembers light/dark mode, including sun/moon icons.

TRACK A RUN
1. Optionally enter map, class/job, and level. Starting EXP is within-level EXP when a level is provided.
2. Enter starting EXP, mesos, supplies, quantities, and editable unit prices. Start the timer. The initial HP/MP defaults are Meat (80 mesos) and Lemon (150 mesos). New sessions remember the last selected HP/MP items and unit prices in this browser, including after refresh; session quantities and balances reset. Saved choices take precedence over these initial defaults.
3. Pause/resume for breaks. Optional checkpoints record snapshots for the final pace review.
4. Done stops active time, including when paused. Enter ending values and ending level if supplied at the start.
5. Adjust cumulative supply additions. Without level metadata, the manual extra-EXP field supports legacy sessions.
6. Optionally add unsold loot estimates or income/expenses not already in your entered balance. Calculate.
7. The run saves to history automatically. Editing ending values updates the same record.

INSIGHTS
Rates per hour, 10 minutes, and minute; automatic EXP across levels; target-level ETA; 30/60-minute projections; HP/MP usage per minute; supply cost/hour and remaining training time; 10-active-minute checkpoint reminder; interval pace chart; saved session review; class/starting-level filters; time-weighted map averages; EXP-versus-profit chart; JSON backup/restore; CSV export.

FORMULAS
Original net = ending mesos - starting mesos - HP used * HP cost - MP used * MP cost.
Adjusted cash net = original net + income not in balance - expenses not in balance.
Estimated total net = adjusted cash net + estimated unsold loot.
Used = starting + cumulative additions - ending quantity.
Automatic EXP = ending cumulative level/EXP position - starting position.
Legacy EXP = ending EXP - starting EXP + manual EXP requirements of levels completed.
Rate = gain * target duration / active duration. Breaks and ending-value entry are excluded.

Buy supplies before starting. In-run purchases already reduce the meso balance and can be counted twice by the requested original formula. Do not also enter sales/expenses in the ledger if reflected in your ending balance. Count mixed HP/MP recovery items in one slot only.

DATA SOURCES (checked October 20, 2026)
https://meowdb.com/msclassic/npc-shops — editable NPC supply prices, including Meat 80 and Lemon 150 mesos.
https://meowdb.com/msclassic/formulas/leveling — Classic EXP formulas for requirements from levels 1–99, with level 100 as the table endpoint.

STORAGE
History, the active draft/checkpoints, and theme stay in this browser. The hosted site, localhost, and local-file copy use separate origin storage. No game/account connection or server-side history storage is used. Back up important runs with JSON. Restore merges matching session IDs and keeps other records. Filters do not limit exports. Comparisons do not normalize party size, gear, buffs, or map changes during a run.

FILES
FEATURES.txt: internal feature list and calculation contract.
TODO.txt: internal implementation checklist.
VERIFICATION.txt: tests and verification limits.
build-download.cjs: regenerate the standalone HTML. Maintainer documents and this README stay in the source repository and are excluded from the website and end-user downloads.

CHECKS
node test.cjs
node build-download.cjs

Rate regression fixtures: node test-rates.cjs runs fixed starting/ending timestamps, balances, supply counts/prices and ETC quantities against hand-calculated expected totals and all three rate periods. It also verifies pause exclusion, fractional timing, JSON/history restoration, map comparisons and display rounding. The same fixtures run automatically in node test.cjs and GitHub Actions.

Screenshot handoff regression: node test-screenshot-transfer.cjs runs the actual screenshot review submit handler and app controller in a minimal DOM test double. It checks reviewed values through starting/ending forms, timed training, saved drafts and rendered rates, including zero values, unchecked fields and item/price isolation. This tests the transfer after recognition; image recognition accuracy remains covered separately by OCR fixtures and manual screenshot checks.

Layout: timer and inputs use one aligned stack. Current-session results, forecasts, supply insights, and checkpoint trends appear only after Done, ending values, and Calculate. Editing or starting a new session hides that review again. Prior completed sessions stay available in history; an empty map-comparison panel is hidden.

Navigation: Session tracker contains the current timer, forms, and completed-session review. History & comparison is a separate tab containing saved runs, review details, filters, backups, and map comparisons. Switching tabs preserves the tracker draft and does not pause a running session. The selected tab is retained in the URL fragment across refresh.

ETC DROPS
After Done, search the local ETC catalog by name, select an icon/name/price result, and enter the number of individual items gained (not the number of stacks). Repeated additions of the same item and sale status merge. Quantities and sale status remain editable.
Unsold drops add quantity × NPC vendor price to estimated total net. Drops sold after recording the ending balance add to adjusted cash net instead. Exclude drops already reflected in the ending mesos to avoid counting them twice. The review defaults to total net with loot when unsold drops exist; Profit shown switches the main total and all three meso rates between the original formula, adjusted cash, and loot-inclusive total. Projections and checkpoint trends continue to use original net as labeled.
ETC quantity, unit-price snapshots, sale status, and names survive session edits, refresh, saved reviews, JSON backups/restores, and CSV summaries. Existing saved sessions remain compatible.

LOCAL ETC DATA
dist/data/etc-items.json: canonical catalog of 331 priced non-Ossyria Classic ETC items, checked October 20, 2026. Each entry stores MeowDB ID, name, NPC sell-back price, local icon, and source link. The source returned 335 items; four lacked an explicit price and are listed in excludedItemIds. Explicit zero prices are retained. Source: https://meowdb.com/msclassic/item-db/etc
dist/assets/etc/: 331 local PNG icons. dist/etc-data.js: generated offline catalog script, allowing dist/index.html to open directly without a fetch.
refresh-etc-catalog.cjs: manual MeowDB catalog/icon refresh. Run node refresh-etc-catalog.cjs then node build-download.cjs. build-catalog.cjs validates the canonical JSON and icons and generates the runtime script; build-download.cjs also embeds catalog and icons into the standalone HTML. Existing session prices are snapshots and do not change after catalog refresh. No scraping or remote icon requests run in the end-user app.

AWS CUSTOM DOMAIN DEPLOYMENT
The GitHub Actions workflow .github/workflows/deploy-aws.yml tests/builds pull requests and deploys master to https://grindjournal.com once AWS is configured. See AWS-SETUP.txt for one-time Route 53/CloudFormation setup and the four repository Actions variables. infra/aws-static-site.json creates private S3/CloudFront/HTTPS/DNS and a scoped GitHub OIDC role. No AWS access-key secrets are used. Build locally with node scripts/build-site.cjs; generated site-build/ is excluded from Git and contains only publishable assets.

SCREENSHOT IMPORT
Use Fill from screenshot in the starting or ending form. A capture guide uses the supplied MapleStory screenshot with labeled HUD areas. Choose a PNG/JPG/WebP up to 15 MB (24 megapixels maximum), or try the example. Read regions are normalized to screenshot dimensions and can be redrawn, adjusted by percentage, and remembered locally for another HUD layout. The EXP crop should contain the EXP number without its percentage.
Read screenshot uses a local Classic quantity-font matcher for HP/MP counts and Tesseract.js for other fields, with field-specific color/grayscale treatments. Review every proposal, correct values, and choose which fields to apply. Applying fills inputs only; it never starts/stops the timer or completes a calculation. Map/class are imported at setup; ending screenshots update only ending level/EXP/mesos/supply counts. Existing sessions without starting levels keep the legacy manual level-up adjustment.
Detected HP/MP counts are filled and checked automatically, including single-digit counts and best proposals when treatments disagree. Choose the matching item and apply once. Tiny pixel-font digits can be misread; numbers remain editable, disagreements are flagged, and missing readings stay blank. Enlarge the crop to correct a count if needed. Select the actual item at setup and include other stacks manually. The program does not infer potion identities from icon colors. Ending imports preserve the session's selected supply types. ETC stays manual.
Your selected image and recognition text remain in memory while the dialog is open and are released when it closes. Screenshots are never uploaded to S3 or any OCR service and are not added to session JSON/backups. Only reviewed form values are saved. Remembered regions and image settings store coordinates and filter values only, separately in browser localStorage. The public capture-guide image is the provided example; it is not a user's uploaded screenshot.

OCR RUNTIME
dist/vendor/ocr contains pinned Tesseract.js 7.0.0, three LSTM core variants, English data, and licenses/notices. Runtime scripts/models load on demand from this site's own origin. No API keys or new AWS environment variables are needed. node scripts/refresh-ocr-assets.cjs --verify checks asset hashes without network; omit --verify to refresh from the pinned npm archives after intentionally updating the lock. dist/vendor/ocr/** is excluded from Git line-ending conversion to preserve checksums on Windows/Linux.
The standalone HTML embeds the guide image, OCR library/worker, universal baseline WASM core, English data, and third-party notices. The regular dist/index.html OCR reader needs HTTPS or localhost; use node preview.cjs when serving the downloaded folder. Manual input remains available if a browser cannot run Web Workers/WebAssembly.

OCR IMAGE ADJUSTMENTS
Select a read region, then open Improve a difficult read. Compare the original enlarged crop with the processed preview. Choose white text, neutral white text (removes color using color tolerance), dark text, gold/orange, or grayscale. Contrast, brightness, threshold, enlargement (2–6x), and inversion update the preview on this device. Grayscale does not use threshold; only the neutral filter uses color tolerance. Enlargement is capped for unusually large regions to limit canvas memory.
Re-read selected field uses that exact processed preview with several line/word segmentation modes. It replaces only that field's proposal and preserves other reviewed values and supply choices. Conflicting valid readings appear as selectable alternatives; neither an alternative nor OCR confidence guarantees correctness. Adjusting a field's crop/image settings unchecks its old proposal until reread or edited. Standard Read screenshot keeps the original automatic treatments for untouched fields and uses your adjusted image settings for fields you customized.
Remember regions & image settings stores coordinates and filter values locally; it does not save screenshot pixels. Reset this field's image settings clears one field's tuning, and Reset example settings clears remembered regions and tuning. HP/MP default to Classic potion digits, which matches the original colored crop against the game's ten quantity sprites instead of general OCR. The example now reads 441/761. Sliders are hidden in this mode because matching needs the original outline and blue shading. Use Count recognition > General text OCR for other fonts. An ambiguous/unsupported match stays blank; it never falls back to a misleading Tesseract count. Keep the complete number in the region, with a little space at each edge. Other screenshots/resolutions still require review.
Preprocessing and segmentation guidance: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html and https://github.com/naptha/tesseract.js/blob/master/docs/api.md

POTION ICON PICKERS
All 13 named HP/MP supplies have local MeowDB Classic PNGs, including food items. dist/data/potion-icons.json records exact-name matches, supply keys/categories, database IDs, icon keys, and source URLs. dist/potion-data.js is generated for buildless/file-based use. Custom items use a generic marker.
Accessible image dropdowns show each item's icon, name, and preset cost in setup and screenshot review. Arrow keys, Home/End, Enter/Space, type-ahead, Escape, and Tab are supported. The original select values remain the input contract for persistence, OCR application, and calculations. Pickers lock during an active session and ending screenshots retain the recorded supplies. OCR picker controllers are disposed with their rows so discarded recognition text is not retained.
Refresh with node refresh-potion-icons.cjs, then node scripts/build-site.cjs (or node build-download.cjs). The scraper verifies exact English Use item names and downloads small PNGs; it never updates prices. build-potions.cjs validates complete coverage and generates potion-data.js. The standalone HTML embeds all potion icons; hosted browsers use only local icon paths. No runtime MeowDB scrape or API request is needed.

CLASSIC QUANTITY FONT
Ten ItemNo glyphs from the public MapleStory.io GMS/83 API are stored in dist/assets/quantity-font/, with source URLs and hashes in dist/data/quantity-font.json. Run node refresh-quantity-font.cjs for an intentional refresh. build-quantity-font.cjs verifies the assets and generates dist/quantity-font.js; build-download.cjs invokes it automatically. dist/quantity-reader.js performs bounded color/outline template matching in a cancellable local Worker. Both the dataset and Worker source are embedded in the standalone download; selected-count rereads do not load Tesseract or contact any service. The matcher does not identify potion icons or count additional stacks.

OCR MAP MATCHING
The training-map reader compares every OCR pass against a local snapshot of MeowDB Classic's 424 named English map records (429 source rows; five unnamed numeric placeholders excluded) (https://meowdb.com/msclassic/maps). It ranks map names with edit/transposition similarity and street context, preserves numbered map suffixes, and deduplicates identical display labels. Up to two real catalog names are offered; a weak or close match is unchecked until chosen. Unrelated text produces no match. Similarity cannot guarantee the true location is among two suggestions.
Search the map input for another catalog entry. Screenshot import accepts only a resolved catalog name, stored as Street · Map; arbitrary OCR text is preserved in Recognized text, never silently applied as a map. Manual tracker entry and existing history remain compatible with custom names. No historical sessions are renamed.
The checked-in catalog is dist/data/maps.json; build-maps.cjs generates dist/map-data.js. Run node refresh-map-catalog.cjs to intentionally refresh from the public rendered map index; it parses JSON data without executing source scripts and fails if the source format changes. Matching, search, and standalone imports work offline; no screenshot or OCR text is sent to MeowDB. No new keys or AWS variables are needed.

BROWSER SCREEN CAPTURE
Fill from screenshot now offers Upload screenshot and Capture screen in both starting and ending imports. Capture screen calls getDisplayMedia from the button click and opens the browser-owned chooser. Select the MapleStory game window; the app takes one PNG frame, stops every media track, and loads it into the same adjustable-region OCR review. It requests no audio and performs no recording or transmission. Check the regions and click Read screenshot, then apply reviewed values as before.
The browser must ask you to select a source each time. Desktop browser support and HTTPS/localhost are required; embedded browsers and file: pages may block capture or fail to show their picker. Open grindjournal.com in desktop Chrome/Edge or use Upload screenshot if needed. Canceling or denying capture preserves the previous screenshot/review. Closing the import or canceling while permission is pending discards the request and stops any stream granted later; the browser picker may need to be dismissed separately.
Snapshots use the existing limits (320 x 200 minimum, 24 megapixels, 15 MB PNG), remain in memory, and are released on dialog close. Oversized frames, encoding failures, and stopped sources keep the previous image/review. The new module is dist/screen-capture.js and is embedded in the standalone download. No new dependencies, API keys, or AWS variables. API reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

Level OCR defaults: White text · remove color, contrast 3x, brightness 80, threshold 115, color tolerance 255. The existing 4x text enlargement remains. Both whole-screenshot reads and selected-field rereads use this preset for untouched level settings; saved per-field choices take precedence. Reset this field’s image settings returns the selected level field to these defaults. Other fields retain their defaults.

Mesos OCR defaults: Dark text, contrast 0.5x, brightness 5, threshold 145, invert colors on. Full screenshot reads and selected-field rereads use this preset unless saved per-field settings override it. Explicit saved inversion-off values are retained. Other field defaults stay unchanged.

Map OCR defaults: White text · remove color, contrast 1.6x, brightness 10, threshold 30, color tolerance 35, inversion on. Class OCR defaults: Grayscale, contrast 2.5x, brightness -5, inversion on. Both whole-screenshot reads and selected-field rereads use these presets; saved field-specific settings override them. Grayscale does not use threshold/color tolerance. Existing 4x text enlargement stays unchanged.

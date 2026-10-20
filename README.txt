MAPLE JOURNAL — MapleStory Classic grind journal

Open dist/index.html directly, or run node preview.cjs and visit http://127.0.0.1:4173.
No installation or build is needed. Calculations work offline; Google Fonts fall back to system fonts.
The header slider remembers light/dark mode, including sun/moon icons.

TRACK A RUN
1. Optionally enter map, class/job, and level. Starting EXP is within-level EXP when a level is provided.
2. Enter starting EXP, mesos, supplies, quantities, and editable unit prices. Start the timer.
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

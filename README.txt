MAPLE JOURNAL — MapleStory Classic grind journal

Open dist/index.html directly, or run node preview.cjs and visit http://127.0.0.1:4173.
No installation or build is needed. Calculations work offline; Google Fonts fall back to system fonts.
The header slider remembers light/dark mode, including sun/moon icons.

TRACK A RUN
1. Optionally enter map, class/job, and level. Starting EXP is within-level EXP when a level is provided.
2. Enter starting EXP, mesos, supplies, quantities, and editable unit prices. Start the timer.
3. Pause/resume for breaks. Optional checkpoints show current pace, supply runway, and leveling estimates.
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
FEATURES.txt: feature list and calculation contract.
TODO.txt: implementation checklist.
VERIFICATION.txt: tests and verification limits.
build-download.cjs: regenerate standalone HTML and hosted feature/TODO downloads.

CHECKS
node test.cjs
node build-download.cjs

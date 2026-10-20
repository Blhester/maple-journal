MAPLE JOURNAL — MapleStory Classic calculator

Open dist/index.html directly in a browser, or run node preview.cjs and visit http://127.0.0.1:4173.
No installation or build is needed. JavaScript calculations work offline; Google Fonts fall back to system fonts.

1. Enter starting EXP, mesos, potion types, quantities, and unit costs.
2. Start the session. Done freezes the timer immediately.
3. Enter ending values, then Calculate. Results show totals and rates per hour, 10 minutes, and minute.
4. Use Adjustments for level-ups or potions added during training.

Net gain = ending mesos - starting mesos - HP used * HP unit cost - MP used * MP unit cost.
Potions used = starting quantity + added quantity - ending quantity.
EXP gain = ending EXP - starting EXP + full EXP requirements of levels completed.
Rate = gain * target duration / session duration.

Price source: https://meowdb.com/msclassic/npc-shops (checked October 20, 2026).
HP: Meat 80, Red Potion 50, Orange Potion 150, White Potion 350, Apple 20, Fried Chicken 60, Hot Dog 180, Unagi 1000 mesos.
MP: Lemon 150, Blue Potion 220, Pure Water 1120, Orange 50, Orange Juice 540 mesos.
Meat and Lemon are listed first for easy access. Food recovery items work exactly like potions in the calculation.
All prices are editable. Custom supply options start at 0; set your own cost.

Buy potions before starting. The requested formula subtracts the value of potions consumed in addition to meso balance changes. Buying potions during a run can therefore count costs twice.
Count mixed HP/MP potions in only one slot to avoid double counting.

The current session is stored only in browser localStorage. Reloads restore the active timer from timestamps. Storage varies by browser for local HTML files. No game connection or account access is used.

Verification: node test.cjs

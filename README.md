# Outlet Network Dashboard — Auto Refresh Package

Two-page dashboard for GitHub Pages. No `.bat` file, no local Python, and no HTML/JavaScript
edits when the monthly or daily data changes — drop the Excel files in `/data`, push, done.

| Page | File | What it is for |
|---|---|---|
| Network overview | `index.html` | Targets, actuals, month-end projection, last-month comparison, portfolio mix, outlet directory |
| Growth &amp; Momentum | `insights.html` | Momentum quadrant, top movers, trading-day heatmap, month trajectory, leadership league table |

Both pages share `assets/theme.css` and `assets/core.js`, so the theme choice, the sidebar
filters and every calculation stay identical between them.

## One-time repository setup

1. Upload the complete contents of this ZIP to the repository root.
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. Commit/push to `main`. The included workflow rebuilds the JSON and deploys the site.

## Future data updates — only replace these files

Keep the exact filenames in the `/data` folder:

| File | Contents | Required |
|---|---|---|
| `data/zone-distribution.xlsx` | Outlet master / Zone Distribution | yes |
| `data/day-wise-sales.xlsx` | Day-wise actual sales — Outlet Code, Date, POS NSI (or compatible aliases) | yes |
| `data/day-wise-target.xlsx` | Day-wise target — Outlet Code, Outlet Name and daily date columns | yes |
| `data/last-month.xlsx` | **Last month's sales** — see below | optional |

After any of these files are committed to `main`, GitHub Actions automatically:

1. runs `scripts/build_dashboard_data.py`;
2. regenerates `data/dashboard-data.json`;
3. commits the refreshed JSON when needed;
4. deploys the updated dashboard to GitHub Pages.

### Last-month sales file

`data/last-month.xlsx` is the monthly SPLY workbook, saved under that name.
The build script reads sheet **`SPLY-ALL (v5)`** and takes two columns:

- **`Code`** — the outlet code
- **`SALES THIS`** — that outlet's last-month sales

Nothing else in the workbook is touched, so the file can be dropped in unmodified. The
script also picks up the period banner above the header (e.g. *"Same Day SPLY Jul 1-29th
2026…"*) and records it in the JSON for traceability.

The file is **optional**. If it is missing the dashboard still builds — every last-month
figure simply shows as `—`, and the Growth &amp; Momentum page says so rather than guessing.
Outlet codes present in the master but absent from the SPLY sheet are reported in the build
log (`matched on N outlets`).

Filename aliases accepted: `last-month.xlsx`, `Last Month.xlsx`, `Last month.xlsx`,
`last_month.xlsx`. Sheet aliases accepted: `SPLY-ALL (v5)`, `SPLY-ALL (v5) (2)`, `SPLY-ALL (v4)`.

## Themes

Light and dark are both shipped and **light is the default**. The toggle sits in the top bar
on both pages and the choice is remembered in the browser. Dark mode is a hand-picked set of
tokens rather than an automatic inversion, so contrast holds in both.

## Sales period selector (overview page)

- **Through date** — month start through the selected date.
- **Date range** — target and actual are calculated only from the selected From/To dates.
  Month-end projection still uses all actual sales from month start through the range end
  date, so the full-month forecast stays logically complete.

## How the numbers are derived

- **Till-date target / actual** — sum of the daily target and daily actual columns inside the selected period.
- **Month-end projection** — actual sales to date plus separate average-sales forecasts for the
  remaining Fridays, Saturdays and Sunday–Thursday days.
- **Last month sales** — `SALES THIS` from the SPLY workbook, joined on outlet code.
- **MoM growth** — projected month-end ÷ last-month actual − 1. Groups are compared on their
  own baseline, and outlets with no last-month figure are excluded from the base rather than
  counted as zero.

## What is in this version

### Overview page
- Top bar carries **Home** (→ Dashboard Portal), page navigation, a blue **Clear filters**
  button, and the theme toggle. The old ITEM DASHBOARD link is gone.
- Third scorecard: **Month on month** — last-month actual, projected, change, growth.
- **Regional Head / Zonal Actual vs Target** now shows till-date target and actual, last-month
  sales, monthly target, projected month-end, MoM growth and achievement, with a CSV button.
- **Number of outlets overseeing** has a CSV button that exports the counts together with the
  matching sales, projection and MoM figures.
- **Outlet openings by launch year** works like the Regional Head card: cohort size, total and
  average SFT, last-month sales, projection, MoM and share of network — plus a
  **This year, month-wise** toggle and a CSV button.
- KPI row shows **Opened latest year** and **Opened latest month** side by side.
- The detail table and its CSV include last-month sales, MoM growth and projected-vs-last-month.

### Growth &amp; Momentum page
- Hero band: **total target**, **total actual (till date)**, last month, projected, MoM growth,
  target achievement, outlets growing/declining, daily run rate.
- **What the numbers are saying** — read-out cards generated from whatever is in view.
- **Momentum quadrant** — growth against projected achievement, at Regional Head, Zonal or
  Outlet level. Quadrant is carried by marker shape and label as well as colour; axes are
  scaled to the bulk of the data so one outlier cannot flatten the plot.
- **Top movers** — diverging BDT change with a Gainers/Decliners switch.
- **Trading-day heatmap** — network sales by week and weekday on a single-hue ramp.
- **Month trajectory** — cumulative actual, the projected finish, and cumulative target, with a hover crosshair.
- **League table** — Regional Head / Zonal / Division / Format, sortable on every column.
- Every card exports CSV.
- **RHO Summary Report** — see below.

## Regional Head summary report

The **🗎 RHO summary report** button in the Growth &amp; Momentum top bar builds a paginated
A4-landscape report from whatever is currently filtered:

| Page | Contents |
|---|---|
| 1 | Cover: network position tiles and the full Regional Head ranking table |
| 2 | Network movers — largest outlet-level gains and declines (only when it does not fit on page 1) |
| 3+ | One page per Regional Head |

Each Regional Head page carries eight metric tiles (monthly target, till-date target,
till-date actual, till-date achievement, last month, projected month-end, MoM change, MoM
growth), two progress meters, the ten largest outlets by projected sales, and up to ten
outlets that are both declining and behind target.

Two export routes:

- **🖨 Print / Save as PDF** — opens the browser print dialog, already set to A4 landscape with
  one report page per sheet. Choose *Save as PDF*. This is vector output: text stays sharp and
  selectable, and it needs no external library.
- **🖼 Download PNG** — rasterises the whole report to a single tall PNG for pasting into chat or
  slides. Uses `assets/vendor/html2canvas.min.js`, which is bundled in this repo, so it works
  with no internet access. Very long reports are split into `-part1`, `-part2` files because
  browsers cap canvas height.

The report uses a fixed print palette, so it looks identical whether the dashboard was in light
or dark mode when you generated it. Applied filters are printed on the cover, so a filtered
report is never mistaken for the whole network.

## Workflow action versions

Node-24-compatible GitHub Pages actions: `checkout@v7`, `setup-python@v7`, `configure-pages@v6`,
`upload-pages-artifact@v5`, `deploy-pages@v5`.

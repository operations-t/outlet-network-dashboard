# Outlet Network Dashboard — Auto Refresh Package

Two-page dashboard for GitHub Pages. No `.bat` file, no local Python, and no HTML/JavaScript
edits when the monthly or daily data changes — replace the Excel files in the shared Google
Drive folder and the site refreshes itself within 30 minutes.

| Page | File | What it is for |
|---|---|---|
| Network overview | `index.html` | Targets, actuals, month-end projection, last-month comparison, portfolio mix, outlet directory |
| Growth &amp; Momentum | `insights.html` | Momentum quadrant, top movers, trading-day heatmap, month trajectory, leadership league table |

Both pages share `assets/theme.css` and `assets/core.js`, so the theme choice, the sidebar
filters and every calculation stay identical between them.

## One-time repository setup

1. Create a **public** repository and upload the complete contents of this ZIP to its root.
   Check that `.github/workflows/rebuild-and-deploy.yml` arrived (hidden folders are sometimes
   skipped by drag-and-drop — see `UPLOAD-INSTRUCTIONS.txt`).
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. Put the Excel files directly in the Drive folder, then run
   *Actions → Sync Google Drive data and deploy Pages → Run workflow*.

## Data source — Excel files in Google Drive

Only the Excel data lives in Google Drive. **All code (pages, assets, scripts, workflow) lives
in this repo.**

**https://drive.google.com/drive/folders/1mcEmZg6DV0xQzWImuNyZFPhfg4oc0YTB**

Put the workbooks **directly** in that folder (not in a sub-folder) and keep it shared as
*Anyone with the link – Viewer*. Sub-folders are ignored, so an `Old` folder can hold last
month's files.

| Workbook | How it is recognised | Required |
|---|---|---|
| Outlet master / Zone Distribution | `CODE` + `Outlet Name` header with `Leader` / `Zonal` / `Format` columns | yes |
| Day-wise target | `Outlet Code` + `Outlet Name` header followed by daily date columns | yes |
| Day-wise sales | `Outlet Code` + `Date` + `POS NSI` (or compatible aliases) | yes |
| Last month (SPLY) | a sheet named `SPLY-ALL (…)` with `Code` and `SALES THIS` | optional |

**Filenames can change every month** — each workbook is identified by its layout. Keep only one
workbook of each kind in the folder; if there are two, the one with the standard name
(`zone-distribution.xlsx`, `day-wise-target.xlsx`, `day-wise-sales.xlsx`, `last-month.xlsx`)
wins, otherwise the most recently modified, and the build log warns. Native Google Sheets are
exported to `.xlsx` automatically. The workbooks are never committed to the repo.

### How the refresh runs

`.github/workflows/rebuild-and-deploy.yml` runs **every 30 minutes**, on every push to `main`,
and on demand (*Actions → Sync Google Drive data and deploy Pages → Run workflow*). Each run:

1. `scripts/fetch_drive_data.py` downloads the workbooks from Drive into the runner's `data/`
   folder and writes `data/drive-sync.json` (which Drive file fed which role, with checksums);
2. `scripts/build_dashboard_data.py` rebuilds `data/dashboard-data.json`;
3. if the data changed, both JSON files are committed and the site is redeployed —
   scheduled runs with no change do nothing.

If Drive cannot be reached or a required workbook is missing, the run fails and the site keeps
showing the last good snapshot. The sidebar on both pages shows *Drive data dd Mon, hh:mm*
(Dhaka time) — when a changed Drive file was last picked up.

Optional settings (*Settings → Secrets and variables → Actions*):

- Variable `DRIVE_FOLDER_ID` — point at a different Drive folder without editing code.
- Secret `GDRIVE_API_KEY` — use the Drive API instead of the public link (more robust for
  very large folders). Not needed today.

Note: GitHub pauses scheduled workflows in repos with no activity for 60 days. The data
commits count as activity, so this only matters if Drive stops changing for two months.

### Last-month sales file

The build reads sheet **`SPLY-ALL (v5)`** (any `SPLY-ALL (…)` version is accepted) and takes
`Code` → outlet code and `SALES THIS` → last-month sales. The period banner above the header
(e.g. *"Same Day SPLY Aug 1-31st 2026…"*) is recorded in the JSON. If no SPLY workbook is in
the folder, every last-month figure shows as `—` rather than a wrong number.

## Themes

Light and dark are both shipped and **dark is the default**. The toggle sits in the top bar
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

## Shwapno Dashboard System rebuild (16 September 2026)

Both pages use the additive `assets/redesign.css` layer and the responsive shell in
`assets/redesign.js`. The existing snapshot, refresh schedule, sales calculations,
projection model, drill-down and export handlers are retained.

- Persistent navigation rail and mobile filter drawer with keyboard focus management.
- Dark default with remembered light option; teal, amber and clay status colours.
- Linked filter counts, selection chips, selected values retained at zero matching outlets.
- Readable chart labels, responsive charts, square table rows and sticky first columns.
- Data options remain available from the overview toolbar.

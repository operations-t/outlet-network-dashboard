/* =========================================================================
   Outlet Network Dashboard — shared core
   Theme, formatting, data loading, projection maths, filters, CSV export.
   Exposed as window.OND so index.html and insights.html share one engine.
   ========================================================================= */
(() => {
'use strict';

/* ---------- theme (light is the default) ---------- */
const THEME_KEY = 'ond-theme';
function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
}
function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.textContent = next === 'dark' ? '☀ Light' : '🌙 Dark';
    btn.title = next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    btn.setAttribute('aria-pressed', String(next === 'dark'));
  });
  document.dispatchEvent(new CustomEvent('ond:themechange', { detail: { theme: next } }));
}
function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function initTheme() {
  applyTheme(storedTheme() === 'dark' ? 'dark' : 'light');
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
}
// Stamp the attribute immediately so there is no flash before DOM ready.
document.documentElement.setAttribute('data-theme', storedTheme() === 'dark' ? 'dark' : 'light');

/* ---------- primitives ---------- */
const byId = id => document.getElementById(id);
const text = v => (v == null ? '' : String(v).trim());
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,৳\s]/g, '').replace(/%$/, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
function compactNumber(value) {
  const n = num(value);
  if (n === null) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  const f = (x, d = 1) => Number(x.toFixed(d)).toString();
  if (a >= 1e7) return sign + f(a / 1e7, 2) + ' Cr';
  if (a >= 1e5) return sign + f(a / 1e5, 2) + ' Lac';
  if (a >= 1e4) return sign + f(a / 1e3, 1) + ' K';
  return nf.format(Math.round(n));
}
const currency = v => (num(v) === null ? '—' : 'BDT ' + compactNumber(v));
const display = v => text(v) || '—';
function percent(v, digits = 0) {
  const n = num(v);
  return n === null || !Number.isFinite(n) ? '—' : (n * 100).toFixed(digits) + '%';
}
function signedPercent(v, digits = 1) {
  const n = num(v);
  if (n === null || !Number.isFinite(n)) return '—';
  const p = n * 100;
  return (p > 0 ? '+' : '') + p.toFixed(digits) + '%';
}
function prettyDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(v))) return text(v) || '—';
  const d = new Date(v + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function monthLabel(ym) {
  if (!/^\d{4}-\d{2}$/.test(text(ym))) return text(ym) || '—';
  const d = new Date(ym + '-01T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function headerKey(v) { return text(v).toLowerCase().replace(/[_\-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function escapeHtml(v) { return text(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function salesDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && window.XLSX && XLSX.SSF && XLSX.SSF.parse_date_code) {
    const p = XLSX.SSF.parse_date_code(value);
    if (p && p.y) return `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  const raw = text(value);
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* ---------- field + filter definitions (shared by both pages) ---------- */
const FIELD_DEFINITIONS = {
  code: { label: 'Outlet Code', aliases: ['outlet code', 'code', 'outlet id', 'shop code'] },
  outletName: { label: 'Outlet Name', aliases: ['outlet name', 'name', 'store name'] },
  regionalHead: { label: 'Regional Head', aliases: ['regional head', 'rho', 'regional head name'] },
  leader: { label: 'Leader', aliases: ['leader', 'rho name'] },
  rhoId: { label: 'RHO ID', aliases: ['rho id', 'leader id', 'regional head id'] },
  rhoPhone: { label: 'RHO Phone', aliases: ['rho phone', 'leader contact', 'regional head phone', 'rho contact'] },
  zonal: { label: 'Zonal', aliases: ['zonal', 'zonal name'] },
  zonalId: { label: 'Zonal ID', aliases: ['zonal id'] },
  zonalPhone: { label: 'Zonal Phone', aliases: ['zonal phone', 'zonal contact'] },
  launchDate: { label: 'Launching Date', aliases: ['launching date', 'launch date', 'opening date'] },
  sft: { label: 'SFT', aliases: ['sft', 'sqft', 'square feet', 'floor area'] },
  format: { label: 'Format', aliases: ['format', 'store format'] },
  division: { label: 'Division', aliases: ['division'] },
  district: { label: 'District', aliases: ['district'] },
  area: { label: 'Area', aliases: ['area'] },
  pnpStatus: { label: 'PNP Status', aliases: ['pnp status', 'pnp'] },
  status: { label: 'Store Status', aliases: ['store status', 'status', 'ownership'] },
  locationType: { label: 'Location Type', aliases: ['location type', 'location'] },
  cityType: { label: 'Location Type Dv/Ds/T', aliases: ['location type dv ds t', 'city type', 'dv ds t'] },
  density: { label: 'Density', aliases: ['density'] },
  incomeLevel: { label: 'Income Level', aliases: ['income level'] },
  floorType: { label: 'Floor Type', aliases: ['floor type'] },
  layoutShape: { label: 'Layout Shape', aliases: ['layout shape'] },
  salesToDate: { label: 'Sales To Date', aliases: ['sales to date', 'till date sales', 'pos nsi'] },
  targetToDate: { label: 'Target To Date', aliases: ['target to date', 'till date target'] },
  salesGapToDate: { label: 'Sales Gap To Date', aliases: ['sales gap to date'] },
  lastMonthSales: { label: 'Last Month Sales', aliases: ['last month sales', 'sales this', 'last month'] },
  momGrowth: { label: 'MoM Growth', aliases: ['mom growth', 'growth'] },
  projectedVsLastMonth: { label: 'Projected vs Last Month', aliases: ['projected vs last month'] },
  monthlyTarget: { label: 'Monthly Target', aliases: ['monthly target'] },
  projectedSales: { label: 'Projected Sales', aliases: ['projected sales'] },
  projectedGap: { label: 'Projected Gap', aliases: ['projected gap'] },
  salesAchievement: { label: 'Sales Achievement', aliases: ['sales achievement'] },
  projectedAchievement: { label: 'Projected Achievement', aliases: ['projected achievement'] }
};

const FILTERS = [
  { key: 'outletIdentity', label: 'Outlet code + name', get: r => [text(r.code), text(r.outletName)].filter(Boolean).join(' — ') },
  { key: 'division', label: 'Division' },
  { key: 'status', label: 'Store status' },
  { key: 'pnpStatus', label: 'PNP status' },
  { key: 'leader', label: 'Leader / Regional Head', get: r => r.leader || r.regionalHead },
  { key: 'zonal', label: 'Zonal' },
  { key: 'format', label: 'Format' },
  { key: 'district', label: 'District' },
  { key: 'area', label: 'Area' },
  { key: 'cityType', label: 'Location Type Dv/Ds/T' },
  { key: 'floorType', label: 'Floor Type' },
  { key: 'layoutShape', label: 'Layout Shape' }
];

const PERCENT_FIELDS = ['salesAchievement', 'projectedAchievement', 'momGrowth'];
const MONEY_FIELDS = ['targetToDate', 'salesToDate', 'salesGapToDate', 'lastMonthSales', 'monthlyTarget', 'projectedSales', 'projectedGap', 'projectedVsLastMonth'];
const NUMERIC_FIELDS = MONEY_FIELDS.concat(PERCENT_FIELDS, ['sft']);

/* ---------- projection maths ---------- */
function daysInCalendarMonth(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '')) return 0;
  const [y, m] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function projectionDayGroup(dateValue) {
  const w = new Date(dateValue + 'T00:00:00Z').getUTCDay();
  return w === 5 ? 'friday' : w === 6 ? 'saturday' : 'other';
}
function averageSales(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

function projectMonthEndSales(dailyActuals, dailyTargets, dateValue, daysInMonth) {
  const reportMonth = dateValue.slice(0, 7);
  const observedDates = Object.keys(dailyActuals || {}).filter(d => d.startsWith(reportMonth) && d <= dateValue).sort();
  if (!observedDates.length) return null;
  const salesToDate = observedDates.reduce((s, d) => s + (num(dailyActuals[d]) || 0), 0);
  const throughDay = Number(dateValue.slice(-2)), remainingDates = [];
  for (let day = throughDay + 1; day <= daysInMonth; day++) remainingDates.push(reportMonth + '-' + String(day).padStart(2, '0'));
  if (!remainingDates.length) return salesToDate;
  const observedByGroup = { friday: [], saturday: [], other: [] };
  observedDates.forEach(d => observedByGroup[projectionDayGroup(d)].push(num(dailyActuals[d]) || 0));
  const overallAverage = salesToDate / observedDates.length;
  const observedTargetTotal = observedDates.reduce((s, d) => s + (Object.prototype.hasOwnProperty.call(dailyTargets || {}, d) ? (num(dailyTargets[d]) || 0) : 0), 0);
  const targetPerformance = observedTargetTotal ? salesToDate / observedTargetTotal : null;
  const groupAverages = {};
  Object.keys(observedByGroup).forEach(group => {
    const actualAverage = averageSales(observedByGroup[group]);
    if (actualAverage !== null) { groupAverages[group] = actualAverage; return; }
    const vals = remainingDates
      .filter(d => projectionDayGroup(d) === group && Object.prototype.hasOwnProperty.call(dailyTargets || {}, d))
      .map(d => num(dailyTargets[d]) || 0);
    const targetAverage = averageSales(vals);
    groupAverages[group] = targetAverage !== null && targetPerformance !== null ? targetAverage * targetPerformance : overallAverage;
  });
  return salesToDate + remainingDates.reduce((s, d) => s + groupAverages[projectionDayGroup(d)], 0);
}

function refreshSalesCalculations(data, dateValue, rangeStart = '') {
  if (!dateValue) return data.map(r => ({ ...r }));
  const daysInMonth = daysInCalendarMonth(dateValue);
  const reportMonth = dateValue.slice(0, 7);
  const elapsedDays = Math.min(Math.max(Number(dateValue.slice(-2)), 1), daysInMonth);
  const effectiveStart = rangeStart && rangeStart.slice(0, 7) === reportMonth ? rangeStart : reportMonth + '-01';
  return data.map(row => {
    const dailyTargets = row.dailySalesTargets && typeof row.dailySalesTargets === 'object' ? row.dailySalesTargets : {};
    const targetDates = Object.keys(dailyTargets).filter(d => d.startsWith(reportMonth));
    const monthlyTarget = targetDates.length ? targetDates.reduce((s, d) => s + (num(dailyTargets[d]) || 0), 0) : num(row.monthlyTarget);
    const targetToDate = targetDates.length
      ? targetDates.filter(d => d >= effectiveStart && d <= dateValue).reduce((s, d) => s + (num(dailyTargets[d]) || 0), 0)
      : num(row.targetToDate);
    const dailyActuals = row.dailySalesActuals && typeof row.dailySalesActuals === 'object' ? row.dailySalesActuals : {};
    const actualDates = Object.keys(dailyActuals).filter(d => d.startsWith(reportMonth));
    const salesToDate = actualDates.length
      ? actualDates.filter(d => d >= effectiveStart && d <= dateValue).reduce((s, d) => s + (num(dailyActuals[d]) || 0), 0)
      : num(row.salesToDate);
    const projectedSales = actualDates.length
      ? projectMonthEndSales(dailyActuals, dailyTargets, dateValue, daysInMonth)
      : (salesToDate !== null && elapsedDays ? salesToDate / elapsedDays * daysInMonth : num(row.projectedSales));
    const lastMonthSales = num(row.lastMonthSales);
    return {
      ...row,
      targetToDate, monthlyTarget, salesToDate, projectedSales, lastMonthSales,
      salesGapToDate: salesToDate !== null && targetToDate !== null ? salesToDate - targetToDate : null,
      salesAchievement: salesToDate !== null && targetToDate ? salesToDate / targetToDate : null,
      projectedGap: projectedSales !== null && monthlyTarget !== null ? projectedSales - monthlyTarget : null,
      projectedAchievement: projectedSales !== null && monthlyTarget ? projectedSales / monthlyTarget : null,
      // Month-on-month compares the projected full month against last month's full-month actual.
      momGrowth: projectedSales !== null && lastMonthSales ? projectedSales / lastMonthSales - 1 : null,
      projectedVsLastMonth: projectedSales !== null && lastMonthSales !== null ? projectedSales - lastMonthSales : null
    };
  });
}

function allSalesDates(data) {
  const ds = [];
  data.forEach(r => {
    Object.keys(r.dailySalesTargets || {}).forEach(d => ds.push(d));
    Object.keys(r.dailySalesActuals || {}).forEach(d => ds.push(d));
  });
  return [...new Set(ds.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}
function actualSalesDates(data) {
  const ds = [];
  data.forEach(r => Object.keys(r.dailySalesActuals || {}).forEach(d => ds.push(d)));
  return [...new Set(ds.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}
function sum(data, key) { return data.reduce((s, r) => s + (num(r[key]) || 0), 0); }

function performanceTone(achievement) {
  if (!Number.isFinite(achievement)) return { key: 'watch', label: 'No target' };
  if (achievement >= 1) return { key: 'good', label: 'On target' };
  if (achievement >= 0.95) return { key: 'watch', label: 'Watch' };
  return { key: 'bad', label: 'Below target' };
}
function growthTone(growth) {
  if (!Number.isFinite(growth)) return { key: 'watch', label: 'No base' };
  if (growth >= 0.02) return { key: 'good', label: 'Growing' };
  if (growth >= -0.02) return { key: 'watch', label: 'Flat' };
  return { key: 'bad', label: 'Declining' };
}

/* ---------- filter state, shared across pages via sessionStorage ---------- */
const FILTER_KEY = 'ond-filters';
function emptyFilters() { return Object.fromEntries(FILTERS.map(f => [f.key, []])); }
function loadFilters() {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    if (!raw) return emptyFilters();
    const parsed = JSON.parse(raw), out = emptyFilters();
    FILTERS.forEach(f => { if (Array.isArray(parsed[f.key])) out[f.key] = parsed[f.key].map(String); });
    return out;
  } catch (e) { return emptyFilters(); }
}
function saveFilters(filters) {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (e) { /* ignore */ }
}

/* ---------- CSV ---------- */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(filename, headerRow, dataRows) {
  if (!headerRow || !headerRow.length) return;
  const lines = [headerRow.map(csvCell).join(',')];
  dataRows.forEach(r => lines.push(r.map(csvCell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- combobox filter UI ---------- */
function createFilterPanel(hostId, { availableKey, onChange, getFilters, getRows, fieldValue }) {
  const host = byId(hostId);
  if (!host) return { refresh() {}, closeAll() {} };
  const comboQueries = new Map(), optionsByKey = new Map();
  host.replaceChildren();

  FILTERS.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'field'; wrap.dataset.field = f.key;
    const lab = document.createElement('label');
    lab.htmlFor = f.key; lab.textContent = f.label;
    const combo = document.createElement('div'); combo.className = 'combobox';
    const input = document.createElement('input');
    input.id = f.key; input.type = 'search'; input.autocomplete = 'off';
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    input.placeholder = 'All ' + f.label;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'combo-toggle'; toggle.textContent = '⌄';
    toggle.setAttribute('aria-label', 'Toggle ' + f.label + ' options');
    const menu = document.createElement('div');
    menu.className = 'combo-menu'; menu.id = f.key + 'Options'; menu.hidden = true;
    combo.append(input, toggle, menu); wrap.append(lab, combo); host.append(wrap);
    input.addEventListener('focus', () => openCombo(f.key));
    input.addEventListener('input', e => { comboQueries.set(f.key, text(e.target.value)); renderComboMenu(f.key); menu.hidden = false; });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') closeCombo(f.key); });
    toggle.addEventListener('click', () => (menu.hidden ? openCombo(f.key) : closeCombo(f.key)));
  });

  function closeCombo(key) {
    const m = byId(key + 'Options');
    if (!m) return;
    m.hidden = true; comboQueries.set(key, ''); updateComboInput(key);
    byId(key).setAttribute('aria-expanded', 'false');
  }
  function closeAll() { FILTERS.forEach(f => closeCombo(f.key)); }
  function openCombo(key) {
    if (!availableKey(key)) return;
    FILTERS.forEach(f => { if (f.key !== key) closeCombo(f.key); });
    comboQueries.set(key, ''); byId(key).value = '';
    renderComboMenu(key); byId(key + 'Options').hidden = false;
    byId(key).setAttribute('aria-expanded', 'true');
  }
  function updateComboInput(key) {
    const selected = getFilters()[key] || [], input = byId(key), menu = byId(key + 'Options');
    if (document.activeElement === input && menu && !menu.hidden) return;
    input.value = selected.length ? selected.join(', ') : '';
    input.placeholder = 'All ' + (FILTERS.find(f => f.key === key)?.label || key);
  }
  function renderComboMenu(key) {
    const menu = byId(key + 'Options');
    if (!menu) return;
    menu.replaceChildren();
    const filters = getFilters(), selected = filters[key] || [];
    const q = text(comboQueries.get(key)).toLowerCase();
    const values = (optionsByKey.get(key) || []).filter(v => v.toLowerCase().includes(q));
    const add = (label, value, isAll) => {
      const current = isAll ? selected.length === 0 : selected.includes(value);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'combo-option' + (current ? ' is-current' : '');
      const c = document.createElement('span'); c.className = 'combo-check'; c.textContent = current ? '✓' : '';
      const s = document.createElement('span'); s.textContent = label;
      b.append(c, s);
      b.onclick = () => {
        const f = getFilters();
        if (isAll) f[key] = [];
        else if (f[key].includes(value)) f[key] = f[key].filter(x => x !== value);
        else f[key] = f[key].concat(value);
        saveFilters(f); onChange(); renderComboMenu(key);
      };
      menu.append(b);
    };
    add('All ' + (FILTERS.find(f => f.key === key)?.label || key), '__ALL__', true);
    if (!values.length) {
      const e = document.createElement('div');
      e.className = 'combo-empty'; e.textContent = 'No matching values';
      menu.append(e);
    } else values.forEach(v => add(v, v, false));
  }
  function refresh() {
    const filters = getFilters(), rows = getRows();
    FILTERS.forEach(f => {
      const wrap = document.querySelector(`[data-field="${f.key}"]`);
      const available = availableKey(f.key);
      if (wrap) wrap.hidden = !available;
      if (!available) { filters[f.key] = []; return; }
      const related = rows.filter(r => FILTERS.every(other =>
        other.key === f.key || !availableKey(other.key) || filterMatches(fieldValue(r, other.key), filters[other.key])));
      const values = [...new Set(related.map(r => display(fieldValue(r, f.key))).filter(v => v !== '—'))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      optionsByKey.set(f.key, values);
      updateComboInput(f.key);
      renderComboMenu(f.key);
    });
  }
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.combobox')) closeAll(); });
  return { refresh, closeAll };
}

function filterMatches(value, selected) {
  if (!selected || !selected.length) return true;
  const c = display(value).toLowerCase();
  return selected.some(v => c === text(v).toLowerCase());
}

/* ---------- data loading ---------- */
async function loadDashboardData() {
  const res = await fetch('./data/dashboard-data.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load data/dashboard-data.json (' + res.status + ').');
  const data = await res.json();
  return {
    rows: Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : []),
    source: (data && data.source) || {},
    meta: (data && data.meta) || {}
  };
}

/* ---------- misc UI helpers ---------- */
function setMessage(kind, msg) {
  const el = byId('message');
  if (!el) return;
  el.className = 'message is-visible ' + kind;
  el.textContent = msg;
}
function clearMessage() {
  const el = byId('message');
  if (!el) return;
  el.className = 'message'; el.textContent = '';
}
function enableScrollChain() {
  document.addEventListener('wheel', e => {
    const scroller = e.target.closest('.table-scroll,.scroll-chain,.sidebar,.combo-menu');
    if (!scroller || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.deltaY === 0) return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 1) return;
    const atTop = scroller.scrollTop <= 1, atBottom = scroller.scrollTop >= max - 1;
    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, left: 0, behavior: 'auto' });
    }
  }, { passive: false });
}

/* ---------- shared tooltip for SVG charts ---------- */
let tooltipEl = null;
function tooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'viz-tooltip';
    tooltipEl.setAttribute('role', 'status');
    document.body.append(tooltipEl);
  }
  return tooltipEl;
}
function showTooltip(evt, html) {
  const el = tooltip();
  el.innerHTML = html;
  el.classList.add('is-visible');
  const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
  el.style.left = Math.max(8, x) + 'px';
  el.style.top = Math.max(8, y) + 'px';
}
function hideTooltip() { if (tooltipEl) tooltipEl.classList.remove('is-visible'); }
function attachTooltip(node, htmlFactory) {
  node.addEventListener('pointerenter', e => showTooltip(e, htmlFactory()));
  node.addEventListener('pointermove', e => showTooltip(e, htmlFactory()));
  node.addEventListener('pointerleave', hideTooltip);
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined) el.setAttribute(k, v); });
  return el;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* Pick black or white ink for a filled swatch by measured luminance, so heatmap
   labels stay readable at every ramp step in both themes rather than by index. */
function relativeLuminance(hex) {
  const m = String(hex).trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 1;
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function readableInk(hex) {
  const l = relativeLuminance(hex);
  // Contrast against white is 1.05/(l+0.05); against black it is (l+0.05)/0.05.
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? '#ffffff' : '#0a141c';
}

/* Resolve design tokens to concrete colours.
   SVG *presentation attributes* (fill="…", stroke="…") do not reliably accept var()
   in every browser, so charts read hex values here and re-render on theme change. */
function palette(extra = []) {
  const names = ['--viz-surface', '--viz-grid', '--viz-axis', '--viz-ink', '--viz-muted',
    '--series-1', '--series-2', '--series-3', '--accent', '--track',
    '--status-good', '--status-warning', '--status-serious', '--status-critical',
    '--div-pos', '--div-neg', '--div-mid',
    '--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700'].concat(extra);
  const out = {};
  names.forEach(n => { out[n] = cssVar(n) || '#888888'; });
  out.get = n => out[n] || cssVar(n) || '#888888';
  return out;
}

window.OND = {
  byId, text, num, nf, compactNumber, currency, display, percent, signedPercent,
  prettyDate, monthLabel, headerKey, escapeHtml, salesDateValue,
  FIELD_DEFINITIONS, FILTERS, PERCENT_FIELDS, MONEY_FIELDS, NUMERIC_FIELDS,
  daysInCalendarMonth, projectionDayGroup, projectMonthEndSales, refreshSalesCalculations,
  allSalesDates, actualSalesDates, sum, performanceTone, growthTone,
  emptyFilters, loadFilters, saveFilters, filterMatches, createFilterPanel,
  csvCell, downloadCsv, stamp, loadDashboardData, setMessage, clearMessage, enableScrollChain,
  showTooltip, hideTooltip, attachTooltip, svgEl, cssVar, palette, readableInk, relativeLuminance, SVG_NS,
  initTheme, applyTheme, currentTheme
};
})();

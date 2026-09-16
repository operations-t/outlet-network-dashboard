/* =========================================================================
   Outlet profile drawer — shared by both pages.
   OND.openOutletProfile(row, ctx)
     row  one outlet after refreshSalesCalculations()
     ctx  { pool, lastMonthName, through, reportMonth }
          pool = outlets currently in view (for ranks)
   ========================================================================= */
(() => {
'use strict';
const O = window.OND;
const { text, num, nf, currency, moneyExact, display, percent, signedPercent, prettyDate, monthLabel,
  escapeHtml, salesDateValue, performanceTone, growthTone, toneChip, svgEl, palette } = O;

const pct0 = v => {
  if (!Number.isFinite(v)) return '—';
  // 99.8% must not print as 100% next to a "Watch" chip.
  const r = Math.round(v * 100);
  return (v < 1 && r >= 100) || (v > 1 && r <= 100) ? (v * 100).toFixed(1) + '%' : r + '%';
};

function meter(label, value, ratio, tone) {
  const scaleMax = Math.max(1.2, Number.isFinite(ratio) ? Math.min(ratio, 2) : 0);
  const fill = Number.isFinite(ratio) ? Math.min(ratio, scaleMax) / scaleMax * 100 : 0;
  const key = !Number.isFinite(ratio) ? '' : tone.key === 'watch' ? 'near' : tone.key;
  return `<div>
    <div class="hero-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
    <div class="meter" role="img" aria-label="${escapeHtml(label)} ${pct0(ratio)}"><i class="${key}" style="width:${fill.toFixed(1)}%"></i><b style="left:${(100 / scaleMax).toFixed(1)}%" title="Target"></b></div>
    <div class="meter-scale"><span>0%</span><span>Target 100%</span></div>
  </div>`;
}

function rankIn(pool, row, key) {
  const ranked = pool.filter(r => Number.isFinite(num(r.projectedAchievement))).sort((a, b) => num(b.projectedAchievement) - num(a.projectedAchievement));
  const i = ranked.findIndex(r => r.code === row.code);
  return i < 0 ? '—' : `${nf.format(i + 1)} of ${nf.format(ranked.length)}`;
}

function person(role, name, id, phone) {
  if (display(name) === '—') return '';
  const tel = text(phone).replace(/[^\d+]/g, '');
  return `<div class="person"><span>${escapeHtml(role)}${text(id) ? ' · ID ' + escapeHtml(id) : ''}</span>
    <strong>${escapeHtml(name)}</strong>${tel ? `<a href="tel:${escapeHtml(tel)}">${escapeHtml(phone)}</a>` : ''}</div>`;
}

function drawDaily(row, ctx) {
  const host = document.getElementById('profileDaily');
  if (!host) return;
  const month = ctx.reportMonth;
  if (!/^\d{4}-\d{2}$/.test(month || '')) { host.innerHTML = '<div class="empty-state">No month in the data.</div>'; return; }
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const t = row.dailySalesTargets || {}, a = row.dailySalesActuals || {};
  const series = [];
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    series.push({ d, iso, target: num(t[iso]), actual: iso <= (ctx.through || '') ? num(a[iso]) : null });
  }
  const max = Math.max(1, ...series.map(s => Math.max(s.target || 0, s.actual || 0))) * 1.1;
  if (!series.some(s => s.target || s.actual)) { host.innerHTML = '<div class="empty-state">No daily target or sales for this outlet.</div>'; return; }
  const P = palette();
  const W = Math.max(280, Math.round(host.clientWidth || 480)), H = 150, pad = { t: 8, r: 4, b: 22, l: 44 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b, slot = pw / days, bw = Math.max(3, slot * 0.62);
  const yv = v => pad.t + ph - (v / max) * ph;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Daily sales against daily target' });
  [0, 0.5, 1].forEach(f => {
    const v = max / 1.1 * f, gy = yv(v);
    svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, stroke: P['--grid'] }));
    const lab = svgEl('text', { x: pad.l - 6, y: gy + 3.5, 'text-anchor': 'end', fill: P['--ink-3'], 'font-size': 10.5 });
    lab.textContent = O.compactNumber(v);
    svg.append(lab);
  });
  series.forEach(s => {
    const x = pad.l + (s.d - 1) * slot + (slot - bw) / 2;
    if (s.actual !== null && s.actual !== undefined) {
      const good = s.target ? s.actual >= s.target : true;
      const r = svgEl('rect', { x, y: yv(s.actual), width: bw, height: Math.max(1, pad.t + ph - yv(s.actual)), rx: 1.5, fill: good ? P['--good'] : P['--bad'] });
      const tt = svgEl('title', {});
      tt.textContent = `${prettyDate(s.iso)} · sales ${currency(s.actual)} · target ${currency(s.target)}`;
      r.append(tt);
      svg.append(r);
    }
    if (s.target) svg.append(svgEl('line', { x1: x - 1, x2: x + bw + 1, y1: yv(s.target), y2: yv(s.target), stroke: P['--ink-2'], 'stroke-width': 1.6 }));
    if (s.d === 1 || s.d === days || s.d % 5 === 0) {
      const lab = svgEl('text', { x: x + bw / 2, y: H - 6, 'text-anchor': s.d === 1 ? 'start' : s.d === days ? 'end' : 'middle', fill: P['--ink-3'], 'font-size': 10.5 });
      lab.textContent = String(s.d);
      svg.append(lab);
    }
  });
  host.replaceChildren(svg);
}

function openOutletProfile(row, ctx) {
  if (!row) return;
  const lm = ctx.lastMonthName || 'Last month';
  const tdTone = performanceTone(num(row.salesAchievement));
  const pjTone = performanceTone(num(row.projectedAchievement));
  const gTone = growthTone(num(row.momGrowth));
  const pool = ctx.pool || [];
  const rh = display(row.regionalHead) !== '—' ? 'regionalHead' : 'leader';
  const launch = salesDateValue(row.launchDate);
  const attrs = [
    ['Format', row.format], ['Store status', row.status], ['PNP status', row.pnpStatus],
    ['Division', row.division], ['District', row.district], ['Area', row.area],
    ['Location type', row.locationType], ['Dv / Ds / T', row.cityType], ['Density', row.density],
    ['Income level', row.incomeLevel], ['Floor type', row.floorType], ['Layout shape', row.layoutShape],
    ['Floor area', num(row.sft) ? nf.format(Math.round(num(row.sft))) + ' sft' : null],
    ['Launched', launch ? prettyDate(launch) : row.launchDate]
  ].filter(([, v]) => display(v) !== '—');
  const geo = text(row.geoLocation);

  const html = `
    <div class="stat-grid">
      <div class="stat"><span>Actual till date</span><strong>${escapeHtml(currency(row.salesToDate))}</strong><small>Target ${escapeHtml(currency(row.targetToDate))}</small><div>${toneChip(tdTone, pct0(num(row.salesAchievement)) + ' · ' + tdTone.label)}</div></div>
      <div class="stat"><span>Projected month-end</span><strong>${escapeHtml(currency(row.projectedSales))}</strong><small>Monthly target ${escapeHtml(currency(row.monthlyTarget))}</small><div>${toneChip(pjTone, pct0(num(row.projectedAchievement)) + ' · ' + pjTone.label)}</div></div>
      <div class="stat"><span>${escapeHtml(lm)} sales</span><strong>${escapeHtml(currency(row.lastMonthSales))}</strong><small>${num(row.lastMonthSales) === null ? 'No baseline for this outlet' : 'Change ' + escapeHtml(currency(row.projectedVsLastMonth))}</small><div>${toneChip(gTone, num(row.momGrowth) === null ? 'No base' : signedPercent(num(row.momGrowth)) + ' · ' + gTone.label)}</div></div>
    </div>

    <div>
      <div class="section-title">Against target</div>
      <dl style="margin:0;display:grid;gap:14px">
        ${meter('Till date', `${currency(row.salesToDate)} of ${currency(row.targetToDate)} · ${pct0(num(row.salesAchievement))}`, num(row.salesAchievement), tdTone)}
        ${meter('Projected month-end', `${currency(row.projectedSales)} of ${currency(row.monthlyTarget)} · ${pct0(num(row.projectedAchievement))}`, num(row.projectedAchievement), pjTone)}
      </dl>
    </div>

    <div>
      <div class="section-title">Daily sales against daily target · ${escapeHtml(monthLabel(ctx.reportMonth))}</div>
      <div class="chart-legend"><span><i class="swatch" style="background:var(--good)"></i>At or above target</span><span><i class="swatch" style="background:var(--bad)"></i>Below target</span><span><i class="swatch" style="background:var(--ink-2);height:2px"></i>Daily target</span></div>
      <div id="profileDaily" class="chart"></div>
    </div>

    <div>
      <div class="section-title">Rank by projected achievement, best first</div>
      <table class="data"><thead><tr><th>Within</th><th class="numeric">Rank</th></tr></thead><tbody>
        <tr><td>All outlets in view</td><td class="numeric">${rankIn(pool, row)}</td></tr>
        <tr><td>${escapeHtml(display(row[rh]))}'s portfolio</td><td class="numeric">${rankIn(pool.filter(r => display(r[rh]) === display(row[rh])), row)}</td></tr>
        <tr><td>${escapeHtml(display(row.zonal))}'s zone</td><td class="numeric">${rankIn(pool.filter(r => display(r.zonal) === display(row.zonal)), row)}</td></tr>
        <tr><td>${escapeHtml(display(row.format))} outlets</td><td class="numeric">${rankIn(pool.filter(r => display(r.format) === display(row.format)), row)}</td></tr>
      </tbody></table>
    </div>

    <div>
      <div class="section-title">People</div>
      <div class="people">
        ${person('Regional head', display(row.regionalHead) !== '—' ? row.regionalHead : row.leader, row.rhoId, row.rhoPhone)}
        ${person('Zonal', row.zonal, row.zonalId, row.zonalPhone)}
      </div>
    </div>

    <div>
      <div class="section-title">Outlet details</div>
      <dl class="kv">${attrs.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(display(v))}</dd>`).join('')}
        ${/^https?:\/\//i.test(geo) ? `<dt>Map</dt><dd><a class="drill" href="${escapeHtml(geo)}" target="_blank" rel="noopener">Open location ↗</a></dd>` : ''}
      </dl>
    </div>`;

  const sub = [display(row.format), [display(row.district), display(row.division)].filter(v => v !== '—').join(', '), display(row.area)].filter(v => v && v !== '—').join(' · ');
  O.openDrawer(`${display(row.code)} · ${display(row.outletName)}`, sub, html);
  requestAnimationFrame(() => drawDaily(row, ctx));
}

O.openOutletProfile = openOutletProfile;
})();

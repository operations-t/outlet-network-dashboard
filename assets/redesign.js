/* Shell interactions, separate from the snapshot and sales engine. */
(() => {
  'use strict';
  const shell = document.querySelector('.shell');
  const rail = document.getElementById('filterPanel');
  const toggle = document.getElementById('sidebarToggle');
  const close = document.getElementById('railClose');
  const scrim = document.getElementById('railScrim');
  const narrow = matchMedia('(max-width:1080px)');
  function setOpen(open, focus = false) {
    shell.classList.toggle('sidebar-hidden', !open);
    document.body.classList.toggle('rail-collapsed', !open && !narrow.matches);
    document.body.classList.toggle('rail-open', open && narrow.matches);
    scrim.hidden = !(open && narrow.matches);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = narrow.matches ? '☰ Filters & pages' : (open ? 'Hide filters' : 'Show filters');
    if (open && narrow.matches) { rail.setAttribute('role', 'dialog'); rail.setAttribute('aria-modal', 'true'); }
    else {rail.removeAttribute('role');rail.removeAttribute('aria-modal');}
    if (focus) (open && narrow.matches ? close : toggle).focus();
    window.dispatchEvent(new Event('resize'));
  }
  toggle.addEventListener('click', () => setOpen(shell.classList.contains('sidebar-hidden'),true));
  close.addEventListener('click', () => setOpen(false,true));
  scrim.addEventListener('click', () => setOpen(false,true));
  narrow.addEventListener('change', () => setOpen(!narrow.matches));
  document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('rail-open')) return;
    if (e.key === 'Escape') {setOpen(false,true);return;}
    if (e.key !== 'Tab') return;
    const nodes = [...rail.querySelectorAll('a,button,input,[tabindex="0"]')].filter(n => n.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
  });
  setOpen(!narrow.matches);
  function styleCurrency() {
    document.querySelectorAll('.sales-metric-value,.kpi-value').forEach(el => {
      if (el.firstChild?.nodeType !== Node.TEXT_NODE || !el.textContent.startsWith('BDT ')) return;
      const value=el.textContent.slice(4),unit=document.createElement('small'),number=document.createElement('span');
      unit.className='currency-unit';unit.textContent='BDT ';number.className='currency-number';number.textContent=value;el.replaceChildren(unit,number);
    });
  }
  new MutationObserver(styleCurrency).observe(document.getElementById('mainContent'),{subtree:true,childList:true});styleCurrency();
  const summary=document.getElementById('filterSummary'),scope=document.getElementById('scopeLine');
  const updateScope=()=>{scope.textContent=summary.textContent || 'Explore the selected outlet network';};
  new MutationObserver(updateScope).observe(summary,{childList:true,subtree:true,characterData:true});updateScope();
  document.querySelectorAll('.table-search input').forEach(n=>n.setAttribute('aria-label','Search outlet register'));
  document.querySelectorAll('.data-tools').forEach(el=>document.addEventListener('click',e=>{if(!el.contains(e.target))el.open=false;}));
})();

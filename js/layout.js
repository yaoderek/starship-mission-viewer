// Resizable dashboard: drag the gutters between columns and between stacked panels,
// expand any panel to fill the workspace. Sizes persist in localStorage.
import { $ } from './fmt.js';

const KEY = 'smv-layout-v1';
const grid = () => $('grid');
let saved = {};

function save() {
  const s = { lw: grid().style.getPropertyValue('--lw'), rw: grid().style.getPropertyValue('--rw'), grow: {} };
  document.querySelectorAll('#grid .panel').forEach(p => { if (p.style.flexGrow) s.grow[p.id] = p.style.flexGrow; });
  localStorage.setItem(KEY, JSON.stringify(s));
}
function restore() {
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
  if (saved.lw) grid().style.setProperty('--lw', saved.lw);
  if (saved.rw) grid().style.setProperty('--rw', saved.rw);
  document.querySelectorAll('#grid .panel').forEach(p => { p.style.flexGrow = saved.grow?.[p.id] || p.dataset.grow || 1; });
}
export function resetLayout() {
  localStorage.removeItem(KEY); grid().style.removeProperty('--lw'); grid().style.removeProperty('--rw');
  document.querySelectorAll('#grid .panel').forEach(p => p.style.flexGrow = p.dataset.grow || 1);
}

function drag(el, onMove, onEnd) {
  el.addEventListener('pointerdown', ev => {
    ev.preventDefault(); el.setPointerCapture(ev.pointerId); el.classList.add('drag'); document.body.classList.add('dragging');
    const start = { x: ev.clientX, y: ev.clientY }, ctx = {};
    const move = e => onMove(e.clientX - start.x, e.clientY - start.y, ctx, e);
    const up = () => { el.classList.remove('drag'); document.body.classList.remove('dragging'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onEnd && onEnd(); save(); };
    onMove(0, 0, ctx, ev); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}

export function initLayout() {
  restore();
  // column gutters
  document.querySelectorAll('.gutter.colg').forEach(g => {
    const side = g.dataset.side, col = side === 'L' ? $('colL') : $('colR'), prop = side === 'L' ? '--lw' : '--rw';
    drag(g, (dx, _dy, ctx) => {
      if (ctx.w0 == null) ctx.w0 = col.getBoundingClientRect().width;
      const max = grid().clientWidth * 0.6, w = Math.max(240, Math.min(max, ctx.w0 + (side === 'L' ? dx : -dx)));
      grid().style.setProperty(prop, w + 'px');
    });
    g.addEventListener('dblclick', () => { grid().style.removeProperty(prop); save(); });
  });
  // row gutters inside each column stack
  document.querySelectorAll('#grid .stack').forEach(stack => {
    const panels = [...stack.querySelectorAll(':scope > .panel')];
    for (let i = 0; i < panels.length - 1; i++) {
      const a = panels[i], b = panels[i + 1], g = document.createElement('div'); g.className = 'gutter rowg'; a.after(g);
      drag(g, (_dx, dy, ctx) => {
        if (ctx.ha == null) { // freeze every panel in the stack at its current pixel height
          stack.querySelectorAll(':scope > .panel').forEach(p => p.style.flexGrow = p.getBoundingClientRect().height);
          ctx.ha = a.getBoundingClientRect().height; ctx.hb = b.getBoundingClientRect().height;
        }
        const tot = ctx.ha + ctx.hb, ha = Math.max(90, Math.min(tot - 90, ctx.ha + dy));
        a.style.flexGrow = ha; b.style.flexGrow = tot - ha;
      });
      g.addEventListener('dblclick', () => { a.style.flexGrow = a.dataset.grow; b.style.flexGrow = b.dataset.grow; save(); });
    }
  });
  // expand / restore
  document.querySelectorAll('#grid .panel .max').forEach(btn => {
    const p = btn.closest('.panel');
    btn.onclick = () => toggleMax(p);
    const h = p.querySelector('.ph'); if (h) h.addEventListener('dblclick', e => { if (!e.target.closest('button,label,input')) toggleMax(p); });
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.panel.maxed').forEach(toggleMax); });
  $('resetlayout').onclick = resetLayout;
}
function toggleMax(p) {
  const on = !p.classList.contains('maxed');
  document.querySelectorAll('.panel.maxed').forEach(q => { q.classList.remove('maxed'); q.querySelector('.max').textContent = '⤢'; });
  if (on) { p.classList.add('maxed'); p.querySelector('.max').textContent = '✕'; }
  document.body.classList.toggle('has-max', on);
}

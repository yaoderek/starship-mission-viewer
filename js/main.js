// Entry point: routes between the start screen and the dashboard, and runs the frame loop.
import * as View from './scene.js';
import * as Dash from './dashboard.js';
import { initLayout } from './layout.js';
import { initHero, renderHero, setHero, initBuilder, openBuilder, closeBuilder, loadPlanetFile, B } from './start.js';
import { PRESETS, SOLAR_VEHICLES, STAR_VEHICLES, planetById, starById } from './catalog.js';
import { buildInterstellar } from './interstellar.js';
import { resizeAll } from './vehicle.js';
import { $, esc } from './fmt.js';

let current = null, sceneReady = null, view = 'start';

function loading(on, text = 'Loading') {
  const el = $('loading'); el.querySelector('span').textContent = text;
  if (on) { el.style.display = 'grid'; requestAnimationFrame(() => el.style.opacity = 1); }
  else { el.style.opacity = 0; setTimeout(() => el.style.display = 'none', 350); }
}

// ------------------------------------------------------------------ routing via the URL hash
// #fly=hailmary                       preset
// #fly=custom&kind=star&dest=…&veh=…  builder config, plus any changed vehicle numbers
function cfgToHash(c) {
  if (c.preset) return '#fly=' + c.preset;
  const q = new URLSearchParams({ fly: 'custom', kind: c.kind, dest: c.dest, veh: c.vehicle });
  if (c.kind === 'star') q.set('year', c.year);
  for (const [k, v] of Object.entries(c.params || {})) q.set('p.' + k, v);
  if (c.mission) q.set('m', c.mission);
  return '#' + q.toString();
}
function hashToCfg(h) {
  const q = new URLSearchParams(h.replace(/^#/, '')); const fly = q.get('fly'); if (!fly) return null;
  if (PRESETS[fly]) return { preset: fly, ...PRESETS[fly], vehicle: PRESETS[fly].vehicle, params: {}, year: 2035 };
  const params = {}; for (const [k, v] of q) if (k.startsWith('p.')) params[k.slice(2)] = v === 'true' ? true : v === 'false' ? false : +v;
  return { kind: q.get('kind'), dest: q.get('dest'), vehicle: q.get('veh'), year: +(q.get('year') || 2035), params, mission: +(q.get('m') || 0) };
}

async function route() {
  const cfg = hashToCfg(location.hash);
  if (!cfg) return showStart();
  try { await fly(cfg); } catch (e) { console.error(e); loading(false); showStart(); }
}

function showStart() {
  view = 'start'; $('app').hidden = true; $('start').hidden = false; Dash.togglePlay(false);
  if (!$('builder').hidden) return;
  closeBuilder(); setHero('mars');
}

async function ensureScene() {
  if (!sceneReady) sceneReady = (async () => {
    $('app').hidden = false;
    await View.initScene({ canvas: $('c'), host: $('scene'), labelLayer: $('labels'), tipEl: $('tip'), onPick: e => Dash.jumpTo(e) });
    initLayout(); Dash.bindTimeline(); Dash.bindRadControls();
    document.querySelectorAll('#scale button').forEach(b => b.onclick = () => { const v = b.dataset.s === 'true'; View.setScale(v); document.querySelectorAll('#scale button').forEach(x => x.classList.toggle('on', x === b)); });
    $('rel').onchange = e => View.setRelativistic(e.target.checked);
    $('home').onclick = () => { location.hash = ''; };
    $('edit').onclick = () => { location.hash = ''; openBuilder(current); $('app').hidden = true; $('start').hidden = false; view = 'start'; };
  })();
  return sceneReady;
}

async function fly(cfg) {
  loading(true, cfg.kind === 'star' ? 'Plotting course' : 'Loading trajectories');
  $('start').hidden = true; $('app').hidden = false; view = 'app';
  await ensureScene();
  const isPreset = !!cfg.preset;
  let data, title, sub;
  if (cfg.kind === 'star') {
    const s = starById(cfg.dest), v = STAR_VEHICLES.find(x => x.id === cfg.vehicle);
    data = buildInterstellar(s, v.id, cfg.params, cfg.year);
    title = isPreset ? cfg.title : `${v.name} to ${s.name}`;
    sub = `${s.ly.toFixed(1)} light years, ${v.tag.toLowerCase()}`;
  } else {
    const p = planetById(cfg.dest), v = SOLAR_VEHICLES.find(x => x.id === cfg.vehicle);
    data = await loadPlanetFile(cfg.dest);
    resizeAll(data, { ...v.p, ...cfg.params });
    title = isPreset ? cfg.title : `${v.name} to ${p.name}`;
    sub = isPreset ? `${data.missions.length} trajectory options, ${v.name}` : `${data.missions.length} trajectory options`;
  }
  current = { ...cfg, params: { ...(cfg.params || {}) } };
  $('mtitle').textContent = title; $('msub').textContent = sub; document.title = `${title} · Starship Mission Viewer`;
  Dash.load(data, cfg.mission || 0);
  loading(false);
}

// ------------------------------------------------------------------ start screen wiring
function bindStart() {
  document.querySelectorAll('.card').forEach(c => {
    c.addEventListener('pointerenter', () => setHero(c.dataset.hero));
    c.addEventListener('focus', () => setHero(c.dataset.hero));
    c.onclick = () => {
      if (c.dataset.preset) location.hash = cfgToHash({ preset: c.dataset.preset });
      else openBuilder();
    };
  });
  $('bback').onclick = () => { closeBuilder(); setHero('mars'); };
  initBuilder(cfg => { location.hash = cfgToHash(cfg); });
}

// ------------------------------------------------------------------ frame loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (view === 'start') renderHero(dt);
  else if (sceneReady) { Dash.tick(dt); View.render(dt); }
  requestAnimationFrame(frame);
}

// Old-style links (?file=mars.json&m=3&t=0.5&still=1) still open straight into the dashboard.
const legacyQ = new URLSearchParams(location.search);
function legacy() {
  const f = legacyQ.get('file'); if (!f || location.hash) return;
  const id = f.replace('.json', '');
  if (planetById(id)) history.replaceState(null, '', location.pathname + location.search + cfgToHash({ kind: 'planet', dest: id, vehicle: 'starship', params: {}, mission: +(legacyQ.get('m') || 0) }));
}
function legacyAfter() {
  if (!legacyQ.get('file')) return;
  if (legacyQ.get('scale') === 'enlarged') document.querySelector('#scale button[data-s=false]').click();
  if (legacyQ.get('t')) Dash.setT(+legacyQ.get('t'));
  if (legacyQ.get('play')) Dash.togglePlay(true);
  if (legacyQ.get('still')) { for (let k = 0; k < 90; k++) { Dash.tick(0.016); View.render(0.1); } window.stillDone = true; }
}

async function boot() {
  bindStart();
  await initHero();
  legacy();
  addEventListener('hashchange', route);
  await route();
  loading(false);
  legacyAfter();
  requestAnimationFrame(frame);
}
window.viewerReady = boot().then(() => true);

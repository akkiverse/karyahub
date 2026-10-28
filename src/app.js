import { createStore } from './store.js';
import { createActions } from './domain/actions.js';
import { getAdapters } from './adapters/index.js';
import { STEP_DELAY_MS } from './config.js';
import { icon } from './ui/icons.js';
import { home } from './views/home.js';
import { chat } from './views/chat.js';
import { jobs, job } from './views/jobs.js';
import { documentView } from './views/document.js';
import { renewals } from './views/renewals.js';
import { settings } from './views/settings.js';
import { prettyDate } from './format.js';
import { today } from './clock.js';
import { SAMPLES } from './data/demo.js';
import { api as defaultApi } from './api/client.js';

const HUB_URL = 'https://idea-studio-akkiverse.vercel.app';
const NAV = [
  ['home', 'Home', '#/', 'home'],
  ['chat', 'Chat', '#/chat', 'chat'],
  ['jobs', 'Jobs', '#/jobs', 'jobs'],
  ['renewals', 'Renewals', '#/renewals', 'renewals'],
  ['settings', 'Settings', '#/settings', 'settings'],
];

export function parseRoute(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'chat') return { name: 'chat', tab: 'chat' };
  if (a === 'jobs' && b) return { name: 'job', tab: 'jobs', params: { id: decodeURIComponent(b) } };
  if (a === 'jobs') return { name: 'jobs', tab: 'jobs' };
  if (a === 'doc' && b) return { name: 'doc', tab: 'jobs', params: { id: decodeURIComponent(b) } };
  if (a === 'renewals') return { name: 'renewals', tab: 'renewals' };
  if (a === 'settings') return { name: 'settings', tab: 'settings' };
  return { name: 'home', tab: 'home' };
}
const VIEWS = { home, chat, jobs, job, doc: documentView, renewals, settings };
const TITLES = { home: 'Home', chat: 'Chat', jobs: 'Jobs', job: 'Job', doc: 'Document', renewals: 'Renewals', settings: 'Settings' };

export function mountApp(root, options = {}) {
  const win = root.ownerDocument.defaultView;
  const store = options.store || createStore();
  const stepDelay = () => (options.stepDelay ?? STEP_DELAY_MS);
  const api = options.api || defaultApi;
  const actions = createActions({ store, getAdapters, stepDelay, api });
  const ui = { renewalsFilter: '30', editingCard: null, cardErrors: {}, sheet: null, toast: null, playing: null, draft: '', meta: null, plans: {}, wfBusy: null, wfNote: null, openTimeline: null };
  let alive = true;

  // Data the server works out for a screen, fetched when the screen opens (CR-0002).
  async function loadForRoute() {
    if (route.name === 'settings' && store.get().settings.mode === 'server' && !(ui.meta && ui.meta.data)) {
      ui.meta = null;
      try { ui.meta = { data: await api.meta() }; } catch (e) { ui.meta = { error: e.message }; }
      if (alive && route.name === 'settings') render();
    }
    if (route.name === 'job') loadPlan(route.params.id);
  }
  async function loadPlan(jobId, force = false) {
    const j = store.get().jobs.find((x) => x.id === jobId);
    if (!j || !j.amc_expiry) return;
    const cached = ui.plans[jobId];
    if (cached && !force && (cached.loading || cached.expiry === j.amc_expiry)) return;
    ui.plans[jobId] = { loading: true, expiry: j.amc_expiry };
    const res = await actions.amcPlan(jobId);
    ui.plans[jobId] = { ...res, expiry: j.amc_expiry };
    if (alive && route.name === 'job') render();
  }
  let route = parseRoute(win.location.hash);
  let lastRouteName = null;

  function applyTheme() {
    const t = store.get().settings.theme;
    const el = root.ownerDocument.documentElement;
    if (t === 'system') delete el.dataset.theme;
    else el.dataset.theme = t;
  }

  function render() {
    const state = store.get();
    const view = VIEWS[route.name];
    const html = view({ state, ui, params: route.params || {}, busy: actions.isBusy() });
    const thread = root.querySelector('.thread');
    const nearBottom = thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120 : true;
    const oldTop = thread ? thread.scrollTop : 0;
    root.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="shell route-${route.name}">
      <header class="topbar">
        <a class="brand" href="#/" aria-label="KaryaHub home"><span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 8v16M9 16l9-8M12.5 13l7.5 11" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="brand-name">KaryaHub</span></a>
        <span class="demo-pill" title="All data is dummy demo data">Demo · ${prettyDate(today())}</span>
      </header>
      <nav class="tabs" aria-label="Main">${NAV.map(([k, label, href, ic]) => `<a href="${href}" class="tab ${route.tab === k ? 'is-active' : ''}" ${route.tab === k ? 'aria-current="page"' : ''}>${icon(ic, { size: 22 })}<span>${label}</span></a>`).join('')}</nav>
      <main id="main" class="main">${html}
        <footer class="site-foot no-print"><a href="${HUB_URL}">Part of Idea Studio by AkkiVerse</a><span>Sample data only. No real messages are sent.</span></footer>
      </main>
    </div>`;
    const t2 = root.querySelector('.thread');
    if (t2) t2.scrollTop = nearBottom || route.name !== lastRouteName ? t2.scrollHeight : oldTop;
    if (route.name !== lastRouteName) {
      root.ownerDocument.title = `${TITLES[route.name]} · KaryaHub demo`;
      const h = root.querySelector('#page-title');
      if (lastRouteName !== null) { root.ownerDocument.documentElement.scrollTop = 0; if (h) h.focus({ preventScroll: true }); }
      lastRouteName = route.name;
    }
  }

  function navigate(hash) {
    if (win.location.hash !== hash) win.location.hash = hash;
    route = parseRoute(hash);
    ui.toast = null;
    ui.sheet = null;
    ui.wfNote = null;
    render();
    loadForRoute();
  }

  const routeKey = (r) => `${r.name}:${(r.params && r.params.id) || ''}`;
  const onHash = () => { const r = parseRoute(win.location.hash); if (routeKey(r) === routeKey(route)) return; route = r; ui.toast = null; ui.sheet = null; ui.wfNote = null; render(); loadForRoute(); };
  win.addEventListener('hashchange', onHash);
  const unsub = store.subscribe(() => { applyTheme(); render(); });

  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action;
    if (['edit-line', 'set-mode', 'set-theme', 'toggle-failure'].includes(a)) return; // handled on change
    e.preventDefault();
    if (a === 'send-sample') {
      const sample = SAMPLES.find((s) => s.id === el.dataset.sample);
      if (sample) await actions.send({ type: sample.kind, sample_id: sample.id });
    } else if (a === 'retry') await actions.retry(el.dataset.id);
    else if (a === 'edit-card') { ui.editingCard = el.dataset.id; render(); root.querySelector('[data-form="approve"] input')?.focus(); }
    else if (a === 'cancel-edit') { ui.editingCard = null; ui.cardErrors = {}; render(); }
    else if (a === 'approve') approve(el.dataset.id, {});
    else if (a === 'play-voice') { ui.playing = ui.playing === el.dataset.id ? null : el.dataset.id; render(); if (ui.playing) { const id = ui.playing; setTimeout(() => { if (ui.playing === id) { ui.playing = null; render(); } }, 3000); } }
    else if (a === 'create-doc') {
      const res = await actions.createDocument(el.dataset.job, el.dataset.type);
      if (res.docId) {
        navigate(`#/doc/${res.docId}`);
        ui.toast = res.error ? { where: 'doc', error: true, text: `Document created, but it couldn't be sent: ${res.error}` } : { where: 'doc', text: `${el.dataset.type === 'invoice' ? 'Invoice' : 'Quotation'} sent to ${store.get().jobs.find((j) => j.id === el.dataset.job).customer_name} on WhatsApp (simulated). See it in Chat.` };
        render();
      } else { ui.toast = { where: 'job', error: true, text: res.error }; render(); }
    } else if (a === 'download') win.print();
    else if (a === 'filter') { ui.renewalsFilter = el.dataset.filter; render(); }
    else if (a === 'remind') {
      const res = await actions.sendReminder(el.dataset.id);
      ui.sheet = { customerId: el.dataset.id, text: res.text, error: res.error || '' };
      render();
      root.querySelector('.sheet .icon-btn')?.focus();
    } else if (a === 'close-sheet') { ui.sheet = null; render(); }
    else if (a === 'wf') await runTransition(el.dataset.job, el.dataset.wf, {});
    else if (a === 'reload-plan') loadPlan(el.dataset.job, true);
    else if (a === 'reset') { actions.reset(); ui.editingCard = null; ui.cardErrors = {}; ui.toast = { where: 'settings', text: 'Demo reset. Jobs, documents, chat and reminders are back to the bundled demo data.' }; render(); }
  }

  async function runTransition(jobId, action, payload) {
    if (ui.wfBusy) return;
    ui.wfBusy = jobId; ui.openTimeline = null; render();
    const res = await actions.transition(jobId, action, payload);
    ui.wfBusy = null;
    if (res.error) ui.wfNote = { job: jobId, error: true, text: res.error };
    else if (action === 'request_otp') ui.wfNote = { job: jobId, text: 'Code sent to the customer (simulated). Ask them for it when the work is done.' };
    else if (action === 'verify_otp') ui.wfNote = { job: jobId, text: 'Verified. The customer confirmed the work with their code.' };
    else if (action === 'close') ui.wfNote = { job: jobId, text: 'Job closed with proof of work.' };
    else ui.wfNote = null;
    render();
    if (res.error) root.querySelector('[data-form="verify-otp"] input')?.focus();
    else root.querySelector('[data-form="verify-otp"] input, .pow-controls .btn')?.focus();
  }

  function approve(id, edits) {
    const res = actions.approve(id, edits);
    if (res.errors) { ui.cardErrors = { [id]: res.errors }; ui.editingCard = id; render(); root.querySelector('[aria-invalid="true"]')?.focus(); return; }
    ui.editingCard = null; ui.cardErrors = {}; render();
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'send-text') {
      const text = form.elements.text.value.trim();
      if (!text) return;
      ui.draft = '';
      actions.send({ type: 'text', text });
    } else if (form.dataset.form === 'verify-otp') {
      const code = form.elements.code.value.replace(/\D/g, '');
      if (code.length !== 6) { ui.wfNote = { job: form.dataset.job, error: true, text: 'Enter the 6-digit code the customer received.' }; render(); root.querySelector('[data-form="verify-otp"] input')?.focus(); return; }
      const j = store.get().jobs.find((x) => x.id === form.dataset.job);
      runTransition(form.dataset.job, 'verify_otp', { code, challenge: (j && j.otp && j.otp.challenge) || '' });
    } else if (form.dataset.form === 'approve') {
      const edits = {};
      form.querySelectorAll('input[data-field]').forEach((i) => { edits[i.dataset.field] = i.dataset.field === 'amc_value' ? (i.value === '' ? '' : Number(i.value)) : i.value.trim(); });
      approve(form.dataset.id, edits);
    }
  }

  function onChange(e) {
    const el = e.target;
    const a = el.dataset.action;
    if (a === 'edit-line') actions.updateDocumentLine(el.dataset.doc, Number(el.dataset.index), { [el.dataset.key]: el.value === '' ? NaN : Number(el.value) });
    else if (a === 'set-mode') { actions.setSetting('mode', el.value); loadForRoute(); }
    else if (a === 'set-theme') actions.setSetting('theme', el.value);
    else if (a === 'toggle-failure') actions.setSetting('simulate_failure', el.checked);
  }
  function onInput(e) { if (e.target.id === 'composer-input') ui.draft = e.target.value; }
  function onKey(e) { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); } }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.ownerDocument.addEventListener('keydown', onKey);
  applyTheme();
  render();
  loadForRoute();

  return {
    store, actions, ui, navigate, render,
    unmount() { alive = false; win.removeEventListener('hashchange', onHash); unsub(); root.innerHTML = ''; root.ownerDocument.removeEventListener('keydown', onKey); },
  };
}

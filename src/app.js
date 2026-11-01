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
import { prettyDate, escapeHtml } from './format.js';
import { today } from './clock.js';
import { SAMPLES } from './data/demo.js';
import { createApiClient, ApiUnreachable } from './api/client.js';
import { createSession } from './session.js';
import { can, canOpen, landingFor, roleName, initials, PERMISSIONS, normalisePhone } from './domain/access.js';
import { signIn, forgotPin, resetPin, setupScreen, mustChangePin, loadingScreen, unreachableScreen, logo } from './views/signin.js';
import { admin, denied } from './views/admin.js';
import { businesses } from './views/businesses.js';
import { account } from './views/account.js';
import { jobsheetImage } from './data/jobsheet.js';
import { createSync } from './sync.js';
import { syncChip, syncBanner } from './views/syncstatus.js';
import { resizeLogo } from './data/logo.js';
import { inventory, itemPage, itemForm, inventoryImport, resultsHtml, chipsHtml, pickRows, CSV_TEMPLATE } from './views/inventory.js';
import { qtyText, signedText, stockOf, matches as itemMatches, nameOf, parseQty, r3 } from './domain/inventory.js';

const HUB_URL = 'https://idea-studio-akkiverse.vercel.app';
// [route, label, href, icon, section, on the phone tab bar]
const NAV = [
  ['home', 'Home', '#/', 'home', 'Workspace', true],
  ['chat', 'Chat', '#/chat', 'chat', 'Workspace', true],
  ['jobs', 'Jobs', '#/jobs', 'jobs', 'Workspace', true],
  ['inventory', 'Inventory', '#/inventory', 'box', 'Workspace', true],
  ['renewals', 'Renewals', '#/renewals', 'renewals', 'Workspace', true],
  ['businesses', 'Businesses', '#/businesses', 'building', 'Platform', true],
  ['admin', 'Admin', '#/admin', 'users', 'Manage', false], // on the phone it is in the account menu, so the tab bar keeps five places
  ['settings', 'Settings', '#/settings', 'settings', 'Manage', false],
];

export function parseRoute(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  const [a, b, c, d] = h.split('/');
  if (a === 'inventory') {
    if (b === 'new') return { name: 'item-form', tab: 'inventory', params: {} };
    if (b === 'import') return { name: 'inventory-import', tab: 'inventory' };
    if (b === 'item' && c && d === 'edit') return { name: 'item-form', tab: 'inventory', params: { id: decodeURIComponent(c) } };
    if (b === 'item' && c) return { name: 'item', tab: 'inventory', params: { id: decodeURIComponent(c) } };
    return { name: 'inventory', tab: 'inventory' };
  }
  if (a === 'chat') return { name: 'chat', tab: 'chat' };
  if (a === 'jobs' && b) return { name: 'job', tab: 'jobs', params: { id: decodeURIComponent(b) } };
  if (a === 'jobs') return { name: 'jobs', tab: 'jobs' };
  if (a === 'doc' && b) return { name: 'doc', tab: 'jobs', params: { id: decodeURIComponent(b) } };
  if (a === 'renewals') return { name: 'renewals', tab: 'renewals' };
  if (a === 'settings') return { name: 'settings', tab: 'settings' };
  if (a === 'admin') return { name: 'admin', tab: 'admin' };
  if (a === 'businesses') return { name: 'businesses', tab: 'businesses' };
  if (a === 'account') return { name: 'account', tab: 'account' };
  return { name: 'home', tab: 'home' };
}
const VIEWS = { home, chat, jobs, job, doc: documentView, renewals, settings, admin, businesses, account, inventory, item: itemPage, 'item-form': itemForm, 'inventory-import': inventoryImport };
const TITLES = { home: 'Home', chat: 'Chat', jobs: 'Jobs', job: 'Job', doc: 'Document', renewals: 'Renewals', settings: 'Settings', admin: 'Admin', businesses: 'Businesses', account: 'My account', signin: 'Sign in', inventory: 'Inventory', item: 'Item', 'item-form': 'Item', 'inventory-import': 'Import items' };

const PERMISSION_LABELS = PERMISSIONS;
// What the submit button says while the server is working (the button is switched off meanwhile).
const WORKING = { 'add-staff': 'Adding…', 'import-staff': 'Importing…', 'add-business': 'Creating…', 'business-profile': 'Saving…', 'account-pin': 'Changing…' };
function showWorking(form, label) {
  const btn = form.querySelector('button[type="submit"]');
  form.dataset.busy = '1';
  if (!btn) return () => {};
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${label}`;
  return () => {
    // Most results redraw the page; if this form is still there (an error), switch it back on.
    if (!form.isConnected) return;
    delete form.dataset.busy;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = html;
  };
}
const OFFLINE = "Couldn't reach the KaryaHub server. Check your connection and try again.";
const msg = (e) => (e instanceof ApiUnreachable ? OFFLINE : e.message);

export function mountApp(root, options = {}) {
  const win = root.ownerDocument.defaultView;
  const store = options.store || createStore();
  const stepDelay = () => (options.stepDelay ?? STEP_DELAY_MS);
  const session = options.session || createSession();
  const api = options.api || createApiClient({ onSessionEnded: () => endSession('Your session ended. Please sign in again.') });
  // The signed-in person as the screens use it: who they are plus what the server says they may do.
  const meOf = () => {
    const s = session.get();
    return s ? { ...s.user, permissions: s.permissions, business: s.business } : null;
  };
  // Business data on the server (CR-0009): the queue of changes and the on-device copy. Real businesses only.
  const sync = options.sync || createSync({
    store, api, win, storage: win.localStorage,
    debounceMs: options.syncDelay ?? 300, pollMs: options.syncPoll ?? 30000, ...(options.syncRetry ? { retryMs: options.syncRetry } : {}),
    onChange: () => paintSync(),
  });
  const actions = createActions({
    store, getAdapters, stepDelay, api, currentUser: meOf, photoImage: options.photoImage || jobsheetImage,
    ensureSynced: async (jobId) => (sync.status().active ? sync.flushFor('job', jobId) : true),
    // The photo's text as the AI reads it (CR-0010). Kept on screen only; the chat saves the finished text.
    onStream: (id, text) => {
      if (text == null) delete ui.streaming[id];
      else ui.streaming[id] = text;
      if (route.name === 'chat') render();
    },
    onIdle: () => { if (route.name === 'chat') render(); },
  });
  const logoImage = options.logoImage || resizeLogo;
  const ui = {
    boot: 'loading', auth: {}, authState: null, admin: {}, businesses: {}, account: {}, profile: {},
    streaming: {}, warmedAt: 0, inv: { dismissed: {} },
    renewalsFilter: '30', editingCard: null, cardErrors: {}, sheet: null, toast: null, playing: null, draft: '', meta: null, plans: {}, wfBusy: null, wfNote: null, openTimeline: null,
  };
  let alive = true;

  // ---------- who is signed in ----------
  function applySession(me) {
    session.set(me);
    if (me && me.signed_in && me.business) store.switchTo(me.business);
    ui.auth = {};
    ui.admin = {};
    ui.businesses = {};
    ui.account = {};
    ui.profile = {};
    ui.inv = { dismissed: {} };
    ui.meta = null;
    if (me && me.signed_in && me.business && !me.business.is_demo && !me.user.must_change_pin) sync.start(me.business);
    else sync.stop();
  }
  /** Update the sync mark and banner in place, so a background update never wipes what someone is typing. */
  function paintSync() {
    if (!alive) return;
    const st = sync.status();
    const chip = root.querySelector('[data-slot="sync-chip"]');
    const banner = root.querySelector('[data-slot="sync-banner"]');
    if (chip) chip.innerHTML = syncChip(st);
    if (banner) banner.innerHTML = syncBanner(st);
  }
  async function loadAuthState() {
    try { ui.authState = await api.authState(); } catch { ui.authState = { needs_setup: false, demo_accounts: [] }; }
  }
  async function endSession(notice) {
    sync.stop();
    session.end();
    store.close();
    ui.admin = {}; ui.businesses = {}; ui.profile = {}; ui.account = {}; ui.inv = { dismissed: {} }; ui.meta = null;
    ui.auth = { notice };
    await loadAuthState();
    if (alive) render();
  }
  async function boot() {
    ui.boot = 'loading';
    ui.bootError = null;
    render();
    try {
      const me = await api.me();
      if (me.signed_in) applySession(me);
      else await loadAuthState();
      ui.boot = 'ready';
    } catch (e) {
      ui.boot = 'error';
      ui.bootError = e instanceof ApiUnreachable ? null : { message: e.message, code: e.code };
    }
    if (!alive) return;
    render();
    loadForRoute();
  }

  // Data the server works out for a screen, fetched when the screen opens (CR-0002, CR-0005).
  async function loadForRoute() {
    const me = meOf();
    if (!me) return;
    if (route.name === 'settings' && store.get().settings.mode === 'server' && !(ui.meta && ui.meta.data)) {
      ui.meta = null;
      try { ui.meta = { data: await api.meta() }; } catch (e) { ui.meta = { error: e.message }; }
      if (alive && route.name === 'settings') render();
    }
    if (route.name === 'chat') warmAi(me);
    if (route.name === 'job') loadPlan(route.params.id);
    if (route.name === 'admin' && can(me, 'manage_team') && !ui.admin.data) loadAdmin();
    if (route.name === 'businesses' && can(me, 'manage_businesses') && !ui.businesses.list) loadBusinesses();
  }
  // Opening Chat asks the server to load the AI models now, so the first message doesn't wait for them (CR-0010).
  // Quietly, at most every 5 minutes; nothing is shown if it fails.
  const WARM_EVERY_MS = 5 * 60 * 1000;
  function warmAi(me) {
    if (store.get().settings.mode !== 'server' || !can(me, 'use_chat') || typeof api.warmAi !== 'function') return;
    if (ui.warmedAt && Date.now() - ui.warmedAt < WARM_EVERY_MS) return;
    ui.warmedAt = Date.now();
    api.warmAi().catch(() => { ui.warmedAt = 0; });
  }
  async function loadAdmin(extra = {}) {
    if (extra.credentials && extra.credentials.length) ui.focusNext = '[data-testid="admin-credentials"]';
    else if (extra.notice) ui.focusNext = '[data-testid="admin-notice"]';
    try {
      const [data, log] = await Promise.all([api.team(), api.audit()]);
      ui.admin = { ...ui.admin, ...extra, data, audit: log.entries, error: '' };
    } catch (e) {
      ui.admin = { ...ui.admin, ...extra, error: msg(e) };
    }
    if (alive && route.name === 'admin') render();
  }
  async function loadBusinesses(extra = {}) {
    if (extra.issued) ui.focusNext = '[data-testid="biz-credentials"]';
    else if (extra.notice) ui.focusNext = '[data-testid="biz-notice"]';
    try {
      ui.businesses = { ...ui.businesses, ...extra, list: (await api.businesses()).businesses, error: '' };
    } catch (e) {
      ui.businesses = { ...ui.businesses, ...extra, error: msg(e) };
    }
    if (alive && route.name === 'businesses') render();
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

  function shell(me, html) {
    const allowed = NAV.filter(([k]) => canOpen(me, k));
    const sections = [...new Set(allowed.map((n) => n[4]))];
    const link = ([k, label, href, ic]) => `<a href="${href}" class="tab ${route.tab === k ? 'is-active' : ''}" ${route.tab === k ? 'aria-current="page"' : ''}>${icon(ic, { size: 20 })}<span>${label}</span></a>`;
    const demo = Boolean(me.business && me.business.is_demo);
    const biz = me.business ? me.business.name : 'KaryaHub platform';
    return `
    <a class="skip" href="#main">Skip to content</a>
    <div class="shell route-${route.name}">
      <header class="topbar">
        <a class="brand" href="${landingFor(me)}" aria-label="KaryaHub, start page"><span class="logo" aria-hidden="true">${logo()}</span><span class="brand-name">KaryaHub</span></a>
        <span class="topbar-biz"><strong>${escapeHtml(biz)}</strong></span>
        <span class="topbar-right">
          ${demo ? `<span class="demo-pill" title="All data is dummy demo data">Demo · ${prettyDate(today())}</span>` : ''}
          <span data-slot="sync-chip">${syncChip(sync.status())}</span>
          <details class="account" data-testid="account-menu">
            <summary aria-label="Account: ${escapeHtml(me.name)}, ${escapeHtml(roleName(me.role))}"><span class="avatar avatar-${me.role}" aria-hidden="true">${escapeHtml(initials(me.name))}</span><span class="account-name">${escapeHtml(me.name.split(' ')[0])}</span></summary>
            <div class="account-menu">
              <p><strong>${escapeHtml(me.name)}</strong><span class="muted small" data-testid="current-role">${escapeHtml(roleName(me.role))}</span></p>
              <a href="#/account" class="menu-item">${icon('user', { size: 18 })} My account</a>
              ${can(me, 'manage_settings') ? `<a href="#/settings" class="menu-item">${icon('settings', { size: 18 })} Settings</a>` : ''}
              ${can(me, 'manage_team') ? `<a href="#/admin" class="menu-item">${icon('users', { size: 18 })} Admin</a>` : ''}
              <button type="button" class="menu-item" data-action="sign-out">${icon('logout', { size: 18 })} Sign out</button>
            </div>
          </details>
        </span>
      </header>
      <nav class="tabs" aria-label="Main">
        <a class="brand nav-brand" href="${landingFor(me)}" aria-label="KaryaHub, start page"><span class="logo" aria-hidden="true">${logo()}</span><span class="brand-name">KaryaHub</span></a>
        <div class="nav-biz"><span class="nav-biz-mark" aria-hidden="true">${escapeHtml(initials(biz))}</span><span><strong>${escapeHtml(biz)}</strong><span class="small">${demo ? 'Demo workspace' : me.business ? 'Business workspace' : 'Platform admin'}</span></span></div>
        ${sections.map((sec) => `<div class="nav-group"><span class="nav-label">${sec}</span>${allowed.filter((n) => n[4] === sec).map(link).join('')}</div>`).join('')}
        <div class="nav-user"><span class="avatar avatar-${me.role}" aria-hidden="true">${escapeHtml(initials(me.name))}</span><span class="nav-user-main"><strong>${escapeHtml(me.name)}</strong><span class="muted small">${escapeHtml(roleName(me.role))}</span></span><button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icon('logout', { size: 18 })}</button></div>
      </nav>
      <nav class="bottom-tabs" aria-label="Main (phone)">${allowed.filter((n) => n[5]).map(link).join('')}</nav>
      <main id="main" class="main"><div data-slot="sync-banner">${syncBanner(sync.status())}</div>${html}
        <footer class="site-foot no-print"><a href="${HUB_URL}">Part of Idea Studio by AkkiVerse</a>${demo ? '<span>Sample data only. No real messages are sent.</span>' : ''}</footer>
      </main>
    </div>`;
  }

  function authScreen() {
    const props = { ui, hubUrl: HUB_URL };
    const screens = { forgot: forgotPin, reset: resetPin, setup: setupScreen };
    return `<main id="main" class="auth-main">${(screens[ui.auth.screen] || signIn)(props)}</main>`;
  }

  // "Reading the message… 12 s" (CR-0010): the seconds change without redrawing the page, so typing isn't disturbed.
  function paintTimers() {
    root.querySelectorAll('.ai-timer[data-started]').forEach((el) => {
      const started = Number(el.dataset.started) || Date.now();
      el.textContent = `${Math.max(0, Math.floor((Date.now() - started) / 1000))} s`;
    });
  }
  const timerTick = win.setInterval ? win.setInterval(() => { if (alive && actions.isBusy()) paintTimers(); }, 1000) : null;

  function render() {
    if (!alive) return;
    const state = store.get();
    if (ui.boot === 'loading') { root.innerHTML = loadingScreen(); return; }
    if (ui.boot === 'error') { root.innerHTML = unreachableScreen(ui.bootError); return; }
    const me = meOf();
    const name = me ? route.name : 'signin';
    const thread = root.querySelector('.thread');
    const nearBottom = thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120 : true;
    const oldTop = thread ? thread.scrollTop : 0;
    if (!me) {
      root.innerHTML = authScreen();
    } else if (me.must_change_pin) {
      root.innerHTML = `<main id="main" class="auth-main">${mustChangePin({ ui, me, hubUrl: HUB_URL })}</main>`;
    } else {
      const allow = (perm) => can(me, perm);
      const props = { state, ui, params: route.params || {}, busy: actions.isBusy(), me, allow, permissionLabels: PERMISSION_LABELS };
      const html = canOpen(me, route.name) ? VIEWS[route.name](props) : denied({ me, routeName: TITLES[route.name] || route.name });
      root.innerHTML = shell(me, html);
    }
    paintTimers();
    if (ui.inv.focusNext) {
      const target = root.querySelector(ui.inv.focusNext);
      ui.inv.focusNext = null;
      target?.focus({ preventScroll: true });
    }
    const t2 = root.querySelector('.thread');
    if (t2) t2.scrollTop = nearBottom || name !== lastRouteName ? t2.scrollHeight : oldTop;
    if (ui.focusNext) {
      // Results appear away from the button that caused them (new PINs at the top of the page), so bring them into view.
      const target = root.querySelector(ui.focusNext);
      if (target) {
        ui.focusNext = null;
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView?.({ block: 'start', behavior: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        target.focus({ preventScroll: true });
      }
    }
    if (name !== lastRouteName) {
      root.ownerDocument.title = `${TITLES[name]} · KaryaHub${me && me.business && me.business.is_demo ? ' demo' : ''}`;
      const h = root.querySelector('#page-title');
      if (lastRouteName !== null) { root.ownerDocument.documentElement.scrollTop = 0; if (h) h.focus({ preventScroll: true }); }
      lastRouteName = name;
    }
  }

  function navigate(hash) {
    if (win.location.hash !== hash) win.location.hash = hash;
    route = parseRoute(hash);
    ui.toast = null;
    ui.sheet = null;
    ui.wfNote = null;
    leaveInventoryRoute();
    render();
    loadForRoute();
  }

  const routeKey = (r) => `${r.name}:${(r.params && r.params.id) || ''}`;
  // Inventory (CR-0011): a sheet closes and a notice is forgotten when the person goes to another screen.
  const noticeKey = (r) => (r.name === 'inventory' ? 'inventory' : r.name === 'item' ? `item:${r.params.id}` : r.name === 'job' ? `job:${r.params.id}` : '');
  function leaveInventoryRoute() {
    ui.inv.sheet = null;
    if (ui.inv.notice && ui.inv.notice.at !== noticeKey(route)) ui.inv.notice = null;
  }
  const onHash = () => { const r = parseRoute(win.location.hash); if (routeKey(r) === routeKey(route)) return; route = r; ui.toast = null; ui.sheet = null; ui.wfNote = null; leaveInventoryRoute(); render(); loadForRoute(); };
  win.addEventListener('hashchange', onHash);
  // Something that arrived from the server must not redraw the page under a finger that is typing.
  let renderWhenDone = false;
  const typing = () => {
    const a = root.ownerDocument.activeElement;
    return Boolean(a && root.contains(a) && a.matches('input, textarea, select') && (a.closest('form') || a.matches('[data-inv-search], [data-pick-search]')));
  };
  const unsub = store.subscribe((st, meta) => {
    applyTheme();
    if (meta && meta.remote && typing()) { renderWhenDone = true; return; }
    render();
  });
  root.addEventListener('focusout', () => { if (renderWhenDone) setTimeout(() => { renderWhenDone = false; if (!typing()) render(); else renderWhenDone = true; }, 0); });

  const focus = (sel) => root.querySelector(sel)?.focus();
  const setNotice = (target, text, error = false) => { target.notice = { text, error }; };

  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action;
    if (['edit-line', 'set-mode', 'set-theme', 'toggle-failure', 'set-role', 'member-permission', 'role-permission', 'pick-csv', 'pick-logo', 'pick-inv-csv'].includes(a)) return; // handled on change
    if (a !== 'download') e.preventDefault();
    if (a === 'use-demo') {
      ui.auth = { phone: el.dataset.phone, pin: el.dataset.pin };
      render();
      focus('form[data-form="signin"] button[type="submit"]');
      return;
    }
    if (a === 'auth-screen') {
      const typed = root.querySelector('input[name="phone"]');
      ui.auth = { screen: el.dataset.screen === 'signin' ? undefined : el.dataset.screen, phone: typed ? typed.value : (ui.auth.phone || '') };
      render();
      focus('#main input, #main button[type="submit"]');
      return;
    }
    if (a === 'retry-boot') { boot(); return; }
    if (a.startsWith('inv-')) { await onInventoryAction(a, el); return; }
    if (a === 'dismiss-sync-notice') { sync.dismissNotice(); return; }
    if (a === 'dismiss-sync-rejected') { sync.dismissRejected(); return; }
    if (a === 'goto-add-person') {
      // A link to "#admin-add" would be read as a page address and sent Home; scroll to the form instead.
      const section = root.querySelector('#admin-add');
      section?.scrollIntoView?.({ block: 'start', behavior: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      root.querySelector('#admin-add input[name="name"]')?.focus({ preventScroll: true });
      return;
    }
    if (a === 'remove-logo') {
      if (el.disabled) return;
      el.disabled = true;
      try {
        const saved = await api.removeLogo();
        session.set({ ...session.get(), business: saved });
        ui.profile = { notice: { text: 'The logo is removed.' } };
      } catch (err) { ui.profile = { notice: { text: msg(err), error: true } }; }
      ui.focusNext = '[data-testid="profile-notice"]';
      render();
      return;
    }
    if (a === 'sign-out') {
      try { await api.signOut(); } catch { /* the cookie ends on its own after 12 hours */ }
      await endSession('You have signed out.');
      return;
    }
    if (a === 'reload-admin') { ui.admin = {}; loadAdmin(); return; }
    if (a === 'dismiss-credentials') { ui.admin.credentials = null; render(); return; }
    if (a === 'dismiss-issued') { ui.businesses.issued = null; render(); return; }
    if (a === 'reset-pin') {
      if (el.disabled) return;
      el.disabled = true; // one press at a time
      el.setAttribute('aria-busy', 'true');
      const m = (ui.admin.data?.members || []).find((x) => x.id === el.dataset.staff);
      try {
        const res = await api.resetMemberPin(el.dataset.staff);
        await loadAdmin({ credentials: [{ name: res.name, phone: m ? m.phone : '', role: m ? m.role : '', pin: res.pin }], notice: { text: `New PIN made for ${res.name}. They choose their own at next sign-in.` } });
      } catch (err) { setNotice(ui.admin, msg(err), true); render(); }
      return;
    }
    if (a === 'toggle-access') {
      if (el.disabled) return;
      el.disabled = true; // one press at a time
      el.setAttribute('aria-busy', 'true');
      try {
        const res = await api.updateMember(el.dataset.staff, { active: el.dataset.active === 'true' });
        await loadAdmin({ notice: { text: `${res.name}: access ${res.active ? 'turned on' : 'turned off'}.` } });
      } catch (err) { setNotice(ui.admin, msg(err), true); render(); }
      return;
    }
    if (a === 'toggle-business') {
      if (el.disabled) return;
      el.disabled = true; // one press at a time
      el.setAttribute('aria-busy', 'true');
      try {
        const res = await api.setBusinessActive(el.dataset.business, el.dataset.active === 'true');
        await loadBusinesses({ notice: { text: `${res.name} is now ${res.active ? 'on' : 'turned off'}.` } });
      } catch (err) { ui.businesses.notice = { text: msg(err), error: true }; render(); }
      return;
    }
    if (a === 'reset-owner-pin') {
      if (el.disabled) return;
      el.disabled = true; // one press at a time
      el.setAttribute('aria-busy', 'true');
      try {
        const res = await api.resetOwnerPin(el.dataset.owner);
        const owner = (ui.businesses.list || []).flatMap((b) => b.owners).find((o) => o.id === el.dataset.owner);
        await loadBusinesses({ issued: { name: res.name, phone: owner ? owner.phone : '', pin: res.pin }, notice: null });
      } catch (err) { ui.businesses.notice = { text: msg(err), error: true }; render(); }
      return;
    }
    if (a === 'send-sample') {
      const sample = SAMPLES.find((s) => s.id === el.dataset.sample);
      if (sample) await actions.send({ type: sample.kind, sample_id: sample.id });
    } else if (a === 'retry') await actions.retry(el.dataset.id);
    else if (a === 'stop-ai') actions.stop();
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

  // ---------- inventory (CR-0011) ----------
  const SHORT_SIGNAL = 'Importing needs a signal, because each code is checked against your whole business. Try again when the signal is back.';
  function invNotice(at, text, error = false) { ui.inv.notice = { at, text, error }; }
  /** Redraw only the list and its chips, so the search box keeps the cursor while someone types. */
  function paintInv() {
    const st = store.get();
    const me = meOf();
    const allow = (perm) => can(me, perm);
    const results = root.querySelector('[data-slot="inv-results"]');
    const chips = root.querySelector('[data-slot="inv-chips"]');
    if (results) results.innerHTML = resultsHtml(st, ui, allow);
    if (chips) chips.innerHTML = chipsHtml(st, ui);
  }
  function openSheet(sheet) { ui.inv.sheet = sheet; ui.inv.focusNext = '.sheet [data-autofocus]'; render(); }
  function downloadTemplate() {
    const a = root.ownerDocument.createElement('a');
    a.href = win.URL.createObjectURL(new win.Blob([`﻿${CSV_TEMPLATE}`], { type: 'text/csv' }));
    a.download = 'karyahub-inventory-template.csv';
    a.click();
    setTimeout(() => win.URL.revokeObjectURL(a.href), 1000);
  }
  async function checkCsv(file, text) {
    ui.inv.csv = { file, text, checking: true };
    ui.inv.csvResult = '';
    render();
    try {
      const res = await api.inventoryImport({ text, name: file, check: true });
      ui.inv.csv = { file, text, rows: res.rows, counts: res.counts };
    } catch (err) {
      ui.inv.csv = { file, text, error: err instanceof ApiUnreachable ? SHORT_SIGNAL : msg(err) };
    }
    if (alive && route.name === 'inventory-import') render();
  }
  async function importCsv() {
    const c = ui.inv.csv;
    if (!c || !c.rows || c.saving) return;
    ui.inv.csv = { ...c, saving: true };
    render();
    try {
      const res = await api.inventoryImport({ text: c.text, name: c.file, check: false });
      const done = res.imported;
      ui.inv.csvResult = `Imported from ${escapeHtml(c.file)}: <strong>${done.added} new</strong>, <strong>${done.updated} updated</strong>${res.counts.same ? `, ${res.counts.same} already up to date` : ''}.${done.skipped ? ` ${done.skipped} row${done.skipped === 1 ? ' was' : 's were'} skipped: fix ${done.skipped === 1 ? 'it' : 'them'} in the file and import it again.` : ''} <a href="#/inventory">See the inventory</a>`;
      ui.inv.csv = null;
      sync.flush(); // bring the new items to this phone now
    } catch (err) {
      ui.inv.csv = { ...c, saving: false, error: err instanceof ApiUnreachable ? SHORT_SIGNAL : msg(err) };
    }
    if (alive && route.name === 'inventory-import') render();
  }
  const tookText = (res) => `Took ${qtyText(res.qty, res.item.unit)} of ${res.item.name} for this job.${res.short ? ` Only ${qtyText(res.had, res.item.unit)} was in stock: it shows as short until someone counts.` : ''}`;
  async function onInventoryAction(a, el) {
    const stock = actions.stock;
    const itemId = route.params && route.params.id;
    if (a === 'inv-filter') { ui.inv.filter = el.dataset.filter; paintInv(); return; }
    if (a === 'inv-add') { ui.inv.prefill = el.dataset.name || ''; ui.inv.form = null; navigate('#/inventory/new'); return; }
    if (a === 'inv-sheet') { openSheet({ type: el.dataset.type, item: itemId, values: {}, errors: {} }); return; }
    if (a === 'inv-close-sheet') { ui.inv.sheet = null; render(); return; }
    if (a === 'inv-stop') {
      const res = stock.setStopped(itemId, el.dataset.stopped === 'true');
      const it = store.get().items.find((i) => i.id === itemId);
      invNotice(`item:${itemId}`, res.error || (it.stopped ? `Stopped using ${it.name}. It is under the Stopped chip, with its history, and is no longer offered for jobs.` : `${it.name} is in use again.`), Boolean(res.error));
      render();
      return;
    }
    if (a === 'inv-pick') { openSheet({ type: 'pick', job: el.dataset.job, item: null, q: '', values: {}, errors: {} }); return; }
    if (a === 'inv-pick-item') { openSheet({ ...ui.inv.sheet, item: el.dataset.item, values: {}, errors: {} }); return; }
    if (a === 'inv-pick-again') { openSheet({ ...ui.inv.sheet, item: null, q: '', values: {}, errors: {} }); return; }
    if (a === 'inv-take') {
      const res = stock.takePart(el.dataset.job, el.dataset.item, el.dataset.qty, el.dataset.seg);
      invNotice(`job:${el.dataset.job}`, res.error || tookText(res), Boolean(res.error));
      render();
      return;
    }
    if (a === 'inv-dismiss') {
      ui.inv.dismissed[el.dataset.job] = [...(ui.inv.dismissed[el.dataset.job] || []), el.dataset.seg];
      render();
      return;
    }
    if (a === 'inv-remove') {
      const res = stock.removePart(el.dataset.job, el.dataset.item);
      invNotice(`job:${el.dataset.job}`, res.error || `Put ${qtyText(res.qty, res.item.unit)} of ${res.item.name} back in stock.`, Boolean(res.error));
      render();
      return;
    }
    if (a === 'inv-template') { downloadTemplate(); return; }
    if (a === 'inv-do-import') { await importCsv(); return; }
    if (a === 'inv-clear-csv') { ui.inv.csv = null; ui.inv.csvResult = ''; render(); return; }
    if (a === 'inv-check-again' && ui.inv.csv) await checkCsv(ui.inv.csv.file, ui.inv.csv.text);
  }
  function submitInventory(form) {
    const kind = form.dataset.form;
    const v = Object.fromEntries(new FormData(form).entries());
    const stock = actions.stock;
    if (kind === 'inv-item') {
      const id = form.dataset.item || null;
      const res = stock.saveItem(v, id);
      if (res.errors || res.error) {
        ui.inv.form = { key: id || 'new', values: v, errors: res.errors || { name: res.error } };
        ui.inv.focusNext = '[aria-invalid="true"]';
        render();
        return;
      }
      ui.inv.form = null;
      ui.inv.prefill = '';
      const name = String(v.name).trim();
      if (id) { invNotice(`item:${id}`, `Saved ${name}.`); navigate(`#/inventory/item/${encodeURIComponent(id)}`); }
      else { invNotice('inventory', `Added ${name}${res.opening ? ` with ${qtyText(res.opening, v.unit)} in stock` : ''}.`); navigate('#/inventory'); }
      return;
    }
    const sh = ui.inv.sheet;
    if (!sh) return;
    const at = sh.job ? `job:${sh.job}` : `item:${sh.item}`;
    const fail = (res) => { ui.inv.sheet = { ...sh, values: v, errors: res.errors }; ui.inv.focusNext = '[aria-invalid="true"]'; render(); };
    if (sh.type === 'pick') {
      const res = stock.takePart(sh.job, sh.item, v.qty);
      if (res.errors) { fail(res); return; }
      ui.inv.sheet = null;
      invNotice(at, res.error || tookText(res), Boolean(res.error));
      render();
      return;
    }
    const res = stock.move(sh.item, sh.type, v);
    if (res.errors) { fail(res); return; }
    ui.inv.sheet = null;
    const it = store.get().items.find((i) => i.id === sh.item);
    if (res.error) invNotice(at, res.error, true);
    else if (res.same) invNotice(at, 'Count matches. Nothing to change.');
    else {
      const m = res.move;
      const st = sync.status();
      const saved = st.active && st.state === 'offline' ? ' Saved on this phone; it will be sent when the signal returns.' : '';
      const what = sh.type === 'in' ? `Added ${qtyText(Math.abs(m.qty), it.unit)} to ${it.name}.` : sh.type === 'out' ? `Took ${qtyText(Math.abs(m.qty), it.unit)} of ${it.name} out.` : `Count saved: ${signedText(m.qty, it.unit)} as a correction.`;
      invNotice(at, `${what} In stock: ${qtyText(stockOf(store.get(), it), it.unit)}.${saved}`);
    }
    render();
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

  async function submitAuth(form) {
    const kind = form.dataset.form;
    const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
    if (kind === 'signin') {
      const phone = v('phone');
      ui.auth = { phone, busy: true };
      render();
      try {
        const me = await api.signIn(phone, v('pin'));
        applySession(me);
        const u = meOf();
        const target = !u.must_change_pin && canOpen(u, route.name) && !(route.name === 'home' && !can(u, 'view_dashboard')) ? (win.location.hash || '#/') : landingFor(u);
        navigate(target);
      } catch (err) {
        ui.auth = { phone, error: msg(err) };
        render();
        focus('form[data-form="signin"] input[name="pin"]');
      }
    } else if (kind === 'forgot') {
      const phone = v('phone');
      ui.auth = { screen: 'forgot', phone, busy: true };
      render();
      try {
        const res = await api.forgotPin(phone);
        ui.auth = { screen: 'reset', phone: normalisePhone(phone), demoCode: res.demo_code || '', notice: res.message };
      } catch (err) {
        ui.auth = { screen: 'forgot', phone, error: msg(err) };
      }
      render();
      focus('#main input');
    } else if (kind === 'reset') {
      const phone = ui.auth.phone;
      if (v('pin') !== v('pin2')) { ui.auth = { ...ui.auth, error: "The two PINs don't match." }; render(); focus('input[name="pin"]'); return; }
      ui.auth = { ...ui.auth, busy: true, error: '' };
      render();
      try {
        await api.resetPin(phone, v('code'), v('pin'));
        ui.auth = { phone, notice: 'Your PIN is changed. Sign in with the new one.' };
      } catch (err) {
        ui.auth = { screen: 'reset', phone, demoCode: ui.auth.demoCode, error: msg(err) };
      }
      render();
      focus('#main input');
    } else if (kind === 'setup') {
      const body = { token: v('token'), name: v('name'), phone: v('phone'), pin: v('pin') };
      ui.auth = { screen: 'setup', name: body.name, phone: body.phone, busy: true };
      render();
      try {
        await api.bootstrap(body);
        await loadAuthState();
        ui.auth = { phone: normalisePhone(body.phone), notice: 'The platform admin is ready. Sign in with your mobile number and PIN.' };
      } catch (err) {
        ui.auth = { screen: 'setup', name: body.name, phone: body.phone, error: msg(err) };
      }
      render();
      focus('#main input');
    } else if (kind === 'change-pin') {
      if (v('pin') !== v('pin2')) { ui.auth = { error: "The two PINs don't match." }; render(); focus('input[name="pin"]'); return; }
      ui.auth = { busy: true };
      render();
      try {
        await api.changePin(v('current'), v('pin'));
        applySession(await api.me());
        navigate(landingFor(meOf()));
      } catch (err) {
        ui.auth = { error: msg(err) };
        render();
        focus('input[name="current"]');
      }
    }
  }

  async function submitTeam(form) {
    const kind = form.dataset.form;
    const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
    if (kind === 'add-staff') {
      const data = { name: v('name'), phone: v('phone'), role: v('role'), pin: v('pin') };
      try {
        const res = await api.addMember({ name: data.name, phone: data.phone, role: data.role, ...(data.pin ? { pin: data.pin } : {}), must_change_pin: true });
        await loadAdmin({ form: {}, errors: {}, notice: { text: `${res.member.name} was added as ${roleName(res.member.role)}.` }, credentials: [{ name: res.member.name, phone: res.member.phone, role: res.member.role, pin: res.pin }] });
      } catch (err) {
        ui.admin = { ...ui.admin, form: { ...data, pin: '' }, errors: { message: msg(err) } };
        render();
        focus('[data-testid="add-error"]');
      }
    } else if (kind === 'import-staff') {
      const csv = v('csv') || ui.admin.csv || '';
      try {
        const res = await api.importMembers(csv);
        const added = res.created.length;
        await loadAdmin({ csv: '', importResult: res, credentials: res.created, notice: { text: `${added} ${added === 1 ? 'person' : 'people'} added${res.errors.length ? `, ${res.errors.length} row${res.errors.length === 1 ? ' needs' : 's need'} fixing` : ''}.`, error: !added && res.errors.length > 0 } });
      } catch (err) {
        ui.admin = { ...ui.admin, csv, notice: { text: msg(err), error: true } };
        render();
      }
    } else if (kind === 'add-business') {
      const data = { name: v('name'), address: v('address'), gstin: v('gstin').toUpperCase(), state_code: v('state_code') || '27', owner_name: v('owner_name'), owner_phone: v('owner_phone'), ...(v('owner_pin') ? { owner_pin: v('owner_pin') } : {}) };
      try {
        const res = await api.createBusiness(data);
        await loadBusinesses({ form: {}, formError: '', issued: { name: res.owner.name, phone: res.owner.phone, pin: res.pin }, notice: { text: `${res.business.name} was created.` } });
      } catch (err) {
        ui.businesses = { ...ui.businesses, form: { ...data, owner_pin: '' }, formError: msg(err) };
        render();
        focus('[data-testid="biz-error"]');
      }
    } else if (kind === 'business-profile') {
      const fields = { name: v('name'), address: v('address'), gstin: v('gstin').toUpperCase() };
      try {
        const saved = await api.saveBusinessProfile(fields);
        const cur = session.get();
        session.set({ ...cur, business: saved });
        store.update((s) => { s.settings.business_name = saved.name; s.settings.address = saved.address; s.settings.gstin = saved.gstin; });
        ui.profile = { notice: { text: 'Saved. Your quotes and reminders now use these details.' } };
        ui.focusNext = '[data-testid="profile-notice"]';
      } catch (err) {
        ui.profile = { ...fields, notice: { text: msg(err), error: true } };
        ui.focusNext = '[data-testid="profile-notice"]';
      }
      render();
    } else if (kind === 'account-pin') {
      if (v('pin') !== v('pin2')) { ui.account = { notice: { text: "The two new PINs don't match.", error: true } }; render(); return; }
      try {
        await api.changePin(v('current'), v('pin'));
        ui.account = { notice: { text: 'Your PIN is changed.' } };
      } catch (err) {
        ui.account = { notice: { text: msg(err), error: true } };
      }
      ui.focusNext = '[data-testid="account-notice"]';
      render();
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    if (['signin', 'forgot', 'reset', 'setup', 'change-pin'].includes(kind)) { submitAuth(form); return; }
    if (['add-staff', 'import-staff', 'add-business', 'business-profile', 'account-pin'].includes(kind)) {
      if (form.dataset.busy === '1') return; // a second press while the first is still working
      const done = showWorking(form, WORKING[kind]);
      Promise.resolve(submitTeam(form)).finally(done);
      return;
    }
    if (kind === 'inv-sheet' || kind === 'inv-item') { submitInventory(form); return; }
    if (kind === 'send-text') {
      const text = form.elements.text.value.trim();
      if (!text) return;
      ui.draft = '';
      actions.send({ type: 'text', text });
    } else if (kind === 'verify-otp') {
      const code = form.elements.code.value.replace(/\D/g, '');
      if (code.length !== 6) { ui.wfNote = { job: form.dataset.job, error: true, text: 'Enter the 6-digit code the customer received.' }; render(); root.querySelector('[data-form="verify-otp"] input')?.focus(); return; }
      const j = store.get().jobs.find((x) => x.id === form.dataset.job);
      runTransition(form.dataset.job, 'verify_otp', { code, challenge: (j && j.otp && j.otp.challenge) || '' });
    } else if (kind === 'approve') {
      const edits = {};
      form.querySelectorAll('input[data-field]').forEach((i) => { edits[i.dataset.field] = i.dataset.field === 'amc_value' ? (i.value === '' ? '' : Number(i.value)) : i.value.trim(); });
      approve(form.dataset.id, edits);
    }
  }

  async function onChange(e) {
    const el = e.target;
    const a = el.dataset.action;
    if (a === 'edit-line') actions.updateDocumentLine(el.dataset.doc, Number(el.dataset.index), { [el.dataset.key]: el.value === '' ? NaN : Number(el.value) });
    else if (a === 'set-mode') { actions.setSetting('mode', el.value); loadForRoute(); }
    else if (a === 'set-theme') actions.setSetting('theme', el.value);
    else if (a === 'toggle-failure') actions.setSetting('simulate_failure', el.checked);
    else if (a === 'pick-logo') {
      const file = el.files && el.files[0];
      if (!file) return;
      try {
        const saved = await api.saveLogo(await logoImage(file));
        session.set({ ...session.get(), business: saved });
        ui.profile = { notice: { text: 'Saved. The logo now shows on your quotes and invoices.' } };
      } catch (err) { ui.profile = { notice: { text: err && err.message ? msg(err) : "That picture couldn't be used. Choose a PNG, JPEG or WebP.", error: true } }; }
      ui.focusNext = '[data-testid="profile-notice"]';
      render();
    } else if (a === 'pick-csv') {
      const file = el.files && el.files[0];
      if (!file) return;
      const text = await file.text();
      ui.admin = { ...ui.admin, csv: text };
      render();
    } else if (a === 'pick-inv-csv') {
      const file = el.files && el.files[0];
      if (!file) return;
      await checkCsv(file.name, await file.text());
    } else if (a === 'set-role') {
      try {
        const res = await api.updateMember(el.dataset.staff, { role: el.value });
        await loadAdmin({ notice: { text: `${res.name} is now ${roleName(res.role)}.` } });
      } catch (err) { ui.admin = { ...ui.admin, notice: { text: msg(err), error: true } }; await loadAdmin(); }
    } else if (a === 'member-permission') {
      try {
        const res = await api.memberPermissions(el.dataset.staff, { [el.dataset.permission]: el.value });
        await loadAdmin({ notice: { text: `Access updated for ${res.name}.` } });
      } catch (err) { ui.admin = { ...ui.admin, notice: { text: msg(err), error: true } }; await loadAdmin(); }
    } else if (a === 'role-permission') {
      try {
        await api.rolePermissions(el.dataset.role, { [el.dataset.permission]: el.checked });
        await loadAdmin({ notice: { text: `Access updated for everyone with the ${roleName(el.dataset.role)} role.` } });
      } catch (err) { ui.admin = { ...ui.admin, notice: { text: msg(err), error: true } }; await loadAdmin(); }
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'composer-input') ui.draft = t.value;
    else if (t.matches('[data-inv-search]')) { ui.inv.q = t.value; paintInv(); }
    else if (t.matches('[data-pick-search]') && ui.inv.sheet) {
      ui.inv.sheet.q = t.value;
      const list = root.querySelector('[data-slot="pick-results"]');
      if (list) list.innerHTML = pickRows(store.get(), t.value);
    } else if (t.matches('[data-qty]') && ui.inv.sheet && ui.inv.sheet.item) {
      // A hint under the quantity while it is typed: what a count would record, or that a job will use more than there is.
      const st = store.get();
      const it = st.items.find((i) => i.id === ui.inv.sheet.item);
      const q = it ? parseQty(t.value, it.unit) : { ok: false };
      const diff = root.querySelector('[data-slot="inv-diff"]');
      const change = q.ok ? r3(q.value - stockOf(st, it)) : null;
      if (diff) diff.textContent = change == null ? '' : change === 0 ? 'Count matches. Nothing to change.' : `This records ${signedText(change, it.unit)} as a count correction.`;
      const short = root.querySelector('[data-slot="pick-short"]');
      if (short) short.hidden = !(q.ok && q.value > stockOf(st, it));
    }
  }
  function onKey(e) {
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
    else if (e.key === 'Escape' && ui.inv.sheet) { ui.inv.sheet = null; render(); }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.ownerDocument.addEventListener('keydown', onKey);
  applyTheme();

  // Tests hand in who is signed in; the real app asks the server.
  let ready;
  if (options.me !== undefined) {
    if (options.me && options.me.signed_in) applySession(options.me);
    ui.authState = options.authState || { needs_setup: false, demo_accounts: [] };
    ui.boot = 'ready';
    render();
    loadForRoute();
    ready = Promise.resolve();
  } else {
    ready = boot();
  }

  return {
    store, actions, session, ui, navigate, render, ready,
    sync,
    unmount() { alive = false; if (timerTick) win.clearInterval(timerTick); sync.stop(); win.removeEventListener('hashchange', onHash); unsub(); root.innerHTML = ''; root.ownerDocument.removeEventListener('keydown', onKey); },
  };
}

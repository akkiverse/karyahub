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
import { today, deviceToday } from './clock.js';
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
import { syncChip, syncBanner, storageBanner } from './views/syncstatus.js';
import { resizeLogo } from './data/logo.js';
import { inventory, itemPage, itemForm, inventoryImport, resultsHtml, chipsHtml, filtersHtml, pickRows, csvTemplate } from './views/inventory.js';
import { fieldsScreen } from './views/fields.js';
import { STARTER_FIELDS } from './domain/fields.js';
import { splitCsv } from './domain/csv.js';
import { qtyText, signedText, stockOf, matches as itemMatches, nameOf, parseQty, r3, applyUnits } from './domain/inventory.js';
import { billsList, billEditor, billView, setupScreen as businessSetup, newMenu } from './views/bills.js';
import { createBills } from './bills-app.js';
import { applyTheme, setThemePref, toggleTheme, themeToggle, themePref, watchSystemTheme } from './theme.js';
import { searchBox, searchResults } from './views/search.js';
import { W } from './words.js';
import { dmy } from './domain/inventory.js';

const HUB_URL = 'https://idea-studio-akkiverse.vercel.app';
// [route, label, href, icon, section, on the phone tab bar]
const NAV = [
  ['home', 'Home', '#/', 'home', 'Workspace', true],
  ['bills', 'Bills', '#/bills', 'file', 'Workspace', true], // CR-0012: Bills joins the phone tab bar
  ['chat', 'Chat', '#/chat', 'chat', 'Workspace', true],
  ['jobs', 'Jobs', '#/jobs', 'jobs', 'Workspace', true],
  ['inventory', 'Inventory', '#/inventory', 'box', 'Workspace', true],
  ['renewals', 'Renewals', '#/renewals', 'renewals', 'Workspace', false], // on the phone: the account menu, so the bar keeps five places
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
    if (b === 'fields') return { name: 'inventory-fields', tab: 'inventory' };
    if (b === 'item' && c && d === 'edit') return { name: 'item-form', tab: 'inventory', params: { id: decodeURIComponent(c) } };
    if (b === 'item' && c) return { name: 'item', tab: 'inventory', params: { id: decodeURIComponent(c) } };
    return { name: 'inventory', tab: 'inventory' };
  }
  if (a === 'bills' || a === 'estimates') {
    const type = a === 'bills' ? 'invoice' : 'quote';
    if (b === 'new') return { name: 'bill-new', tab: 'bills', params: { type } };
    if (a === 'bills' && b && c === 'edit') return { name: 'bill-edit', tab: 'bills', params: { id: decodeURIComponent(b) } };
    if (a === 'bills' && b) return { name: 'bill', tab: 'bills', params: { id: decodeURIComponent(b) } };
    return { name: a, tab: 'bills' };
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
const billNew = () => '<section class="page"><h1 id="page-title" tabindex="-1">New</h1></section>';
const VIEWS = { bills: (p) => billsList({ ...p, kind: 'invoice' }), estimates: (p) => billsList({ ...p, kind: 'quote' }), bill: billView, 'bill-edit': billEditor, 'bill-new': billNew, home, chat, jobs, job, doc: documentView, renewals, settings, admin, businesses, account, inventory, item: itemPage, 'item-form': itemForm, 'inventory-import': inventoryImport, 'inventory-fields': fieldsScreen };
const TITLES = { bills: 'Bills', estimates: 'Estimates', bill: 'Bill', 'bill-edit': 'Bill', 'bill-new': 'New', setup: 'Your business', home: 'Home', chat: 'Chat', jobs: 'Jobs', job: 'Job', doc: 'Document', renewals: 'Renewals', settings: 'Settings', admin: 'Admin', businesses: 'Businesses', account: 'My account', signin: 'Sign in', inventory: 'Inventory', item: 'Item', 'item-form': 'Item', 'inventory-import': 'Import items', 'inventory-fields': 'Item details' };

const PERMISSION_LABELS = PERMISSIONS;
// The one + New button (AC-26.5) sits on the main screens, not where a bottom bar or form needs the corner.
// From 900 px it is the button at the right of the top bar, on these screens too (the corner is free there, CR-0015).
const NEW_ON = new Set(['home', 'bills', 'estimates', 'jobs', 'inventory', 'renewals', 'admin', 'settings']);
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
  const remembered = (key) => { try { return win.localStorage.getItem(key); } catch { return null; } };
  const remember = (key, value) => { try { win.localStorage.setItem(key, value); } catch { /* it still works for this visit */ } };
  const ui = {
    homeView: remembered('kh-home-view') === 'kanban' ? 'kanban' : 'table', heroHidden: remembered('kh-home-hero') === 'hidden', homeTeam: 0,
    boot: 'loading', auth: {}, authState: null, admin: {}, businesses: {}, account: {}, profile: {},
    streaming: {}, warmedAt: 0, inv: { dismissed: {} }, fields: {},
    renewalsFilter: '30', editingCard: null, cardErrors: {}, sheet: null, toast: null, playing: null, draft: '', meta: null, plans: {}, wfBusy: null, wfNote: null, openTimeline: null,
  };
  let alive = true;
  const bills = createBills({ store, api, session, sync, ui, render: () => render(), navigate: (h) => navigate(h), root, win, meOf, msg });

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
    if (banner) banner.innerHTML = syncBanner(st) + storageBanner(store.storage());
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
    if (route.name === 'bill-new') {
      const d = bills.load(route);
      if (d) win.history?.replaceState?.(null, '', `#/bills/${encodeURIComponent(d.id)}/edit`);
      return;
    }
    bills.load(route);
    if (route.name === 'chat') warmAi(me);
    if (route.name === 'home' && can(me, 'manage_team') && typeof api.team === 'function') loadHomeTeam(); // the checklist's "Add your team"
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
  async function loadHomeTeam() {
    try {
      const count = (await api.team()).members.length;
      if (count !== ui.homeTeam) { ui.homeTeam = count; if (alive && route.name === 'home') render(); }
    } catch { /* offline: the checklist just doesn't tick it yet */ }
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
  let lastEntered = null;

  // ---------- theme, side menu and search in the top bar (CR-0015): changed in place, so nothing being typed is redrawn ----------
  function paintTheme() {
    root.querySelectorAll('[data-slot="theme-toggle"]').forEach((el) => { el.outerHTML = themeToggle(win); });
    root.querySelectorAll('input[name="theme"]').forEach((el) => { el.checked = el.value === themePref(win); });
  }
  function setNav(open, { focusBack = true } = {}) {
    ui.navOpen = open;
    root.querySelector('.shell')?.classList.toggle('nav-open', open);
    const btn = root.querySelector('.nav-toggle');
    if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? W.closeMenu : W.openMenu); }
    if (open) root.querySelector('#side-nav a')?.focus();
    else if (focusBack) btn?.focus();
  }
  function paintSearch(open = true) {
    const panel = root.querySelector('[data-slot="gs-results"]');
    const me = meOf();
    if (!panel || !me) return;
    const st = store.get();
    const html = searchResults(st, me, ui.gs, st.settings.is_demo ? today() : deviceToday());
    panel.innerHTML = html;
    panel.hidden = !(open && html);
  }

  function shell(me, html) {
    const allowed = NAV.filter(([k]) => canOpen(me, k));
    const sections = [...new Set(allowed.map((n) => n[4]))];
    const link = ([k, label, href, ic]) => `<a href="${href}" class="tab ${route.tab === k ? 'is-active' : ''}" ${route.tab === k ? 'aria-current="page"' : ''}>${icon(ic, { size: 20 })}<span>${label}</span></a>`;
    const demo = Boolean(me.business && me.business.is_demo);
    const biz = me.business ? me.business.name : 'KaryaHub platform';
    return `
    <a class="skip" href="#main">Skip to content</a>
    <div class="shell route-${route.name} ${ui.navOpen ? 'nav-open' : ''}">
      <header class="topbar">
        <button type="button" class="icon-btn nav-toggle" data-action="toggle-nav" aria-controls="side-nav" aria-expanded="${ui.navOpen ? 'true' : 'false'}" aria-label="${ui.navOpen ? W.closeMenu : W.openMenu}">${icon('menu', { size: 22 })}</button>
        <div class="crumbs">
          <span class="topbar-biz"><strong>${escapeHtml(biz)}</strong></span>
          <nav class="crumb" aria-label="Breadcrumb" data-testid="breadcrumb"><span class="crumb-root">${W.crumbWorkspace}</span><span class="crumb-sep" aria-hidden="true">/</span><span class="crumb-here" aria-current="page">${escapeHtml(TITLES[route.name] || '')}</span></nav>
        </div>
        ${searchBox(ui)}
        <span class="topbar-right">
          ${demo ? `<span class="demo-pill" title="All data is dummy demo data">Demo · ${prettyDate(today())}</span>` : ''}
          <span data-slot="sync-chip">${syncChip(sync.status())}</span>
          ${themeToggle(win)}
          <details class="account" data-testid="account-menu">
            <summary aria-label="Account: ${escapeHtml(me.name)}, ${escapeHtml(roleName(me.role))}"><span class="avatar avatar-${me.role}" aria-hidden="true">${escapeHtml(initials(me.name))}</span><span class="account-name">${escapeHtml(me.name.split(' ')[0])}</span></summary>
            <div class="account-menu">
              <p><strong>${escapeHtml(me.name)}</strong><span class="muted small" data-testid="current-role">${escapeHtml(roleName(me.role))}</span></p>
              <a href="#/account" class="menu-item">${icon('user', { size: 18 })} My account</a>
              ${can(me, 'manage_renewals') ? `<a href="#/renewals" class="menu-item menu-phone">${icon('renewals', { size: 18 })} Renewals</a>` : ''}
              ${can(me, 'manage_settings') ? `<a href="#/settings" class="menu-item">${icon('settings', { size: 18 })} Settings</a>` : ''}
              ${can(me, 'manage_team') ? `<a href="#/admin" class="menu-item">${icon('users', { size: 18 })} Admin</a>` : ''}
              <button type="button" class="menu-item" data-action="sign-out">${icon('logout', { size: 18 })} Sign out</button>
            </div>
          </details>
        </span>
      </header>
      <div class="nav-backdrop" data-action="close-nav"></div>
      <nav class="tabs" id="side-nav" aria-label="Main">
        <a class="brand nav-brand" href="${landingFor(me)}" aria-label="KaryaHub, start page"><span class="logo" aria-hidden="true">${logo()}</span><span class="brand-name">KaryaHub</span></a>
        <div class="nav-biz"><span class="nav-biz-mark" aria-hidden="true">${escapeHtml(initials(biz))}</span><span><strong>${escapeHtml(biz)}</strong><span class="small">${demo ? 'Demo workspace' : me.business ? 'Business workspace' : 'Platform admin'}</span></span></div>
        ${sections.map((sec) => `<div class="nav-group"><span class="nav-label">${sec}</span>${allowed.filter((n) => n[4] === sec).map(link).join('')}</div>`).join('')}
        <div class="nav-user"><span class="avatar avatar-${me.role}" aria-hidden="true">${escapeHtml(initials(me.name))}</span><a class="nav-user-main" href="#/account" title="My account"><strong>${escapeHtml(me.name)}</strong><span class="muted small">${escapeHtml(roleName(me.role))}</span></a><button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icon('logout', { size: 18 })}</button></div>
      </nav>
      <nav class="bottom-tabs" aria-label="Main (phone)">${allowed.filter((n) => n[5]).map(link).join('')}</nav>
      <main id="main" class="main"><div data-slot="sync-banner">${syncBanner(sync.status())}${storageBanner(store.storage())}</div><div class="view" data-slot="view">${html}</div>
        ${NEW_ON.has(route.name) ? newMenu(me, ui.newOpen) : ''}
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
      const props = { state, ui, params: route.params || {}, busy: actions.isBusy(), me, allow, permissionLabels: PERMISSION_LABELS, today: state.settings.is_demo ? today() : deviceToday() };
      // AC-26.1: a business not yet set up asks its owner once what kind of business it is.
      const asking = me.business && me.business.setup_needed && allow('manage_settings') && route.name !== 'account';
      const html = asking ? businessSetup(props) : canOpen(me, route.name) ? VIEWS[route.name](props) : denied({ me, routeName: TITLES[route.name] || route.name });
      root.innerHTML = shell(me, html);
    }
    paintTimers();
    if (ui.inv.focusNext) {
      const target = root.querySelector(ui.inv.focusNext);
      ui.inv.focusNext = null;
      target?.focus({ preventScroll: !ui.inv.scrollNext });
      if (ui.inv.scrollNext && target) target.scrollIntoView?.({ block: 'center' }); // the item details screen is long: bring the form or the answer into view
      ui.inv.scrollNext = false;
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
    // Page and tab change: the entrance plays only when the screen changes, never on a redraw of the same screen (CR-0015).
    const entering = routeKey(route);
    if (entering !== lastEntered) {
      if (lastEntered !== null) root.querySelector('[data-slot="view"]')?.classList.add('view-enter');
      lastEntered = entering;
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
    ui.newOpen = false;
    ui.navOpen = false;
    ui.gs = '';
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
    if (route.name !== 'inventory-fields') ui.fields = {};
    if (route.name !== 'item-form') ui.inv.form = null; // a form left unsaved is not kept for next time
    if (ui.inv.notice && ui.inv.notice.at !== noticeKey(route)) ui.inv.notice = null;
  }
  const onHash = () => { const r = parseRoute(win.location.hash); if (routeKey(r) === routeKey(route)) return; route = r; ui.newOpen = false; ui.navOpen = false; ui.gs = ''; ui.toast = null; ui.sheet = null; ui.wfNote = null; leaveInventoryRoute(); render(); loadForRoute(); };
  win.addEventListener('hashchange', onHash);
  // Something that arrived from the server must not redraw the page under a finger that is typing.
  let renderWhenDone = false;
  const typing = () => {
    const a = root.ownerDocument.activeElement;
    return Boolean(a && root.contains(a) && a.matches('input, textarea, select') && (a.closest('form') || a.matches('[data-inv-search], [data-pick-search], [data-global-search]')));
  };
  applyUnits(store.get().units);
  const unsub = store.subscribe((st, meta) => {
    applyUnits(st.units);
    // The item form and the item details screen are where a person is typing: what arrives from the server must not redraw them (CR-0014).
    if (meta && meta.remote && ['item-form', 'inventory-fields'].includes(route.name) && root.querySelector('form[data-form^="inv-"]')) return; // (a screen still waiting for its data is drawn when it arrives)
    if (meta && meta.remote && typing()) { renderWhenDone = true; return; }
    render();
  });
  root.addEventListener('focusout', () => { if (renderWhenDone) setTimeout(() => { renderWhenDone = false; if (!typing()) render(); else renderWhenDone = true; }, 0); });

  const focus = (sel) => root.querySelector(sel)?.focus();
  const setNotice = (target, text, error = false) => { target.notice = { text, error }; };

  async function onClick(e) {
    if (ui.navOpen && e.target.closest('#side-nav a')) setNav(false, { focusBack: false });
    if (e.target.closest('.gs-panel a')) { ui.gs = ''; const box = root.querySelector('[data-global-search]'); if (box) box.value = ''; paintSearch(false); }
    else if (ui.gs && !e.target.closest('.gs')) paintSearch(false); // a press elsewhere closes the results and keeps what was typed
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action;
    if (['edit-line', 'set-mode', 'set-theme', 'toggle-failure', 'set-role', 'member-permission', 'role-permission', 'pick-csv', 'pick-logo', 'pick-inv-csv', 'pick-signature', 'bill-more'].includes(a)) return; // handled on change
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
    if (a === 'toggle-theme') { toggleTheme(win); paintTheme(); root.querySelector('[data-slot="theme-toggle"]')?.focus(); return; }
    if (a === 'toggle-nav') { setNav(!ui.navOpen); return; }
    if (a === 'close-nav') { setNav(false); return; }
    if (a === 'home-view') {
      ui.homeView = el.dataset.view === 'kanban' ? 'kanban' : 'table';
      remember('kh-home-view', ui.homeView);
      render();
      if (el.dataset.scroll) root.querySelector('#home-recent')?.scrollIntoView?.({ block: 'start', behavior: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      root.querySelector(`#home-recent [data-view="${ui.homeView}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (a === 'home-hero') {
      ui.heroHidden = el.dataset.hide === 'true';
      remember('kh-home-hero', ui.heroHidden ? 'hidden' : 'shown');
      render();
      root.querySelector(ui.heroHidden ? '[data-testid="hero-show"]' : '[data-testid="hero-hide"]')?.focus({ preventScroll: true });
      return;
    }
    if (a.startsWith('inv-')) { await onInventoryAction(a, el); return; }
    if (a.startsWith('bill-') && (await bills.onClick(a, el))) return;
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
      // AC-29.4 (CR-0012): Make estimate and Make bill open the editor with the job's lines and parts used.
      const res = bills.fromJob(el.dataset.job, el.dataset.type);
      if (res.error) { ui.toast = { where: 'job', error: true, text: res.error }; render(); }
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
    a.href = win.URL.createObjectURL(new win.Blob([`﻿${csvTemplate(store.get())}`], { type: 'text/csv' }));
    a.download = 'karyahub-inventory-template.csv';
    a.click();
    setTimeout(() => win.URL.revokeObjectURL(a.href), 1000);
  }
  // A file of more than 500 rows is sent in parts of 500 (the server takes that many at once); the answers are joined.
  async function runCsv(text, name, check) {
    const parts = splitCsv(text, 500);
    const join = { rows: [], counts: { new: 0, update: 0, same: 0, problem: 0, unit: 0 }, adds: { units: [], lists: [] }, unknown: [], imported: { added: 0, updated: 0, skipped: 0 } };
    let offset = 0;
    for (const part of parts) {
      const res = await api.inventoryImport({ text: part.text, name, check });
      join.rows.push(...res.rows.map((r) => ({ ...r, row: r.row + offset })));
      for (const k of Object.keys(join.counts)) join.counts[k] += res.counts[k] || 0;
      for (const u of (res.adds && res.adds.units) || []) if (!join.adds.units.includes(u)) join.adds.units.push(u);
      for (const l of (res.adds && res.adds.lists) || []) {
        const at = join.adds.lists.find((x) => x.field === l.field);
        if (at) at.values.push(...l.values.filter((v) => !at.values.includes(v))); else join.adds.lists.push({ field: l.field, values: [...l.values] });
      }
      for (const u of res.unknown_columns || []) if (!join.unknown.includes(u)) join.unknown.push(u);
      if (res.imported) for (const k of Object.keys(join.imported)) join.imported[k] += res.imported[k] || 0;
      offset += part.rows;
    }
    return join;
  }
  async function checkCsv(file, text) {
    ui.inv.csv = { file, text, checking: true };
    ui.inv.csvResult = '';
    render();
    try {
      const res = await runCsv(text, file, true);
      ui.inv.csv = { file, text, rows: res.rows, counts: res.counts, adds: res.adds, unknown: res.unknown };
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
      const res = await runCsv(c.text, c.file, false);
      const done = res.imported;
      ui.inv.csvResult = `Imported from ${escapeHtml(c.file)}: <strong>${done.added} new</strong>, <strong>${done.updated} updated</strong>${res.counts.same ? `, ${res.counts.same} already up to date` : ''}.${done.skipped ? ` ${done.skipped} ${done.skipped === 1 ? 'row was' : 'rows were'} skipped: fix ${done.skipped === 1 ? 'it' : 'them'} in the file and import again.` : ''}`;
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
    if (a === 'inv-step') {
      // − and + in the table (CR-0015): an ordinary stock move of one, written in the item's history like any other.
      const { item: id, dir } = el.dataset;
      const res = dir === 'in'
        ? stock.move(id, 'in', { qty: '1', date: dmy(store.get().settings.is_demo ? today() : deviceToday()), note: 'Added with + in the list' })
        : stock.move(id, 'out', { qty: '1', reason: 'other', note: 'Taken with − in the list' });
      const problem = res.error || (res.errors && Object.values(res.errors)[0]);
      if (problem) invNotice('inventory', problem, true);
      ui.inv.focusNext = `[data-inv-step="${id}:${dir}"]`;
      render();
      return;
    }
    if (a === 'inv-add') { ui.inv.prefill = el.dataset.name || ''; ui.inv.form = null; navigate('#/inventory/new'); return; }
    if (a === 'inv-sheet') { openSheet({ type: el.dataset.type, item: itemId, values: {}, errors: {} }); return; }
    if (a === 'inv-close-sheet') { ui.inv.sheet = null; render(); return; }
    if (a === 'inv-hist-unit') { ui.inv.histUnit = el.dataset.unit; render(); return; }
    if (a === 'inv-add-unit' || a === 'inv-remove-unit') { editSellRows(a === 'inv-add-unit' ? null : Number(el.dataset.i)); return; }
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
    // ----- the business's own item details (CR-0013)
    if (a.startsWith('inv-field') || a.startsWith('inv-entry') || a.startsWith('inv-unit')) { onFieldAction(a, el); return; }
    if (a === 'inv-template') { downloadTemplate(); return; }
    if (a === 'inv-do-import') { await importCsv(); return; }
    if (a === 'inv-clear-csv') { ui.inv.csv = null; ui.inv.csvResult = ''; render(); return; }
    if (a === 'inv-check-again' && ui.inv.csv) await checkCsv(ui.inv.csv.file, ui.inv.csv.text);
  }
  // The rows of "Also sold as" on the item form (CR-0014): keep what was typed, then add a row or take one off.
  function editSellRows(removeAt) {
    const form = root.querySelector('form[data-form="inv-item"]');
    if (!form) return;
    const v = Object.fromEntries(new FormData(form).entries());
    const rows = [];
    for (let i = 0; Object.prototype.hasOwnProperty.call(v, `sell_unit_${i}`); i += 1) rows.push(i);
    const keys = ['unit', 'sale', 'cost', 'low', 'cut_from', 'cut_gives', 'opening'];
    const kept = rows.filter((i) => i !== removeAt).map((i) => Object.fromEntries(keys.map((k) => [k, v[`sell_${k}_${i}`] ?? ''])));
    for (const i of rows) for (const k of keys) delete v[`sell_${k}_${i}`];
    if (removeAt == null) kept.push(Object.fromEntries(keys.map((k) => [k, ''])));
    kept.forEach((row, i) => keys.forEach((k) => { v[`sell_${k}_${i}`] = row[k]; }));
    ['price_includes_gst', 'service'].forEach((k) => { if (v[k] === undefined) v[k] = ''; });
    ui.inv.form = { key: form.dataset.item || 'new', values: v, errors: {} };
    const was = root.ownerDocument.activeElement && root.ownerDocument.activeElement.name;
    render();
    if (removeAt === 'keep') root.querySelector(`[name="${was}"]`)?.focus(); // only a redraw: the cursor stays where it was
    else root.querySelector(`[name="sell_unit_${removeAt == null ? kept.length - 1 : Math.max(0, Math.min(removeAt, kept.length - 1))}"]`)?.focus();
  }
  // What is typed on the item form is kept in step as it is typed, so a redraw (or a tap that lands on a redrawn button) never empties it.
  function rememberItemForm(field) {
    const form = field && field.closest ? field.closest('form[data-form="inv-item"]') : null;
    if (!form) return;
    ui.inv.form = { key: form.dataset.item || 'new', values: Object.fromEntries(new FormData(form).entries()), errors: (ui.inv.form && ui.inv.form.key === (form.dataset.item || 'new') && ui.inv.form.errors) || {} };
  }
  // The item details screen: a notice after each change, an error stays on its form.
  function fieldsNote(text, error = false) { ui.fields = { notice: { text, error } }; ui.inv.focusNext = '[data-testid="fields-notice"]'; ui.inv.scrollNext = true; }
  function onFieldAction(a, el) {
    const fa = actions.fields;
    const me = meOf();
    if (a === 'inv-field-edit') ui.fields = { editing: el.dataset.id };
    else if (a === 'inv-field-cancel' || a === 'inv-entry-cancel') ui.fields = {};
    else if (a === 'inv-field-stop') {
      const r = fa.setFieldStopped(el.dataset.id, el.dataset.stopped === 'true');
      const f = store.get().item_fields.find((x) => x.id === el.dataset.id);
      fieldsNote(r.error || (f.stopped ? `${f.name} is stopped. Its values stay on the items, and you can use it again.` : `${f.name} is in use again.`), Boolean(r.error));
    } else if (a === 'inv-field-starters') {
      const kind = (me && me.business && me.business.business_type) || '';
      const r = fa.addStarters(STARTER_FIELDS[kind] || STARTER_FIELDS.other);
      fieldsNote(r.error || `Added ${r.added} ${r.added === 1 ? 'detail' : 'details'}. Add the entries of each list below, or type them on an item.`, Boolean(r.error));
    } else if (a === 'inv-entry-rename') ui.fields = { renaming: el.dataset.id };
    else if (a === 'inv-entry-stop') {
      const r = fa.setEntryStopped(el.dataset.id, el.dataset.stopped === 'true');
      fieldsNote(r.error || 'Saved.', Boolean(r.error));
    } else if (a === 'inv-unit-change') ui.fields = { renamingUnit: el.dataset.id };
    else if (a === 'inv-unit-stop') {
      const r = fa.setUnitStopped(el.dataset.id, el.dataset.stopped === 'true');
      fieldsNote(r.error || 'Saved.', Boolean(r.error));
    }
    const goTo = { 'inv-field-edit': '[data-form="inv-field"] input[name="name"]', 'inv-entry-rename': '[data-autofocus]', 'inv-unit-change': '[data-autofocus]' };
    if (goTo[a]) { ui.inv.focusNext = goTo[a]; ui.inv.scrollNext = true; }
    render();
  }
  function submitFields(form) {
    const kind = form.dataset.form;
    const v = Object.fromEntries(new FormData(form).entries());
    const fa = actions.fields;
    if (kind === 'inv-field') {
      const id = form.dataset.field || null;
      const r = fa.saveField(v, id);
      if (r.errors) { ui.fields = { editing: id, values: v, errors: r.errors }; ui.inv.focusNext = '[aria-invalid="true"]'; ui.inv.scrollNext = true; render(); return; }
      fieldsNote(id ? 'Saved.' : `Added ${String(v.name).trim()}. ${v.type === 'list' ? 'Add its entries below, or type them on an item.' : 'It is on the item form now.'}`);
    } else if (kind === 'inv-entry') {
      const r = fa.addEntry(form.dataset.field, v.name);
      if (r.error) { ui.fields = { addTo: form.dataset.field, values: v, errors: { name: r.error } }; ui.inv.focusNext = '[aria-invalid="true"]'; ui.inv.scrollNext = true; render(); return; }
      fieldsNote(`Added ${String(v.name).trim()}.`);
    } else if (kind === 'inv-entry-rename') {
      const r = fa.renameEntry(form.dataset.id, v.name);
      if (r.error) { ui.fields = { renaming: form.dataset.id, values: v, errors: { name: r.error } }; ui.inv.focusNext = '[aria-invalid="true"]'; ui.inv.scrollNext = true; render(); return; }
      fieldsNote('Renamed. Every item that points to it shows the new name.');
    } else if (kind === 'inv-unit') {
      const r = fa.addUnit(v.name, v.whole === 'on');
      if (r.error) { ui.fields = { addUnit: true, values: v, errors: { name: r.error } }; ui.inv.focusNext = '[aria-invalid="true"]'; ui.inv.scrollNext = true; render(); return; }
      fieldsNote(`Added the unit ${String(v.name).trim()}.`);
    } else if (kind === 'inv-unit-change') {
      const r = fa.changeUnit(form.dataset.id, v.name, v.whole === 'on');
      if (r.error) { ui.fields = { renamingUnit: form.dataset.id, values: v, errors: { name: r.error } }; ui.inv.focusNext = '[aria-invalid="true"]'; ui.inv.scrollNext = true; render(); return; }
      fieldsNote('Saved.');
    }
    render();
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
      else { invNotice('inventory', `Added ${name}${res.opening ? ` with ${qtyText(res.opening, res.unit)} in stock` : ''}.`); navigate('#/inventory'); }
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
    if (sh.type === 'cut') {
      const done = stock.cut(sh.item, v);
      if (done.errors) { fail(done); return; }
      ui.inv.sheet = null;
      const it = store.get().items.find((i) => i.id === sh.item);
      invNotice(at, done.error || `Cut ${qtyText(done.count, done.from)} of ${it.name} into ${qtyText(done.gives, done.to)}. In stock: ${qtyText(stockOf(store.get(), it, done.from), done.from)} and ${qtyText(stockOf(store.get(), it, done.to), done.to)}.`, Boolean(done.error));
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
      const u = res.unit || it.unit;
      const what = sh.type === 'in' ? `Added ${qtyText(Math.abs(m.qty), u)} to ${it.name}.` : sh.type === 'out' ? `Took ${qtyText(Math.abs(m.qty), u)} of ${it.name} out.` : `Count saved: ${signedText(m.qty, u)} as a correction.`;
      invNotice(at, `${what} In stock: ${qtyText(stockOf(store.get(), it, u), u)}.${saved}`);
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
    if (kind.startsWith('bill-')) { bills.onSubmit(form); return; }
    if (['signin', 'forgot', 'reset', 'setup', 'change-pin'].includes(kind)) { submitAuth(form); return; }
    if (['add-staff', 'import-staff', 'add-business', 'business-profile', 'account-pin'].includes(kind)) {
      if (form.dataset.busy === '1') return; // a second press while the first is still working
      const done = showWorking(form, WORKING[kind]);
      Promise.resolve(submitTeam(form)).finally(done);
      return;
    }
    if (kind === 'inv-sheet' || kind === 'inv-item') { submitInventory(form); return; }
    if (['inv-field', 'inv-entry', 'inv-entry-rename', 'inv-unit', 'inv-unit-change'].includes(kind)) { submitFields(form); return; }
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
    rememberItemForm(el);
    const a = el.dataset.action;
    if (a === 'pick-signature') { await bills.pickSignature(el.files && el.files[0]); return; }
    if (bills.onChange(e)) return;
    if (el.matches('[data-inv-filter]')) { ui.inv.f = { ...(ui.inv.f || {}), [el.dataset.invFilter]: el.value }; paintInv(); return; }
    if (el.matches('[data-sheet-unit], [data-cut-pick]') && ui.inv.sheet) {
      const form = root.querySelector('form[data-form="inv-sheet"]');
      const v = Object.fromEntries(new FormData(form).entries());
      if (el.matches('[data-cut-pick]') && el.name === 'from') { delete v.gives; delete v.to; }
      if (el.matches('[data-cut-pick]') && el.name === 'to') delete v.gives;
      ui.inv.sheet = { ...ui.inv.sheet, unit: v.unit || ui.inv.sheet.unit, values: v, errors: {} };
      render();
      return;
    }
    if (el.matches('select[name^="sell_unit_"], select[name^="sell_cut_from_"]')) { editSellRows('keep'); return; } // the cut box and the list of units to cut from follow what was picked
    if (el.matches('[data-unit-select]')) { const box = root.querySelector('[data-slot="new-unit"]'); if (box) box.hidden = el.value !== '__new__'; if (el.value === '__new__') root.querySelector('input[name="new_unit"]')?.focus(); return; }
    if (a === 'edit-line') actions.updateDocumentLine(el.dataset.doc, Number(el.dataset.index), { [el.dataset.key]: el.value === '' ? NaN : Number(el.value) });
    else if (a === 'set-mode') { actions.setSetting('mode', el.value); loadForRoute(); }
    else if (a === 'set-theme') { setThemePref(el.value, win); paintTheme(); }
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
    rememberItemForm(t);
    if (t.matches('[data-global-search]')) { ui.gs = t.value; paintSearch(); return; }
    if (bills.onInput(e)) return;
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
      const su = ui.inv.sheet.unit || (it && it.unit);
      const q = it ? parseQty(t.value, su) : { ok: false };
      const diff = root.querySelector('[data-slot="inv-diff"]');
      const change = q.ok ? r3(q.value - stockOf(st, it, su)) : null;
      if (diff) diff.textContent = change == null ? '' : change === 0 ? 'Count matches. Nothing to change.' : `This records ${signedText(change, su)} as a count correction.`;
      const short = root.querySelector('[data-slot="pick-short"]');
      if (short) short.hidden = !(q.ok && q.value > stockOf(st, it, su));
    }
  }
  function onKey(e) {
    const box = root.querySelector('[data-global-search]');
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k' && box) { e.preventDefault(); box.focus(); box.select(); paintSearch(); return; }
    if (e.target === box && e.key === 'ArrowDown') { e.preventDefault(); root.querySelector('.gs-panel a')?.focus(); return; }
    if (e.key === 'Escape' && root.querySelector('[data-slot="gs-results"]:not([hidden])')) { paintSearch(false); box?.focus(); return; }
    if (e.key === 'Escape' && ui.navOpen) { setNav(false); return; }
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
    else if (e.key === 'Escape' && ui.inv.sheet) { ui.inv.sheet = null; render(); }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  // More options stays open across redraws while a bill is being made.
  root.addEventListener('toggle', (e) => { if (e.target.matches?.('.more-options') && ui.billEd) ui.billEd.more = e.target.open; }, true);
  root.ownerDocument.addEventListener('keydown', onKey);
  applyTheme(win);
  const stopWatchingTheme = watchSystemTheme(win, () => paintTheme());

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
    unmount() { alive = false; stopWatchingTheme(); bills.stop(); if (timerTick) win.clearInterval(timerTick); sync.stop(); win.removeEventListener('hashchange', onHash); unsub(); root.innerHTML = ''; root.ownerDocument.removeEventListener('keydown', onKey); },
  };
}

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

const HUB_URL = 'https://idea-studio-akkiverse.vercel.app';
// [route, label, href, icon, section, on the phone tab bar]
const NAV = [
  ['home', 'Home', '#/', 'home', 'Workspace', true],
  ['chat', 'Chat', '#/chat', 'chat', 'Workspace', true],
  ['jobs', 'Jobs', '#/jobs', 'jobs', 'Workspace', true],
  ['renewals', 'Renewals', '#/renewals', 'renewals', 'Workspace', true],
  ['businesses', 'Businesses', '#/businesses', 'building', 'Platform', true],
  ['admin', 'Admin', '#/admin', 'users', 'Manage', true],
  ['settings', 'Settings', '#/settings', 'settings', 'Manage', false],
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
  if (a === 'admin') return { name: 'admin', tab: 'admin' };
  if (a === 'businesses') return { name: 'businesses', tab: 'businesses' };
  if (a === 'account') return { name: 'account', tab: 'account' };
  return { name: 'home', tab: 'home' };
}
const VIEWS = { home, chat, jobs, job, doc: documentView, renewals, settings, admin, businesses, account };
const TITLES = { home: 'Home', chat: 'Chat', jobs: 'Jobs', job: 'Job', doc: 'Document', renewals: 'Renewals', settings: 'Settings', admin: 'Admin', businesses: 'Businesses', account: 'My account', signin: 'Sign in' };

const PERMISSION_LABELS = PERMISSIONS;
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
  const actions = createActions({ store, getAdapters, stepDelay, api, currentUser: meOf, photoImage: options.photoImage || jobsheetImage });
  const ui = {
    boot: 'loading', auth: {}, authState: null, admin: {}, businesses: {}, account: {}, profile: {},
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
    ui.meta = null;
  }
  async function loadAuthState() {
    try { ui.authState = await api.authState(); } catch { ui.authState = { needs_setup: false, demo_accounts: [] }; }
  }
  async function endSession(notice) {
    session.end();
    store.close();
    ui.admin = {}; ui.businesses = {}; ui.profile = {}; ui.account = {}; ui.meta = null;
    ui.auth = { notice };
    await loadAuthState();
    if (alive) render();
  }
  async function boot() {
    ui.boot = 'loading';
    render();
    try {
      const me = await api.me();
      if (me.signed_in) applySession(me);
      else await loadAuthState();
      ui.boot = 'ready';
    } catch {
      ui.boot = 'error';
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
    if (route.name === 'job') loadPlan(route.params.id);
    if (route.name === 'admin' && can(me, 'manage_team') && !ui.admin.data) loadAdmin();
    if (route.name === 'businesses' && can(me, 'manage_businesses') && !ui.businesses.list) loadBusinesses();
  }
  async function loadAdmin(extra = {}) {
    try {
      const [data, log] = await Promise.all([api.team(), api.audit()]);
      ui.admin = { ...ui.admin, ...extra, data, audit: log.entries, error: '' };
    } catch (e) {
      ui.admin = { ...ui.admin, ...extra, error: msg(e) };
    }
    if (alive && route.name === 'admin') render();
  }
  async function loadBusinesses(extra = {}) {
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
      <main id="main" class="main">${html}
        <footer class="site-foot no-print"><a href="${HUB_URL}">Part of Idea Studio by AkkiVerse</a>${demo ? '<span>Sample data only. No real messages are sent.</span>' : ''}</footer>
      </main>
    </div>`;
  }

  function authScreen() {
    const props = { ui, hubUrl: HUB_URL };
    const screens = { forgot: forgotPin, reset: resetPin, setup: setupScreen };
    return `<main id="main" class="auth-main">${(screens[ui.auth.screen] || signIn)(props)}</main>`;
  }

  function render() {
    if (!alive) return;
    const state = store.get();
    if (ui.boot === 'loading') { root.innerHTML = loadingScreen(); return; }
    if (ui.boot === 'error') { root.innerHTML = unreachableScreen(); return; }
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
    const t2 = root.querySelector('.thread');
    if (t2) t2.scrollTop = nearBottom || name !== lastRouteName ? t2.scrollHeight : oldTop;
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
    render();
    loadForRoute();
  }

  const routeKey = (r) => `${r.name}:${(r.params && r.params.id) || ''}`;
  const onHash = () => { const r = parseRoute(win.location.hash); if (routeKey(r) === routeKey(route)) return; route = r; ui.toast = null; ui.sheet = null; ui.wfNote = null; render(); loadForRoute(); };
  win.addEventListener('hashchange', onHash);
  const unsub = store.subscribe(() => { applyTheme(); render(); });

  const focus = (sel) => root.querySelector(sel)?.focus();
  const setNotice = (target, text, error = false) => { target.notice = { text, error }; };

  async function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action;
    if (['edit-line', 'set-mode', 'set-theme', 'toggle-failure', 'set-role', 'member-permission', 'role-permission', 'pick-csv'].includes(a)) return; // handled on change
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
    if (a === 'sign-out') {
      try { await api.signOut(); } catch { /* the cookie ends on its own after 12 hours */ }
      await endSession('You have signed out.');
      return;
    }
    if (a === 'reload-admin') { ui.admin = {}; loadAdmin(); return; }
    if (a === 'dismiss-credentials') { ui.admin.credentials = null; render(); return; }
    if (a === 'dismiss-issued') { ui.businesses.issued = null; render(); return; }
    if (a === 'reset-pin') {
      const m = (ui.admin.data?.members || []).find((x) => x.id === el.dataset.staff);
      try {
        const res = await api.resetMemberPin(el.dataset.staff);
        await loadAdmin({ credentials: [{ name: res.name, phone: m ? m.phone : '', role: m ? m.role : '', pin: res.pin }], notice: { text: `New PIN made for ${res.name}. They choose their own at next sign-in.` } });
      } catch (err) { setNotice(ui.admin, msg(err), true); render(); }
      return;
    }
    if (a === 'toggle-access') {
      try {
        const res = await api.updateMember(el.dataset.staff, { active: el.dataset.active === 'true' });
        await loadAdmin({ notice: { text: `${res.name}: access ${res.active ? 'turned on' : 'turned off'}.` } });
      } catch (err) { setNotice(ui.admin, msg(err), true); render(); }
      return;
    }
    if (a === 'toggle-business') {
      try {
        const res = await api.setBusinessActive(el.dataset.business, el.dataset.active === 'true');
        await loadBusinesses({ notice: { text: `${res.name} is now ${res.active ? 'on' : 'turned off'}.` } });
      } catch (err) { ui.businesses.notice = { text: msg(err), error: true }; render(); }
      return;
    }
    if (a === 'reset-owner-pin') {
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
      } catch (err) {
        ui.profile = { ...fields, notice: { text: msg(err), error: true } };
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
      render();
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    if (['signin', 'forgot', 'reset', 'setup', 'change-pin'].includes(kind)) { submitAuth(form); return; }
    if (['add-staff', 'import-staff', 'add-business', 'business-profile', 'account-pin'].includes(kind)) { submitTeam(form); return; }
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
    else if (a === 'pick-csv') {
      const file = el.files && el.files[0];
      if (!file) return;
      const text = await file.text();
      ui.admin = { ...ui.admin, csv: text };
      render();
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
  function onInput(e) { if (e.target.id === 'composer-input') ui.draft = e.target.value; }
  function onKey(e) { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); } }

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
    unmount() { alive = false; win.removeEventListener('hashchange', onHash); unsub(); root.innerHTML = ''; root.ownerDocument.removeEventListener('keydown', onKey); },
  };
}

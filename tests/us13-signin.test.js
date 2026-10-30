import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor } from './fake-accounts.js';
import { createApiClient } from '../src/api/client.js';

let t;
afterEach(() => t?.app.unmount());

const owner = meFor(PEOPLE['st-owner']);
const accounts = [
  { phone: '9900000201', pin: '2468', me: owner },
  { phone: '9900000203', pin: '8642', me: meFor(PEOPLE['st-santosh']) },
  { phone: '9811100001', pin: '7391', me: meFor({ id: 'u-new', name: 'Mina Rao', phone: '9811100001', role: 'owner', must_change_pin: true }) },
];
const signedOutApp = (extra = {}) => setup({ signedInAs: null, api: fakeApi({ accounts: { accounts, ...(extra.accounts || {}) } }), ...extra, ...(extra.authState ? {} : {}) });

async function submit(form, values) {
  for (const [k, v] of Object.entries(values)) form.elements[k].value = v;
  form.requestSubmit();
}
const waitFor = (fn) => until(fn);

describe('US-22 Sign-in screens (CR-0005)', () => {
  it('AC-22.1: signed out, any address shows only Sign in to KaryaHub, with no business name and no demo tag', () => {
    t = signedOutApp({ hash: '#/renewals' });
    expect(t.$('h1').textContent).toBe('Sign in to KaryaHub');
    expect(t.$('form[data-form="signin"] input[name="phone"]')).toBeTruthy();
    expect(t.$('form[data-form="signin"] input[name="pin"]').type).toBe('password');
    expect(t.root.textContent).not.toContain('CoolCare');
    expect(t.$('.tag-upcoming')).toBeNull();
    expect(t.root.textContent).not.toContain('Money at stake');
    expect(document.title).toContain('Sign in');
  });

  it('AC-22.1: demo accounts sit under "Explore a demo business"; tapping one fills the number and PIN', async () => {
    const api = fakeApi({ accounts: { accounts } });
    t = setup({ signedInAs: null, api, authState: await api.authState() });
    const demo = t.$('details[data-testid="demo-accounts"]');
    expect(demo.open).toBe(false);
    expect(demo.querySelector('summary').textContent).toBe('Explore a demo business');
    for (const name of ['Akash Mehta', 'Priya Nair', 'Santosh Pawar', 'Imran Khan']) expect(demo.textContent).toContain(name);
    expect(demo.textContent).toContain('PIN 2468');
    t.click('[data-action="use-demo"][data-phone="9900000203"]');
    const f = t.$('form[data-form="signin"]');
    expect(f.elements.phone.value).toBe('9900000203');
    expect(f.elements.pin.value).toBe('8642');
  });

  it('AC-18.1 (screen): the right number and PIN open the right start page with the name, role and business', async () => {
    t = signedOutApp();
    await submit(t.$('form[data-form="signin"]'), { phone: '99000 00201', pin: '2468' });
    await waitFor(() => t.$('[data-testid="account-menu"]'));
    expect(t.$('[data-testid="money-at-stake"]')).toBeTruthy();
    expect(t.$('[data-testid="account-menu"]').textContent).toContain('Akash Mehta');
    expect(t.$('[data-testid="current-role"]').textContent).toBe('Owner (admin)');
    expect(t.$('.topbar-biz').textContent).toContain('CoolCare AC Services');
    expect(t.api.accountCalls.find((c) => c.name === 'signIn').args).toEqual(['99000 00201', '2468']);
    t.app.unmount();
    t = signedOutApp({ hash: '#/' });
    await submit(t.$('form[data-form="signin"]'), { phone: '9900000203', pin: '8642' });
    await waitFor(() => t.$('[data-testid="account-menu"]'));
    expect(window.location.hash).toBe('#/chat'); // a technician starts in Chat
  });

  it('AC-18.2 (screen): a wrong number or PIN shows one plain message and stays on Sign in', async () => {
    t = signedOutApp();
    await submit(t.$('form[data-form="signin"]'), { phone: '9900000201', pin: '0000' });
    await waitFor(() => t.$('[data-testid="signin-error"]'));
    expect(t.$('[data-testid="signin-error"]').textContent).toBe("That mobile number and PIN don't match an active account. Check them, or use Forgot PIN.");
    expect(t.$('[data-testid="account-menu"]')).toBeNull();
    expect(t.$('form[data-form="signin"] input[name="phone"]').value).toBe('9900000201');
    expect(t.$('form[data-form="signin"] input[name="pin"]').value).toBe('');
    expect(document.activeElement.name).toBe('pin');
  });

  it('AC-18.6 and AC-22.7 (screen): a temporary PIN must be changed first; mismatches and wrong current PINs are explained', async () => {
    t = signedOutApp();
    await submit(t.$('form[data-form="signin"]'), { phone: '9811100001', pin: '7391' });
    await waitFor(() => t.$('form[data-form="change-pin"]'));
    expect(t.$('h1').textContent).toBe('Choose your own PIN');
    expect(t.$('[data-testid="account-menu"]')).toBeNull(); // nothing else opens until the PIN is changed
    await submit(t.$('form[data-form="change-pin"]'), { current: '7391', pin: '5826', pin2: '5827' });
    expect(t.$('[data-testid="signin-error"]').textContent).toBe("The two PINs don't match.");
    await submit(t.$('form[data-form="change-pin"]'), { current: '0000', pin: '5826', pin2: '5826' });
    await waitFor(() => t.$('[data-testid="signin-error"]')?.textContent.includes('current PIN'));
    t.api.me = async () => meFor({ id: 'u-new', name: 'Mina Rao', phone: '9811100001', role: 'owner' });
    await submit(t.$('form[data-form="change-pin"]'), { current: '7391', pin: '5826', pin2: '5826' });
    await waitFor(() => t.$('[data-testid="account-menu"]'));
    expect(t.$('[data-testid="account-menu"]').textContent).toContain('Mina');
  });

  it('AC-21.1 and AC-22.7 (screen): Forgot PIN sends a code, then a new PIN is chosen with it; the demo shows the code on screen', async () => {
    t = signedOutApp();
    t.$('input[name="phone"]').value = '9900000201';
    t.click('[data-action="auth-screen"][data-screen="forgot"]');
    expect(t.$('h1').textContent).toBe('Forgot your PIN?');
    expect(t.$('input[name="phone"]').value).toBe('9900000201');
    await submit(t.$('form[data-form="forgot"]'), { phone: '9900000201' });
    await waitFor(() => t.$('form[data-form="reset"]'));
    expect(t.$('[data-testid="demo-code"]').textContent).toContain('482913');
    await submit(t.$('form[data-form="reset"]'), { code: '482913', pin: '6402', pin2: '6403' });
    expect(t.$('[data-testid="signin-error"]').textContent).toBe("The two PINs don't match.");
    await submit(t.$('form[data-form="reset"]'), { code: '000000', pin: '6402', pin2: '6402' });
    await waitFor(() => t.$('[data-testid="signin-error"]')?.textContent.includes("isn't right"));
    await submit(t.$('form[data-form="reset"]'), { code: '482913', pin: '6402', pin2: '6402' });
    await waitFor(() => t.$('form[data-form="signin"]'));
    expect(t.$('[data-testid="signin-notice"]').textContent).toBe('Your PIN is changed. Sign in with the new one.');
  });

  it('AC-21.2 and AC-22.7 (screen): when codes are not switched on the screen says so and points to the owner', async () => {
    const api = fakeApi({ accounts: { accounts } });
    api.forgotPin = async () => { const { ApiError } = await import('../src/api/client.js'); throw new ApiError("Text-message codes aren't switched on yet. Ask your business owner to reset your PIN in Admin.", { code: 'otp_unavailable', status: 503 }); };
    t = setup({ signedInAs: null, api });
    t.click('[data-action="auth-screen"][data-screen="forgot"]');
    await submit(t.$('form[data-form="forgot"]'), { phone: '9811100001' });
    await waitFor(() => t.$('[data-testid="signin-error"]'));
    expect(t.$('[data-testid="signin-error"]').textContent).toContain('Ask your business owner');
    expect(t.$('form[data-form="forgot"]')).toBeTruthy();
  });

  it('AC-20.1 and AC-22.7 (screen): First-time setup shows only while no platform admin exists, and needs the setup token', async () => {
    const api = fakeApi({ accounts: { accounts, needsSetup: true } });
    t = setup({ signedInAs: null, api, authState: await api.authState() });
    t.click('[data-action="auth-screen"][data-screen="setup"]');
    expect(t.$('h1').textContent).toBe('First-time setup');
    await submit(t.$('form[data-form="setup"]'), { token: 'wrong', name: 'Abhishek', phone: '9800000001', pin: '8143' });
    await waitFor(() => t.$('[data-testid="signin-error"]'));
    expect(t.$('[data-testid="signin-error"]').textContent).toBe("That setup token isn't right.");
    await submit(t.$('form[data-form="setup"]'), { token: 'setup-token', name: 'Abhishek', phone: '9800000001', pin: '8143' });
    await waitFor(() => t.$('form[data-form="signin"]'));
    expect(t.$('[data-testid="signin-notice"]').textContent).toContain('platform admin is ready');
    t.app.unmount();
    t = signedOutApp({ authState: { needs_setup: false, demo_accounts: [] } });
    expect(t.root.textContent).not.toContain('First-time setup');
  });

  it('AC-18.1 (screen): Sign out ends the session on the server and returns to Sign in with a message', async () => {
    t = setup({ api: fakeApi({ accounts: { accounts } }) });
    t.click('[data-testid="account-menu"] [data-action="sign-out"]');
    await waitFor(() => t.$('form[data-form="signin"]'));
    expect(t.api.accountCalls.some((c) => c.name === 'signOut')).toBe(true);
    expect(t.$('[data-testid="signin-notice"]').textContent).toBe('You have signed out.');
    expect(t.$('[data-testid="account-menu"]')).toBeNull();
    expect(t.app.session.get()).toBeNull();
  });

  it('AC-22.9: the real app asks the server who is signed in; an unreachable server shows a calm retry screen', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    const { mountApp } = await import('../src/app.js');
    const api = { ...fakeApi(), me: async () => { throw new Error('down'); } };
    const root = document.getElementById('app');
    const app = mountApp(root, { api });
    expect(root.textContent).toContain('Opening KaryaHub');
    await app.ready;
    expect(root.querySelector('[data-testid="server-unreachable"]').textContent).toContain("Can't reach KaryaHub");
    api.me = async () => ({ signed_in: false });
    root.querySelector('[data-action="retry-boot"]').click();
    await vi.waitFor(() => { if (!root.querySelector('form[data-form="signin"]')) throw new Error('no'); });
    app.unmount();
    t = null;
  });

  it('AC-18.5 (client): the client marks every request as the app\'s own, and tells the app when a session has ended', async () => {
    const seen = [];
    let ended = 0;
    const client = createApiClient({
      fetchImpl: async (url, init) => { seen.push(init.headers); return new Response(JSON.stringify({ error: { code: 'signin_required', message: 'Sign in to use KaryaHub.' } }), { status: 401 }); },
      onSessionEnded: () => { ended += 1; },
    });
    await expect(client.team()).rejects.toThrow('Sign in to use KaryaHub.');
    expect(seen[0]['X-Requested-With']).toBe('karyahub');
    expect(ended).toBe(1);
    await expect(client.signIn('9900000201', '0000')).rejects.toThrow();
    expect(ended).toBe(1); // a failed sign-in isn't "session ended"
  });
});

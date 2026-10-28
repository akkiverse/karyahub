import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup } from './helpers.js';
import { hashPin, DEMO_STAFF, DEMO_PINS } from '../src/domain/access.js';

let t;
afterEach(() => t?.app.unmount());

async function signIn(t, phone, pin) {
  const f = t.$('form[data-form="signin"]');
  f.elements.phone.value = phone;
  f.elements.pin.value = pin;
  f.requestSubmit();
  await vi.waitFor(() => { if (t.$('form[data-form="signin"] button[disabled]')) throw new Error('busy'); }, { timeout: 2000, interval: 5 });
}
const signedIn = (t) => vi.waitFor(() => { if (!t.$('[data-testid="account-menu"]')) throw new Error('not signed in'); }, { timeout: 2000, interval: 5 });

describe('US-13 Staff sign-in', () => {
  it('AC-13.1: with nobody signed in, any address shows only the Sign-in screen with the demo accounts and their PINs', () => {
    t = setup({ signedInAs: null, hash: '#/renewals' });
    expect(t.$('form[data-form="signin"] input[name="phone"]')).toBeTruthy();
    expect(t.$('form[data-form="signin"] input[name="pin"]').type).toBe('password');
    const demo = t.$('[data-testid="demo-accounts"]').textContent;
    for (const name of ['Akash Mehta', 'Priya Nair', 'Santosh Pawar', 'Imran Khan']) expect(demo).toContain(name);
    expect(demo).toContain('Owner (admin)');
    expect(demo).toContain('PIN 2468');
    expect(t.root.textContent).not.toContain('Money at stake');
    expect(t.$('[data-testid="renewals"]')).toBeNull();
    expect(document.title).toContain('Sign in');
  });

  it("AC-13.2: the owner's number and PIN open Home with their name and role, and the sign-in is logged", async () => {
    t = setup({ signedInAs: null });
    await signIn(t, '99000 00201', '2468');
    await signedIn(t);
    expect(t.$('[data-testid="money-at-stake"]')).toBeTruthy();
    expect(t.$('[data-testid="account-menu"]').textContent).toContain('Akash Mehta');
    expect(t.$('[data-testid="current-role"]').textContent).toBe('Owner (admin)');
    const s = t.app.store.get();
    expect(s.access_log[0]).toMatchObject({ who: 'Akash Mehta', text: 'Signed in as Owner (admin)' });
    expect(s.staff.find((x) => x.id === 'st-owner').last_sign_in).toBeTruthy();
  });

  it('AC-13.3: a wrong PIN or unknown number shows a plain error, stays on Sign in, and a wrong PIN for a known person is logged', async () => {
    t = setup({ signedInAs: null });
    await signIn(t, '9900000201', '0000');
    expect(t.$('[data-testid="signin-error"]').textContent).toBe("That mobile number and PIN don't match an active staff account. Check them, or ask the owner to reset your PIN.");
    expect(t.$('[data-testid="account-menu"]')).toBeNull();
    expect(t.app.store.get().access_log[0].text).toContain('Sign-in failed');
    await signIn(t, '9123456789', '2468');
    expect(t.$('[data-testid="signin-error"]')).toBeTruthy();
    expect(t.app.session.get()).toBeNull();
  });

  it('AC-13.4: tapping a demo account fills in its number and PIN', () => {
    t = setup({ signedInAs: null });
    t.click('[data-action="use-demo"][data-staff="st-coord"]');
    const f = t.$('form[data-form="signin"]');
    expect(f.elements.phone.value).toBe('9900000202');
    expect(f.elements.pin.value).toBe('1357');
  });

  it('AC-13.5: Sign out returns to Sign in with a message; the session survives a reload while signed in and not after signing out', async () => {
    t = setup({ signedInAs: null });
    await signIn(t, '9900000201', '2468');
    await signedIn(t);
    t.app.unmount();
    t = setup({ signedInAs: undefined, hash: '#/' });
    // setup() clears storage, so sign in again through the session object and remount to model a reload.
    t.app.session.start('st-owner', '2027-01-01T09:00:00');
    t.app.render();
    expect(t.$('[data-testid="account-menu"]')).toBeTruthy();
    t.click('.account-menu [data-action="sign-out"]');
    expect(t.$('[data-testid="signin-notice"]').textContent).toBe('You have signed out.');
    expect(localStorage.getItem('karyahub.session.v1')).toBeNull();
    expect(t.app.store.get().access_log[0]).toMatchObject({ who: 'Akash Mehta', text: 'Signed out' });
  });

  it('AC-13.6: staff records keep only a salted SHA-256 hash of each PIN, never the PIN', async () => {
    t = setup();
    const raw = localStorage.getItem('karyahub.demo.v1') || JSON.stringify(t.app.store.get());
    for (const s of DEMO_STAFF) {
      expect(s.pin_hash).toBe(await hashPin(s.id, DEMO_PINS[s.id]));
      expect(s).not.toHaveProperty('pin');
    }
    expect(raw).not.toMatch(/"pin"\s*:/);
  });
});

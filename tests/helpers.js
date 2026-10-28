import { vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';

// Screens need a signed-in person since CR-0003. Tests sign in as the demo owner unless told
// otherwise (signedInAs: 'st-coord', 'st-santosh', or null for the sign-in screen).
export function setup({ stepDelay = 0, hash = '#/', realTiming = false, api = fakeApi(), saved = null, signedInAs = 'st-owner', random } = {}) {
  localStorage.clear();
  if (saved) localStorage.setItem('karyahub.demo.v1', JSON.stringify(saved));
  if (signedInAs) localStorage.setItem('karyahub.session.v1', JSON.stringify({ staff_id: signedInAs, signed_in_at: '2027-01-01T09:00:00' }));
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, realTiming ? { api, random } : { stepDelay, api, random });
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const click = (sel) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) throw new Error(`Nothing to click: ${sel}`);
    el.click();
  };
  const go = (h) => app.navigate(h);
  const settle = () => vi.waitFor(() => { if (app.actions.isBusy()) throw new Error('busy'); }, { timeout: 4000, interval: 5 });
  return { app, root, $, $$, click, go, settle, api };
}

export async function sendSample(t, id) {
  t.go('#/chat');
  t.click(`[data-sample="${id}"]`);
  await t.settle();
}
export const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

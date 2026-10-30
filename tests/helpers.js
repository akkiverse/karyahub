import { vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';
import { PEOPLE, meFor } from './fake-accounts.js';

// Screens need a signed-in person. Tests sign in as the demo owner unless told otherwise
// (signedInAs: 'st-coord', 'st-santosh', 'platform', or null for the sign-in screen). `me` can hand in
// any server answer (a real business, odd permissions, a temporary PIN).
export function setup({ stepDelay = 0, hash = '#/', realTiming = false, api = fakeApi(), saved = null, signedInAs = 'st-owner', me, authState, random, photoImage } = {}) {
  localStorage.clear();
  if (saved) localStorage.setItem('karyahub.demo.v1', JSON.stringify(saved));
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const who = me !== undefined ? me : (signedInAs ? meFor(PEOPLE[signedInAs]) : { signed_in: false });
  const state = authState || undefined;
  const app = mountApp(root, { ...(realTiming ? {} : { stepDelay }), api, random, photoImage, me: who, authState: state });
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

/** Wait until something shows up (screens that load from the server draw a moment later). */
export const until = (check) => vi.waitFor(() => { if (!check()) throw new Error('not yet'); }, { timeout: 2000, interval: 5 });

export async function sendSample(t, id) {
  t.go('#/chat');
  t.click(`[data-sample="${id}"]`);
  await t.settle();
}
export const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

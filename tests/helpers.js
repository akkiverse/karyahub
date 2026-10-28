import { vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';
import { fakeApi } from './fake-api.js';

export function setup({ stepDelay = 0, hash = '#/', realTiming = false, api = fakeApi(), saved = null } = {}) {
  localStorage.clear();
  if (saved) localStorage.setItem('karyahub.demo.v1', JSON.stringify(saved));
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, realTiming ? { api } : { stepDelay, api });
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

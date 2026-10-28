import { vi } from 'vitest';
import { mountApp } from '../src/app.js';
import { setToday } from '../src/clock.js';

export function setup({ stepDelay = 0, hash = '#/', realTiming = false } = {}) {
  localStorage.clear();
  setToday('2027-01-01');
  window.location.hash = hash;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app');
  const app = mountApp(root, realTiming ? {} : { stepDelay });
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const click = (sel) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) throw new Error(`Nothing to click: ${sel}`);
    el.click();
  };
  const go = (h) => app.navigate(h);
  const settle = () => vi.waitFor(() => { if (app.actions.isBusy()) throw new Error('busy'); }, { timeout: 4000, interval: 5 });
  return { app, root, $, $$, click, go, settle };
}

export async function sendSample(t, id) {
  t.go('#/chat');
  t.click(`[data-sample="${id}"]`);
  await t.settle();
}
export const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

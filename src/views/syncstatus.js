import { icon } from '../ui/icons.js';
import { escapeHtml } from '../format.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The small "All changes saved / 3 changes waiting to send" mark in the top bar (real businesses only). */
export function syncChip(st) {
  if (!st || !st.active) return '';
  let kind = 'saved';
  let text = 'All saved';
  let title = 'Everything you did is saved on the server.';
  if (st.pending) {
    kind = st.state === 'offline' ? 'offline' : st.state === 'syncing' ? 'sending' : 'waiting';
    text = st.state === 'offline' ? `${st.pending} waiting, offline` : st.state === 'syncing' ? `Sending ${st.pending}…` : `${plural(st.pending, 'change', 'changes')} waiting`;
    title = 'Your changes are saved on this phone and are sent to the server when there is signal.';
  } else if (st.state === 'offline') {
    kind = 'offline'; text = 'No signal'; title = 'KaryaHub will update when the signal is back.';
  } else if (st.state === 'error') {
    kind = 'waiting'; text = 'Sync problem'; title = st.error || 'Trying again soon.';
  } else if (st.state === 'syncing') {
    kind = 'sending'; text = 'Updating…'; title = 'Getting the latest from the server.';
  }
  const ic = kind === 'saved' ? 'check' : kind === 'sending' ? 'rotate' : 'alert';
  return `<span class="sync-chip is-${kind}" data-testid="sync-status" data-pending="${st.pending}" title="${escapeHtml(title)}" role="status">${icon(ic, { size: 14 })}<span>${escapeHtml(text)}</span></span>`;
}

/** Things worth stopping for: what was moved from this phone, and changes the server did not accept. */
export function syncBanner(st) {
  if (!st || !st.active) return '';
  const parts = [];
  if (st.notice) {
    parts.push(`<p class="notice" role="status" data-testid="sync-notice">${escapeHtml(st.notice.text)} <button type="button" class="btn btn-ghost btn-small" data-action="dismiss-sync-notice">Got it</button></p>`);
  }
  if (st.rejected.length) {
    const list = st.rejected.slice(0, 3).map((r) => `<li>${escapeHtml(r.message)}</li>`).join('');
    parts.push(`<div class="notice notice-error" role="alert" data-testid="sync-rejected"><strong>${plural(st.rejected.length, 'change was', 'changes were')} not saved.</strong> The server's version is shown instead.<ul>${list}</ul><button type="button" class="btn btn-ghost btn-small" data-action="dismiss-sync-rejected">OK</button></div>`);
  }
  return parts.join('');
}

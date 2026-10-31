// Ids and numbers for a business whose data lives on the server (CR-0009).
// A phone makes its own unique ids (so it can create things with no signal); the server gives jobs and documents their
// numbers (J-0007, QT-2026-0003) when they arrive, and until then the screens say "New". The demo business keeps its
// simple on-device ids and numbers.

/** A real business syncs with the server; the demo business (and the signed-out state) never does. */
export const isSynced = (state) => state.settings.is_demo === false;

export function uid(random = Math.random) {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    c.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(36).padStart(2, '0').slice(-2)).join('');
  }
  return Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join('');
}

/** What people read: the server's number once there is one, "New" while it is still waiting, else the demo id. */
export const refOf = (x) => (x.number ? x.number : x.number === '' ? 'New' : x.id);
/** The reference of a job given its id (chat cards and documents point at jobs by id). */
export const jobRef = (state, id) => {
  const j = state.jobs.find((x) => x.id === id);
  return j ? refOf(j) : id;
};

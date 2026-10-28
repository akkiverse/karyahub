// Who is signed in on this device (CR-0003). Kept apart from the demo data so Reset demo
// doesn't sign anyone out. Storage can be blocked; then the session lasts until the page closes.
export const SESSION_KEY = 'karyahub.session.v1';

export function createSession() {
  let current = null;
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.staff_id === 'string') current = parsed;
  } catch {
    current = null;
  }
  const save = () => {
    try {
      if (current) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(current));
      else globalThis.localStorage?.removeItem(SESSION_KEY);
    } catch {
      /* blocked storage: keep the session in memory */
    }
  };
  return {
    get: () => current,
    start(staffId, at) { current = { staff_id: staffId, signed_in_at: at }; save(); },
    end() { current = null; save(); },
  };
}

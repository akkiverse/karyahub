// Sign-in and Admin actions (CR-0003): staff accounts, roles, PINs and the access log.
import { nowStamp } from '../clock.js';
import { hashPin, normalisePhone, validateStaff, changeBlocked, roleName } from './access.js';

export const SIGN_IN_FAILED = "That mobile number and PIN don't match an active staff account. Check them, or ask the owner to reset your PIN.";
export const ACCESS_OFF = 'Your access has been turned off. Ask the owner if you think this is a mistake.';
const LOG_LIMIT = 200;

function log(s, who, text) {
  s.seq.log = (s.seq.log || 0) + 1;
  s.access_log.unshift({ id: `log-${String(s.seq.log).padStart(4, '0')}`, at: nowStamp(), who, text });
  if (s.access_log.length > LOG_LIMIT) s.access_log.length = LOG_LIMIT;
}

export function createTeamActions({ store, session, random = Math.random }) {
  const me = () => {
    const sess = session.get();
    if (!sess) return null;
    return (store.get().staff || []).find((x) => x.id === sess.staff_id && x.active) || null;
  };
  const owner = () => {
    const u = me();
    return u && u.role === 'owner' ? u : null;
  };

  async function signIn(phone, pin) {
    const p = normalisePhone(phone);
    const person = (store.get().staff || []).find((x) => x.phone === p);
    const ok = person && person.active && /^\d{4,6}$/.test(String(pin || '')) && (await hashPin(person.id, String(pin))) === person.pin_hash;
    if (!ok) {
      if (person) store.update((s) => log(s, person.name, 'Sign-in failed: wrong PIN or access turned off'));
      return { error: SIGN_IN_FAILED };
    }
    const at = nowStamp();
    session.start(person.id, at);
    store.update((s) => {
      s.staff.find((x) => x.id === person.id).last_sign_in = at;
      log(s, person.name, `Signed in as ${roleName(person.role)}`);
    });
    return { user: me() };
  }

  function signOut() {
    const u = me();
    session.end();
    if (u) store.update((s) => log(s, u.name, 'Signed out'));
  }

  async function addStaff(form) {
    const actor = owner();
    if (!actor) return { error: 'Only an owner can add staff.' };
    const staff = store.get().staff;
    const errors = validateStaff(form, staff);
    if (errors) return { errors };
    const seq = (store.get().seq.staff || 0) + 1;
    const id = `st-${String(seq).padStart(4, '0')}`;
    const pinHash = await hashPin(id, String(form.pin));
    store.update((s) => {
      s.seq.staff = seq;
      s.staff.push({ id, name: form.name.trim(), phone: normalisePhone(form.phone), role: form.role, active: true, pin_hash: pinHash, created_at: nowStamp(), last_sign_in: null });
      log(s, actor.name, `Added ${form.name.trim()} as ${roleName(form.role)}`);
    });
    return { id };
  }

  /** change: {role} or {active}. */
  function updateStaff(targetId, change) {
    const actor = owner();
    if (!actor) return { error: 'Only an owner can change the team.' };
    const reason = changeBlocked(store.get().staff, actor.id, targetId, change);
    if (reason) return { error: reason };
    let text = '';
    store.update((s) => {
      const t = s.staff.find((x) => x.id === targetId);
      if (change.role && change.role !== t.role) {
        text = `Changed ${t.name}'s role from ${roleName(t.role)} to ${roleName(change.role)}`;
        t.role = change.role;
      }
      if (typeof change.active === 'boolean' && change.active !== t.active) {
        text = change.active ? `Turned on access for ${t.name}` : `Turned off access for ${t.name}`;
        t.active = change.active;
      }
      if (text) log(s, actor.name, text);
    });
    return { text };
  }

  async function resetPin(targetId) {
    const actor = owner();
    if (!actor) return { error: 'Only an owner can reset PINs.' };
    const t = store.get().staff.find((x) => x.id === targetId);
    if (!t) return { error: 'That person is no longer on the team.' };
    const pin = String(1000 + Math.floor(random() * 9000));
    const pinHash = await hashPin(t.id, pin);
    store.update((s) => {
      s.staff.find((x) => x.id === targetId).pin_hash = pinHash;
      log(s, actor.name, `Reset the PIN for ${t.name}`);
    });
    return { pin, name: t.name };
  }

  return { me, signIn, signOut, addStaff, updateStaff, resetPin };
}

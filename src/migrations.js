// Upgrades data saved by earlier versions so nobody loses their demo state (CR-0002).
// v1 (KaryaHub 0.1.0): jobs had no workflow state. In v2 every approved job starts at
// WORK_DONE (the technician reported the finished work) with one event explaining why.

import { demoStaff } from './domain/access.js';

// v2 (KaryaHub 0.2.0 preview): no staff accounts. In v3 the demo team (owner, coordinator,
// two technicians) is added and an empty access log starts (CR-0003). Nothing else changes.

export function migrate(saved) {
  if (!saved || typeof saved !== 'object') return null;
  let s = saved;
  if (s.version === 1) {
    s = {
      ...s,
      version: 2,
      jobs: (s.jobs || []).map((j) => ({
        ...j,
        state: j.state || 'WORK_DONE',
        events: j.events || [{
          id: `ev-migrated-${j.id}`, action: 'report_done', from_state: 'NEW', to_state: 'WORK_DONE',
          client_op_id: `migrated-${j.id}`, actor: 'KaryaHub', channel: 'system',
          detail: 'Reported done by the technician (saved before proof of work was added)', received_at: j.approved_at || '',
        }],
        otp: j.otp || null,
      })),
    };
  }
  if (s.version === 2) {
    s = { ...s, version: 3, staff: Array.isArray(s.staff) ? s.staff : demoStaff(), access_log: Array.isArray(s.access_log) ? s.access_log : [], seq: { staff: 0, log: 0, ...(s.seq || {}) } };
  }
  return s.version === 3 ? s : null;
}

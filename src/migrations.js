// Upgrades data saved by earlier versions so nobody loses their demo state (CR-0002).
// v1 (KaryaHub 0.1.0): jobs had no workflow state. In v2 every approved job starts at
// WORK_DONE (the technician reported the finished work) with one event explaining why.
// v2 -> v3 (CR-0003) added a demo team and an access log on this device.
// v3 -> v4 (CR-0005): the team, PINs and access log now live on the server, so they are dropped here.
// Jobs, documents, chat and reminders are untouched.
// v4 -> v5 (CR-0011): inventory. Nothing is made up from old jobs' parts text: a business starts with no items,
// and the demo business gets its sample stock the next time it is reset.

const DEMO_TEAM_PLACEHOLDER = [];

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
    s = { ...s, version: 3, staff: DEMO_TEAM_PLACEHOLDER, access_log: [], seq: { staff: 0, log: 0, ...(s.seq || {}) } };
  }
  if (s.version === 3) {
    const rest = { ...s };
    delete rest.staff;
    delete rest.access_log;
    const seq = { ...(s.seq || {}) };
    delete seq.staff;
    delete seq.log;
    s = { ...rest, version: 4, seq };
  }
  if (s.version === 4) {
    s = { ...s, version: 5, items: s.items || [], stock_moves: s.stock_moves || [] };
  }
  return s.version === 5 ? s : null;
}

// A stand-in for the KaryaHub API in UI tests. It answers like the server does in mock mode
// (the server's own rules are tested with pytest in tests/api/). Calls are recorded for checks.
import { mockSpeech } from '../src/adapters/speech.js';
import { mockLlm } from '../src/adapters/llm.js';
import { mockWhatsApp } from '../src/adapters/whatsapp.js';
import { ApiError, ApiUnreachable } from '../src/api/client.js';
import { SAMPLES } from '../src/data/demo.js';
import { fakeAccounts } from './fake-accounts.js';

const NEXT = { request_otp: 'WORK_DONE', verify_otp: 'VERIFIED', close: 'CLOSED' };
const FROM = { request_otp: ['WORK_DONE'], verify_otp: ['WORK_DONE'], close: ['VERIFIED'] };

export function fakeApi({ unreachable = false, code = '123456', accounts: accountOptions } = {}) {
  const calls = [];
  const rec = (name, args, fn) => {
    calls.push({ name, args });
    if (unreachable) return Promise.reject(new ApiUnreachable());
    return fn();
  };
  const wrapErr = async (p) => { try { return await p; } catch (e) { throw new ApiError(e.message, { code: e.code || 'read_failed', status: 422 }); } };
  const accounts = fakeAccounts(accountOptions);
  return {
    ...accounts,
    calls,
    accountCalls: accounts.calls,
    meta: () => rec('meta', [], async () => ({
      version: '0.4.0', mode: 'mock', tenant: { id: 'b-demo', business_name: 'CoolCare AC Services' },
      services: ['whatsapp', 'speech', 'llm'].map((id) => ({ id, status: 'Mock', configured: false })),
    })),
    transcribe: (id, fail) => rec('transcribe', [id, fail], () => wrapErr(mockSpeech.transcribe(SAMPLES.find((s) => s.id === id), { fail }))),
    readImage: (id, fail) => rec('readImage', [id, fail], () => wrapErr(mockLlm.readImage(SAMPLES.find((s) => s.id === id), { fail }))),
    extract: (text, fail) => rec('extract', [text, fail], () => wrapErr(mockLlm.extractJob(text, { fail }))),
    send: (to, kind, body) => rec('send', [to, kind, body], () => wrapErr(mockWhatsApp.sendMessage({ to, kind, body }))),
    transition: (jobId, req) => rec('transition', [jobId, req], async () => {
      if (!(FROM[req.action] || []).includes(req.state)) throw new ApiError("You can't do that now.", { code: 'invalid_transition', status: 409 });
      if (req.action === 'verify_otp' && (req.payload.code !== code || req.payload.challenge !== 'challenge-1')) {
        throw new ApiError("That code doesn't match or has expired. Send a new code.", { code: 'guard_failed', status: 422 });
      }
      const to = NEXT[req.action];
      return {
        job_id: jobId, tenant_id: 'b-demo', state: to, duplicate: false, next_actions: [],
        event: { id: `ev-${req.client_op_id}`, action: req.action, from_state: req.state, to_state: to, client_op_id: req.client_op_id, actor: 'Owner', channel: 'web', detail: req.action === 'verify_otp' ? 'Customer confirmed with the code' : req.action === 'close' ? 'Close job' : 'Code sent to the customer' },
        otp: req.action === 'request_otp' ? { challenge: 'challenge-1', expires_at: '2027-01-01T10:10:00', demo_code: code } : null,
      };
    }),
    amcPlan: (contract, today) => rec('amcPlan', [contract, today], async () => ({
      customer_id: contract.customer_id, starts_on: '2026-03-15', ends_on: contract.ends_on, every_days: 90, lead_days: 7,
      visits: [
        { key: 'visit:a:2026-06-13', number: 1, due_on: '2026-06-13', create_job_on: '2026-06-06', status: 'past', escalate_to: '' },
        { key: 'visit:a:2026-09-11', number: 2, due_on: '2026-09-11', create_job_on: '2026-09-04', status: 'past', escalate_to: '' },
        { key: 'visit:a:2026-12-10', number: 3, due_on: '2026-12-10', create_job_on: '2026-12-03', status: 'overdue', escalate_to: 'owner' },
      ],
      next_visit: { key: 'visit:a:2026-12-10', number: 3, due_on: '2026-12-10', create_job_on: '2026-12-03', status: 'overdue', escalate_to: 'owner' },
      jobs_to_create: ['visit:a:2026-12-10'],
    })),
  };
}

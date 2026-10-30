import { describe, it, expect, afterEach } from 'vitest';
import { setup, until } from './helpers.js';
import { fakeApi } from './fake-api.js';

let t;
afterEach(() => t?.app.unmount());

const open = async () => {
  t = setup({ signedInAs: 'platform', hash: '#/businesses', api: fakeApi() });
  await until(() => t.$('[data-testid="business-list"]'));
};
const calls = (name) => t.api.accountCalls.filter((c) => c.name === name);

describe('US-20 Businesses (platform admin screens, CR-0005)', () => {
  it('AC-20.2 and AC-22.4 (screen): lists every business with people, owner and status; the demo cannot be switched off', async () => {
    await open();
    const rows = t.$$('[data-testid="business-list"] .member');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('CoolCare AC Services');
    expect(rows[0].textContent).toContain('Demo');
    expect(rows[0].querySelector('[data-action="toggle-business"]')).toBeNull();
    expect(rows[1].textContent).toContain('Shree Cool AC');
    expect(rows[1].textContent).toContain('owner Mina Rao (98111 00001)');
    expect(rows[1].querySelector('[data-testid="business-status"]').textContent).toBe('Active');
  });

  it('AC-20.2 and AC-22.4 (screen): creating a business shows the owner their temporary PIN once', async () => {
    await open();
    const f = t.$('form[data-form="add-business"]');
    for (const [k, v] of Object.entries({ name: 'Cool Breeze', address: 'Pune', gstin: '', owner_name: 'Ravi Kale', owner_phone: '98 222 00002' })) f.elements[k].value = v;
    f.requestSubmit();
    await until(() => t.$('[data-testid="biz-credentials"]'));
    expect(t.$('[data-testid="biz-notice"]').textContent).toBe('Cool Breeze was created.');
    expect(t.$('[data-testid="issued-pin"]').textContent).toBe('305917');
    expect(t.$('[data-testid="biz-credentials"]').textContent).toContain('Ravi Kale');
    expect(t.$$('[data-testid="business-list"] .member')).toHaveLength(3);
    expect(calls('createBusiness')[0].args[0]).toMatchObject({ name: 'Cool Breeze', owner_name: 'Ravi Kale', state_code: '27' });
    t.click('[data-action="dismiss-issued"]');
    expect(t.$('[data-testid="biz-credentials"]')).toBeNull();
  });

  it('AC-20.2 and AC-22.4 (screen): a clash or a mistake is explained and the form keeps what was typed', async () => {
    await open();
    const f = t.$('form[data-form="add-business"]');
    for (const [k, v] of Object.entries({ name: 'Another Firm', owner_name: 'Mina Again', owner_phone: '9811100001' })) f.elements[k].value = v;
    f.requestSubmit();
    await until(() => t.$('[data-testid="biz-error"]'));
    expect(t.$('[data-testid="biz-error"]').textContent).toContain('already has a KaryaHub account');
    expect(t.$('form[data-form="add-business"]').elements.name.value).toBe('Another Firm');
    expect(t.$$('[data-testid="business-list"] .member')).toHaveLength(2);
  });

  it('AC-20.2 and AC-22.4 (screen): a business can be turned off and on', async () => {
    await open();
    const row = () => t.$$('[data-testid="business-list"] .member')[1];
    t.click(row().querySelector('[data-action="toggle-business"]'));
    await until(() => row().querySelector('[data-testid="business-status"]').textContent === 'Turned off');
    expect(calls('setBusinessActive')[0].args).toEqual(['b-shree', false]);
    expect(t.$('[data-testid="biz-notice"]').textContent).toBe('Shree Cool AC is now turned off.');
    t.click(row().querySelector('[data-action="toggle-business"]'));
    await until(() => row().querySelector('[data-testid="business-status"]').textContent === 'Active');
  });

  it("AC-20.4 (screen): resetting an owner's PIN shows the new temporary PIN once", async () => {
    await open();
    t.click('[data-action="reset-owner-pin"]');
    await until(() => t.$('[data-testid="biz-credentials"]'));
    expect(t.$('[data-testid="biz-credentials"]').textContent).toContain('Mina Rao');
    expect(t.$('[data-testid="issued-pin"]').textContent).toBe('628140');
  });

  it('AC-20.5 and AC-22.4 (screen): a business owner opening Businesses gets the no-access page', () => {
    t = setup({ hash: '#/businesses' });
    expect(t.$('[data-testid="access-denied"]')).toBeTruthy();
    expect(t.$('form[data-form="add-business"]')).toBeNull();
  });
});

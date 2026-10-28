// The demo runs on a fixed date so the renewals story is the same every time (spec: fixed clock 2027-01-01).
export const DEMO_TODAY = '2027-01-01';
let current = DEMO_TODAY;
export const today = () => current;
export const setToday = (iso) => { current = iso; };
export const nowStamp = () => `${current}T10:${String(new Date().getMinutes()).padStart(2, '0')}:00`;

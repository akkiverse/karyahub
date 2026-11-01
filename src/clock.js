// The demo runs on a fixed date so the renewals story is the same every time (spec: fixed clock 2027-01-01).
export const DEMO_TODAY = '2027-01-01';
let current = DEMO_TODAY;
export const today = () => current;
export const setToday = (iso) => { current = iso; };
export const nowStamp = () => `${current}T10:${String(new Date().getMinutes()).padStart(2, '0')}:00`;

// The real date and time on this device, for a real business's stock moves (the fixed demo clock above is for the demo).
let deviceOverride = null;
const two = (n) => String(n).padStart(2, '0');
export const setDeviceNow = (iso) => { deviceOverride = iso; }; // tests
export function deviceNow() {
  if (deviceOverride) return deviceOverride;
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
export const deviceToday = () => deviceNow().slice(0, 10);

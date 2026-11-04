// Aurora Dark and Clean Light (CR-0015). The choice is one per device, kept in localStorage under 'kh-theme':
// 'dark' (the default), 'light' or 'system'. <html data-theme> always holds the theme in use, 'dark' or 'light'.
// index.html runs the same steps before the first paint, so the page never flashes the wrong theme.
import { icon } from './ui/icons.js';

export const THEME_KEY = 'kh-theme';
const LEGACY_PREFS = 'karyahub.prefs.v1'; // where v0.10.0 and before kept the choice
const PREFS = ['dark', 'light', 'system'];
const BAR_COLOUR = { dark: '#060814', light: '#F8FAFC' };
export const THEME_NAMES = { dark: 'Aurora Dark', light: 'Clean Light' };

/** What this device chose. A light or dark choice made before v0.11.0 is kept; anything else starts dark. */
export function themePref(win = globalThis) {
  try {
    const saved = win.localStorage.getItem(THEME_KEY);
    if (PREFS.includes(saved)) return saved;
    const old = JSON.parse(win.localStorage.getItem(LEGACY_PREFS) || '{}').theme;
    if (old === 'light' || old === 'dark') return old;
  } catch { /* storage switched off: the default still works */ }
  return 'dark';
}
const systemTheme = (win) => (win.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
export const resolveTheme = (pref, win = globalThis) => (pref === 'system' ? systemTheme(win) : pref === 'light' ? 'light' : 'dark');

export function applyTheme(win = globalThis) {
  const doc = win.document;
  const theme = resolveTheme(themePref(win), win);
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOUR[theme]);
  return theme;
}
export function setThemePref(pref, win = globalThis) {
  if (!PREFS.includes(pref)) return applyTheme(win);
  try { win.localStorage.setItem(THEME_KEY, pref); } catch { /* the theme still changes for this visit */ }
  return applyTheme(win);
}
/** The header button: to the other theme, whichever is showing now (also when following the system). */
export const toggleTheme = (win = globalThis) => setThemePref(resolveTheme(themePref(win), win) === 'dark' ? 'light' : 'dark', win);

/** While the choice is 'system', follow the device when it changes. Returns how to stop. */
export function watchSystemTheme(win, onChange) {
  const query = win.matchMedia?.('(prefers-color-scheme: light)');
  if (!query?.addEventListener) return () => {};
  const listen = () => { if (themePref(win) === 'system') onChange(applyTheme(win)); };
  query.addEventListener('change', listen);
  return () => query.removeEventListener('change', listen);
}

/** Sun or moon with the name of the theme in use; pressing it switches at once. */
export function themeToggle(win = globalThis) {
  const theme = resolveTheme(themePref(win), win);
  const other = theme === 'dark' ? 'light' : 'dark';
  return `<button type="button" class="theme-toggle" data-action="toggle-theme" data-slot="theme-toggle" data-testid="theme-toggle" aria-label="Theme: ${THEME_NAMES[theme]}. Switch to ${THEME_NAMES[other]}" title="Switch to ${THEME_NAMES[other]}">${icon(theme === 'dark' ? 'moon' : 'sun', { size: 18 })}<span class="theme-toggle-name">${THEME_NAMES[theme]}</span></button>`;
}

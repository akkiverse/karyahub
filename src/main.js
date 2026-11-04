// The three type roles (CR-0015). Noto Sans stays as the fallback for Devanagari, so Hindi needs no font change.
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import './styles.css';
import { mountApp } from './app.js';
import { watchAiStatus } from './ui/ai-status.js';

mountApp(document.getElementById('app'));
watchAiStatus(); // "AI is offline right now" banner while the Studio AI server is off (CR-0004)

import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans/800.css';
import './styles.css';
import { mountApp } from './app.js';
import { watchAiStatus } from './ui/ai-status.js';

mountApp(document.getElementById('app'));
watchAiStatus(); // "AI is offline right now" banner while the Studio AI server is off (CR-0004)

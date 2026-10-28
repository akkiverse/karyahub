import { defineConfig } from 'vite';

// In development, /api is forwarded to the FastAPI server (uv run uvicorn api.index:app --port 8000).
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});

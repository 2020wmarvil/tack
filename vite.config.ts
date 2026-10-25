import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed dev port and handles the window itself.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  // The bundle loads from disk inside the app, so its size doesn't need a warning.
  build: { chunkSizeWarningLimit: 2000 },
});

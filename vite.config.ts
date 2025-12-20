import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Map VITE_ prefixed variables as well if needed, though usually import.meta.env handles them
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
        '/profiles': 'http://localhost:3001',
        '/auth': 'http://localhost:3001',
      },
    },
  };
});

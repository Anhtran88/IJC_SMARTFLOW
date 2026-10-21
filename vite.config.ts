import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        strictPort: true,
        allowedHosts: true,
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
        strictPort: true,
        allowedHosts: true,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify("AIzaSyB8Z6OJO2iklgx4EQ4tZ6K0s1dgLSiBmZw")
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'lucide': ['lucide-react'],
              'recharts': ['recharts'],
              'documents': ['xlsx', 'docx', 'exceljs'],
              'firebase': ['firebase/app', 'firebase/database', 'firebase/firestore', 'firebase/auth']
            }
          }
        }
      }
    };
});

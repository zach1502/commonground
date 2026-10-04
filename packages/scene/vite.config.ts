import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../vitest.shared.config.ts';

const DEV_SERVER_PORT = 5174;

// Serves the scene dev page in dev/, which renders ParkViewer with a synthetic island.
export default defineConfig({
  root: 'dev',
  // The web app's public folder holds the pipeline's GLBs and their index under models/.
  publicDir: '../../../apps/web/public',
  plugins: [react()],
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  // Pre-bundled up front so Vite does not reload the page mid-test when it finds them.
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
    ],
  },
  server: { port: DEV_SERVER_PORT, strictPort: true },
  preview: { port: DEV_SERVER_PORT, strictPort: true },
});

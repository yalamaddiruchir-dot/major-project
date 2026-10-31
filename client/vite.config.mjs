import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

// Emit /asset-manifest.json in { files: { ... } } format so public/service-worker.js
// precaches every hashed JS, CSS, and offline Indic font asset on initial install.
const emitServiceWorkerAssetManifest = () => ({
  name: 'emit-sw-asset-manifest',
  generateBundle(_options, bundle) {
    const files = {};
    for (const fileName of Object.keys(bundle)) {
      if (!fileName.endsWith('.map')) {
        files[fileName] = `/${fileName}`;
      }
    }
    this.emitFile({
      type: 'asset',
      fileName: 'asset-manifest.json',
      source: JSON.stringify({ files }, null, 2),
    });
  },
});

export default defineConfig({
  plugins: [
    {
      name: 'treat-src-js-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\/src\/.*\.js$/.test(id)) return null;
        return transformWithOxc(code, id, {
          lang: 'jsx',
        });
      },
    },
    react(),
    emitServiceWorkerAssetManifest(),
  ],
  envPrefix: ['VITE_', 'REACT_APP_'],
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: {
        '.js': 'jsx',
      },
    },
  },
  build: {
    outDir: 'build',
    assetsDir: 'static',
    emptyOutDir: true,
    rolldownOptions: {
      moduleTypes: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    fileParallelism: false,
    testTimeout: 60000,
  },
});

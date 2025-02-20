import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  platform: 'browser',
  target: 'es2020',
  noExternal: [
    '@stacks/connect',
    '@stacks/network',
    '@stacks/transactions',
    '@vercel/kv'
  ],
  external: [
    'axios'
  ],
  esbuildOptions(options) {
    options.define = {
      'global': 'globalThis',
      'process.env.NODE_ENV': '"production"'
    };
    options.inject = [
      // Inject polyfills for browser environment
      'node_modules/tsup/assets/cjs_shims.js'
    ];
    options.mainFields = ['browser', 'module', 'main'];
    options.conditions = ['browser', 'import', 'default'];
  }
});

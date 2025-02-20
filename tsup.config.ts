import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  platform: 'neutral',
  target: 'es2020',
  external: [
    '@stacks/connect',
    '@stacks/network',
    '@stacks/transactions',
    'axios',
    'fs',
    'path',
    'os',
    'crypto',
    'dotenv'
  ],
  noExternal: ['@vercel/kv'],
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      'global': 'globalThis'
    };
    options.platform = 'neutral';
    options.conditions = ['import', 'default'];
  }
});

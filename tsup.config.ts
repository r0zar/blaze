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
    'axios'
  ]
});

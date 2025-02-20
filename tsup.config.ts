import { defineConfig } from 'tsup';

export default defineConfig([
  // Types build
  {
    entry: ['src/types.ts'],
    outDir: 'dist',
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    platform: 'neutral'
  },

  // Client build
  {
    entry: ['src/client/index.ts'],
    outDir: 'dist/client',
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    platform: 'browser',
    target: 'es2020',
    external: [
      '@stacks/connect',
      '@stacks/network',
      '@stacks/transactions',
      'axios'
    ],
    esbuildOptions(options) {
      options.define = {
        'process.env.BROWSER': 'true',
        'global': 'window'
      };
    },
    inject: ['src/client/use-client.ts']
  },

  // Server build
  {
    entry: ['src/server/index.ts'],
    outDir: 'dist/server',
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    platform: 'node',
    target: 'node18',
    external: [
      '@stacks/network',
      '@stacks/transactions',
      'axios',
      '@vercel/kv'
    ],
    esbuildOptions(options) {
      options.define = {
        'process.env.BROWSER': 'false'
      };
    }
  }
]);

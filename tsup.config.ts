import { defineConfig, Options } from 'tsup';
import { readFileSync } from 'fs';

// Read package.json for version and other metadata
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Shared base configuration
const baseConfig: Partial<Options> = {
  clean: true,
  dts: true,
  format: ['cjs', 'esm'] as const,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  treeshake: true,
  splitting: true,
  tsconfig: './tsconfig.json',
};

// Environment-specific defines
const defines = {
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  'process.env.VERSION': JSON.stringify(pkg.version)
};

// Node.js built-in modules
const nodeBuiltins = ['fs', 'path', 'os', 'crypto'];

export default defineConfig([
  // Shared/core package
  {
    ...baseConfig,
    entry: ['src/index.ts'],
    outDir: 'dist',
    platform: 'node',
    external: [
      ...nodeBuiltins,
      '@stacks/connect',
      '@stacks/network',
      '@stacks/transactions',
      'axios',
      'dotenv',
      '@vercel/kv',
    ],
    esbuildOptions(options) {
      options.define = {
        ...defines,
      };
    },
    onSuccess: 'tsc --emitDeclarationOnly --declaration',
  },

  // Client-specific build
  {
    ...baseConfig,
    entry: {
      index: 'src/client/index.ts',
    },
    outDir: 'dist/client',
    platform: 'browser',
    target: ['es2020'],
    external: [
      ...nodeBuiltins,
      '@stacks/connect',
      '@stacks/network',
      '@stacks/transactions',
      'axios',
      'dotenv',
    ],
    esbuildOptions(options) {
      options.define = {
        ...defines,
        'process.env.BROWSER': 'true',
        'global': 'window',
      };
    },
    inject: ['src/client/use-client.ts'],
  },

  // Server-specific build
  {
    ...baseConfig,
    entry: ['src/server/index.ts'],
    outDir: 'dist/server',
    platform: 'node',
    target: ['node16'],
    external: [
      '@vercel/kv',
      '@stacks/network',
      '@stacks/transactions',
      'axios',
    ],
    esbuildOptions(options) {
      options.define = {
        ...defines,
        'process.env.BROWSER': 'false',
        'process.env.PRIVATE_KEY': 'process.env.PRIVATE_KEY',
      };
    },
    noExternal: ['@stacks/connect', 'dotenv'],
  }
]);

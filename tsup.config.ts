import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

// Read package.json for version and other metadata
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Shared base configuration
const baseConfig = {
  clean: true,
  dts: true,
  format: ['cjs', 'esm'],
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

export default defineConfig([
  // Shared/core package
  {
    ...baseConfig,
    entry: ['src/index.ts'],
    outDir: 'dist',
    platform: 'neutral',
    esbuildOptions(options) {
      options.define = {
        ...defines,
        // Add any shared defines here
      };
    },
    onSuccess: 'tsc --emitDeclarationOnly --declaration',
  },
  
  // Client-specific build
  {
    ...baseConfig,
    entry: ['src/client/index.ts'],
    outDir: 'dist/client',
    platform: 'browser',
    target: ['es2020'],
    external: [
      '@stacks/connect',
      '@stacks/network',
      '@stacks/transactions',
      'axios',
    ],
    esbuildOptions(options) {
      options.define = {
        ...defines,
        'process.env.BROWSER': 'true',
        'global': 'window',
      };
      options.banner = {
        js: '"use client";', // React server components support
      };
    }
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
      'dotenv',
    ],
    esbuildOptions(options) {
      options.define = {
        ...defines,
        'process.env.BROWSER': 'false',
        // Don't inline PRIVATE_KEY - let it be provided at runtime
        'process.env.PRIVATE_KEY': 'process.env.PRIVATE_KEY',
      };
    },
    noExternal: ['@stacks/connect'], // Force include if needed server-side
  }
]);

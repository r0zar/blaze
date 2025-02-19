import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/client/index.ts',
        'src/server/index.ts'
    ],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    env: {
        NODE_ENV: 'production'
    },
    esbuildOptions(options) {
        options.define = {
            'process.env.NODE_ENV': '"production"',
            'process.env.VERCEL': 'undefined',
            'process.env.VERCEL_ENV': 'undefined'
        };
    }
}); 
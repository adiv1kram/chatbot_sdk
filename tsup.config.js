import { defineConfig } from 'tsup';

/**
 * Two builds:
 * 1. Main package — ESM + CJS for each subpath export, plus the admin handler
 *    and the admin UI bundle. React is external so consumers' app supplies it.
 *    Node builtins and the optional @aws-sdk/client-s3 dep are also external.
 * 2. Vanilla IIFE — single self-contained bundle at dist/vanilla.js for
 *    <script>-tag usage. React + react-dom are bundled in.
 */
export default defineConfig([
  {
    entry: {
      'server/index': 'src/server/index.js',
      'server/next': 'src/server/next.js',
      'server/express': 'src/server/express.js',
      'react/index': 'src/react/index.jsx',
      'vanilla/embed': 'src/vanilla/embed.js',
      'cli/init': 'src/cli/init.js',
      'cli/create': 'src/cli/create.js',
      'storage/index': 'src/storage/index.js',
      'admin/handler': 'src/admin/handler.js',
      'notify/index': 'src/notify/index.js',
    },
    outDir: 'dist',
    format: ['esm', 'cjs'],
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
    // CLI entries are executable scripts and admin/ui is a plain browser
    // script — TypeScript's declaration emitter can't represent either, so
    // skip dts for those.
    dts: {
      entry: {
        'server/index': 'src/server/index.js',
        'server/next': 'src/server/next.js',
        'server/express': 'src/server/express.js',
        'react/index': 'src/react/index.jsx',
        'vanilla/embed': 'src/vanilla/embed.js',
        'storage/index': 'src/storage/index.js',
        'admin/handler': 'src/admin/handler.js',
        'notify/index': 'src/notify/index.js',
      },
    },
    clean: true,
    splitting: false,
    sourcemap: true,
    treeshake: true,
    target: 'node18',
    platform: 'neutral',
    external: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@aws-sdk/client-s3',
      'nodemailer',
    ],
    esbuildOptions(options) {
      options.jsx = 'automatic';
    },
  },
  {
    entry: { vanilla: 'src/vanilla/embed.js' },
    outDir: 'dist',
    format: ['iife'],
    globalName: 'PersonalAssistantBundle',
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: true,
    target: 'es2020',
    platform: 'browser',
    external: [],
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.define = {
        ...(options.define || {}),
        'process.env.NODE_ENV': '"production"',
      };
    },
  },
]);

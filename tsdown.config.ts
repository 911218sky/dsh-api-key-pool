import type { UserConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-api-key-pool'

const neverBundle = [/^node:/, /^@deepseek-ai\//, 'react', 'react/jsx-runtime', 'react-dom']

const config: UserConfig = [
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: false,
    deps: { neverBundle },
    outputOptions: {
      entryFileNames: 'index.js',
    },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    format: ['cjs'],
    platform: 'browser',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: true,
    deps: { neverBundle },
    outputOptions: {
      entryFileNames: 'client.js',
      format: 'cjs',
      exports: 'named',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports;\n} });',
      intro: 'var module = { exports: {} };\nvar exports = module.exports;',
    },
  },
]

export default config

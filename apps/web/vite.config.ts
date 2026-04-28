import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type AliasOptions } from 'vite';

function localPackageSource(relativePath: string): string {
  return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
}

const devWorkspaceAliases: AliasOptions = [
  { find: '@mantle/engine/catalog', replacement: localPackageSource('packages/engine/src/catalog.ts') },
  { find: '@mantle/engine/commands', replacement: localPackageSource('packages/engine/src/commands.ts') },
  { find: '@mantle/engine/render', replacement: localPackageSource('packages/engine/src/render.ts') },
  { find: '@mantle/engine', replacement: localPackageSource('packages/engine/src/index.ts') },
  { find: '@mantle/schemas/defaults', replacement: localPackageSource('packages/schemas/src/defaults.ts') },
  { find: '@mantle/schemas/model', replacement: localPackageSource('packages/schemas/src/model.ts') },
  { find: '@mantle/schemas/validation', replacement: localPackageSource('packages/schemas/src/validation.ts') },
  { find: '@mantle/schemas', replacement: localPackageSource('packages/schemas/src/index.ts') }
];

export default defineConfig(({ command }) => ({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    })
  ],
  ...(command === 'serve'
    ? {
        resolve: {
          alias: devWorkspaceAliases
        }
      }
    : {}),
  worker: {
    format: 'es'
  }
}));

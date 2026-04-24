import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/**/src/**/*.{test,spec}.ts',
      'apps/**/src/**/*.{test,spec}.tsx',
      'packages/**/src/**/*.{test,spec}.ts',
      'packages/**/src/**/*.{test,spec}.tsx'
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/**/e2e/**'],
    passWithNoTests: true,
    reporters: ['default']
  }
});

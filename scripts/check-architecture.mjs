import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['apps', 'packages'].map((item) => path.join(rootDir, item));
const checkedExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

const failures = [];

function isMissingPathError(error) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (!isMissingPathError(error)) throw error;
    return false;
  }
}

async function walkFiles(dir) {
  if (!(await pathExists(dir))) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...await walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function findEmptyDirs(dir) {
  if (!(await pathExists(dir))) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const nestedEmptyDirs = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      nestedEmptyDirs.push(...await findEmptyDirs(path.join(dir, entry.name)));
    }
  }

  if (entries.length === 0) {
    nestedEmptyDirs.push(dir);
  }

  return nestedEmptyDirs;
}

function relativePath(filePath) {
  return path.relative(rootDir, filePath);
}

async function assertNoWorkspaceSubpathImports() {
  const files = (await Promise.all(sourceRoots.map(walkFiles))).flat();
  const workspaceSubpathImportPattern =
    /(?:from\s+|import\s*\(\s*)['"](@mantle\/(?:engine|schemas)\/[^'"]+)['"]/g;
  const allowedPublicSubpaths = new Set([
    '@mantle/engine/catalog',
    '@mantle/engine/commands',
    '@mantle/engine/render',
    '@mantle/schemas/defaults',
    '@mantle/schemas/model',
    '@mantle/schemas/validation'
  ]);

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    const privateImports = [...contents.matchAll(workspaceSubpathImportPattern)]
      .map((match) => match[1])
      .filter((specifier) => !allowedPublicSubpaths.has(specifier));

    if (privateImports.length > 0) {
      failures.push(
        `${relativePath(file)} imports a private @mantle package subpath (${privateImports.join(', ')}). Use an explicit public facade.`
      );
    }
  }
}

async function assertEngineRootExportsStayExplicit() {
  const engineIndex = path.join(rootDir, 'packages/engine/src/index.ts');
  const contents = await readFile(engineIndex, 'utf8');
  const forbidden = [
    "export * from './composition'",
    "export * from './backgrounds'",
    "export * from './frames'",
    "export * from './memoryBudget'",
    "export * from './palette'",
    "export * from './shadows'"
  ];

  forbidden.forEach((snippet) => {
    if (contents.includes(snippet)) {
      failures.push(
        `packages/engine/src/index.ts re-exports internals with "${snippet}". Keep the public facade explicit.`
      );
    }
  });
}

async function assertNoEmptySourceDirs() {
  const dirs = [
    'apps/web/src',
    'packages/engine/src',
    'packages/schemas/src'
  ].map((item) => path.join(rootDir, item));
  const emptyDirs = (await Promise.all(dirs.map(findEmptyDirs))).flat();

  emptyDirs.forEach((dir) => {
    failures.push(`${relativePath(dir)} is empty; remove stale architecture signals.`);
  });
}

async function assertNoLegacyRuntimeIdentifiers() {
  const files = (await Promise.all(sourceRoots.map(walkFiles))).flat();
  const forbiddenIdentifiers = [
    '@ascii-lab',
    'ASCII Lab',
    'AsciiPreview',
    'Glyphrame',
    'glyphrame',
    'Launch Kit',
    'launch-kit',
    'conversionPresets',
    'createEngineSession',
    'detectEngineCapabilities',
    'exportPlaceholderResult',
    'renderGlyphrameCard',
    'sourceDescriptor'
  ];

  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    const matches = forbiddenIdentifiers.filter((identifier) =>
      contents.includes(identifier)
    );

    if (matches.length > 0) {
      failures.push(
        `${relativePath(file)} contains legacy runtime identifier(s): ${matches.join(', ')}. Keep active Mantle code paths singular.`
      );
    }
  }
}

await assertNoWorkspaceSubpathImports();
await assertEngineRootExportsStayExplicit();
await assertNoEmptySourceDirs();
await assertNoLegacyRuntimeIdentifiers();

if (failures.length > 0) {
  console.error('Architecture check failed:');
  failures.forEach((failure) => {
    console.error(`- ${failure}`);
  });
  process.exit(1);
}

console.log('Architecture check passed.');

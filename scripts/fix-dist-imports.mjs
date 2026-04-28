import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] ?? 'dist');
const jsExtensions = new Set(['.js', '.mjs', '.cjs', '.json']);

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false;
    }
    throw error;
  }
}

function shouldRewriteFile(filePath) {
  return filePath.endsWith('.js') || filePath.endsWith('.d.ts');
}

async function walkGeneratedFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkGeneratedFiles(fullPath));
      continue;
    }
    if (entry.isFile() && shouldRewriteFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function resolveRuntimeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return specifier;
  }

  if (jsExtensions.has(path.extname(specifier))) {
    return specifier;
  }

  const basePath = path.resolve(path.dirname(filePath), specifier);
  if (await pathExists(`${basePath}.js`)) {
    return `${specifier}.js`;
  }
  if (await pathExists(path.join(basePath, 'index.js'))) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function replaceAsync(input, pattern, replacer) {
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) return input;

  let output = '';
  let offset = 0;
  for (const match of matches) {
    output += input.slice(offset, match.index);
    output += await replacer(match);
    offset = (match.index ?? 0) + match[0].length;
  }
  output += input.slice(offset);
  return output;
}

async function rewriteFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  let next = await replaceAsync(
    source,
    /(from\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,
    async (match) =>
      `${match[1]}${await resolveRuntimeSpecifier(filePath, match[2])}${match[3]}`
  );
  next = await replaceAsync(
    next,
    /(import\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    async (match) =>
      `${match[1]}${await resolveRuntimeSpecifier(filePath, match[2])}${match[3]}`
  );
  next = await replaceAsync(
    next,
    /(import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g,
    async (match) =>
      `${match[1]}${await resolveRuntimeSpecifier(filePath, match[2])}${match[3]}`
  );

  if (next !== source) {
    await writeFile(filePath, next);
  }
}

for (const filePath of await walkGeneratedFiles(distDir)) {
  await rewriteFile(filePath);
}

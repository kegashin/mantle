import {
  MantleProjectSchema,
  MantleThemeSchema
} from '@mantle/schemas/validation';
import type {
  MantleBackground,
  MantleFrame,
  MantleText,
  MantleTheme
} from '@mantle/schemas/model';

import type { StylePreset } from './stylePresets';

export const MANTLE_PRESET_VERSION = 1;
export const USER_PRESET_ACCEPT =
  '.json,.mantle-preset.json,.mantle.json,application/json';

const USER_PRESET_DATABASE_NAME = 'mantle-user-presets';
const USER_PRESET_DATABASE_VERSION = 1;
const USER_PRESET_STORE_NAME = 'presets';

export type MantlePresetDocument = {
  mantlePresetVersion: typeof MANTLE_PRESET_VERSION;
  id: string;
  name: string;
  description?: string | undefined;
  createdAt: string;
  updatedAt: string;
  style: {
    background: MantleBackground;
    frame: MantleFrame;
    text: MantleText;
  };
};

export type UserStylePreset = StylePreset & {
  importedAt: string;
  sourceName: string;
  document: MantlePresetDocument;
};

type StoredUserPreset = MantlePresetDocument & {
  importedAt: string;
  sourceName: string;
};

type UserPresetParseResult = {
  presets: UserStylePreset[];
  failures: string[];
};

type UserPresetEnvelope = {
  mantlePresetVersion?: unknown;
  id?: unknown;
  name?: unknown;
  description?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  style?: unknown;
  preset?: {
    label?: string;
    name?: string;
    hint?: string;
    theme?: unknown;
  };
  theme?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stableIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function createPresetId(name: string): string {
  const suffix =
    'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `user:${stableIdPart(name) || 'preset'}:${suffix}`;
}

function assertPortableStyle(
  style: MantlePresetDocument['style'],
  sourceName: string
): void {
  if (style.background.presetId === 'image-fill') {
    throw new Error(
      `${sourceName} uses an image background. Library presets can store portable styles only.`
    );
  }
}

function normalizePresetDocument(
  document: MantlePresetDocument,
  sourceName: string
): MantlePresetDocument {
  const theme = MantleThemeSchema.parse({
    id: document.id,
    name: document.name,
    background: document.style.background,
    frame: document.style.frame,
    text: document.style.text
  });

  const normalized: MantlePresetDocument = {
    mantlePresetVersion: MANTLE_PRESET_VERSION,
    id: document.id,
    name: document.name,
    description: document.description,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    style: {
      background: theme.background,
      frame: theme.frame,
      text: theme.text
    }
  };
  assertPortableStyle(normalized.style, sourceName);
  return normalized;
}

function createUserPresetFromDocument(
  document: MantlePresetDocument,
  sourceName: string,
  importedAt = new Date().toISOString()
): UserStylePreset {
  const normalized = normalizePresetDocument(document, sourceName);
  return {
    id: normalized.id,
    label: normalized.name,
    hint: normalized.description?.trim() || sourceName,
    background: normalized.style.background,
    frame: normalized.style.frame,
    text: normalized.style.text,
    importedAt,
    sourceName,
    document: normalized
  };
}

function documentFromTheme({
  theme,
  fileName,
  name,
  description
}: {
  theme: MantleTheme;
  fileName: string;
  name?: string | undefined;
  description?: string | undefined;
}): MantlePresetDocument {
  const now = new Date().toISOString();
  const resolvedName = name?.trim() || theme.name;
  return {
    mantlePresetVersion: MANTLE_PRESET_VERSION,
    id: theme.id.startsWith('user:') ? theme.id : `user:${stableIdPart(fileName)}:${theme.id}`,
    name: resolvedName,
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    style: {
      background: theme.background,
      frame: theme.frame,
      text: theme.text
    }
  };
}

function parseVersionedPreset(raw: UserPresetEnvelope): MantlePresetDocument | undefined {
  if (raw.mantlePresetVersion !== MANTLE_PRESET_VERSION || !isObject(raw.style)) {
    return undefined;
  }

  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    throw new Error('Preset id and name are required.');
  }

  return {
    mantlePresetVersion: MANTLE_PRESET_VERSION,
    id: raw.id,
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    style: raw.style as MantlePresetDocument['style']
  };
}

function parsePresetCandidate(raw: unknown, fileName: string): UserStylePreset[] {
  const envelope = isObject(raw) ? (raw as UserPresetEnvelope) : {};
  const versionedPreset = parseVersionedPreset(envelope);
  if (versionedPreset) {
    return [createUserPresetFromDocument(versionedPreset, fileName)];
  }

  const projectResult = MantleProjectSchema.safeParse(raw);
  if (projectResult.success) {
    const project = projectResult.data;
    const activeCard =
      project.cards.find((card) => card.id === project.activeCardId) ??
      project.cards[0];
    if (!activeCard) return [];

    const document = documentFromTheme({
      theme: {
        id: activeCard.themeId,
        name: activeCard.name,
        background: activeCard.background,
        frame: activeCard.frame,
        text: activeCard.text
      },
      fileName,
      name: activeCard.name,
      description: project.name
    });
    return [createUserPresetFromDocument(document, fileName)];
  }

  const wrappedPreset = isObject(envelope.preset) ? envelope.preset : undefined;
  const candidate =
    wrappedPreset?.theme ??
    envelope.theme ??
    (isObject(raw) && 'background' in raw && 'frame' in raw && 'text' in raw
      ? raw
      : undefined);
  const theme = MantleThemeSchema.parse(candidate);
  const document = documentFromTheme({
    theme,
    fileName,
    name: wrappedPreset?.label ?? wrappedPreset?.name,
    description: wrappedPreset?.hint
  });
  return [createUserPresetFromDocument(document, fileName)];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.oncomplete = () => resolve();
  });
}

function openUserPresetDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      USER_PRESET_DATABASE_NAME,
      USER_PRESET_DATABASE_VERSION
    );
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(USER_PRESET_STORE_NAME)) {
        database.createObjectStore(USER_PRESET_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function storedPresetToUserPreset(stored: StoredUserPreset): UserStylePreset | undefined {
  try {
    return createUserPresetFromDocument(stored, stored.sourceName, stored.importedAt);
  } catch {
    return undefined;
  }
}

function userPresetToStoredPreset(preset: UserStylePreset): StoredUserPreset {
  return {
    ...preset.document,
    importedAt: preset.importedAt,
    sourceName: preset.sourceName
  };
}

export function createUserStylePreset({
  name,
  description,
  background,
  frame,
  text,
  sourceName = 'Saved style'
}: {
  name: string;
  description?: string | undefined;
  background: MantleBackground;
  frame: MantleFrame;
  text: MantleText;
  sourceName?: string | undefined;
}): UserStylePreset {
  const now = new Date().toISOString();
  const document = normalizePresetDocument(
    {
      mantlePresetVersion: MANTLE_PRESET_VERSION,
      id: createPresetId(name),
      name: name.trim() || 'Untitled preset',
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      style: { background, frame, text }
    },
    sourceName
  );
  return createUserPresetFromDocument(document, sourceName, now);
}

export function serializeUserStylePreset(preset: UserStylePreset): string {
  return `${JSON.stringify(preset.document, null, 2)}\n`;
}

export async function parseUserPresetFiles(
  files: readonly File[]
): Promise<UserPresetParseResult> {
  const presets: UserStylePreset[] = [];
  const failures: string[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      presets.push(...parsePresetCandidate(raw, file.name));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Invalid preset file.';
      failures.push(`${file.name}: ${detail}`);
    }
  }

  return { presets, failures };
}

export function mergeUserStylePresets(
  current: readonly UserStylePreset[],
  incoming: readonly UserStylePreset[]
): UserStylePreset[] {
  const byId = new Map(current.map((preset) => [preset.id, preset]));
  incoming.forEach((preset) => byId.set(preset.id, preset));
  return Array.from(byId.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

export async function loadUserStylePresets(): Promise<UserStylePreset[]> {
  const database = await openUserPresetDatabase();
  try {
    const transaction = database.transaction(USER_PRESET_STORE_NAME, 'readonly');
    const store = transaction.objectStore(USER_PRESET_STORE_NAME);
    const storedPresets = await requestResult<StoredUserPreset[]>(store.getAll());
    await transactionDone(transaction);
    return storedPresets
      .flatMap((stored): UserStylePreset[] => {
        const preset = storedPresetToUserPreset(stored);
        return preset ? [preset] : [];
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  } finally {
    database.close();
  }
}

export async function saveUserStylePresets(
  presets: readonly UserStylePreset[]
): Promise<void> {
  const database = await openUserPresetDatabase();
  try {
    const transaction = database.transaction(USER_PRESET_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(USER_PRESET_STORE_NAME);
    store.clear();
    presets.forEach((preset) => store.put(userPresetToStoredPreset(preset)));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

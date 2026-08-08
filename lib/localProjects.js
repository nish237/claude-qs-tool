// One-time rescue for projects saved before accounts existed, when Scale Up
// stored everything in the browser's IndexedDB. Everything here is
// best-effort: it must never throw into a render, only report what it could
// or couldn't do.
import { saveProject } from '@/lib/db';

const OLD_DB_NAME = 'quantsurv-ai';
const OLD_STORE = 'projects';
const DISMISS_KEY = 'scaleup_migration_dismissed';

function openOldDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(OLD_DB_NAME);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
    // A missing database still fires onsuccess with an empty DB in most
    // browsers, but onupgradeneeded firing here would mean it never existed —
    // treat that the same as "nothing to migrate".
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      db.close();
      indexedDB.deleteDatabase(OLD_DB_NAME);
      resolve(null);
    };
  });
}

export async function readLocalProjects() {
  try {
    const db = await openOldDB();
    if (!db || !db.objectStoreNames.contains(OLD_STORE)) {
      db?.close?.();
      return [];
    }
    return await new Promise((resolve) => {
      const tx = db.transaction(OLD_STORE, 'readonly');
      const req = tx.objectStore(OLD_STORE).getAll();
      req.onsuccess = (e) => { resolve(e.target.result || []); db.close(); };
      req.onerror = () => { resolve([]); db.close(); };
    });
  } catch {
    return [];
  }
}

export async function countLocalProjects() {
  const projects = await readLocalProjects();
  return projects.length;
}

export async function migrateLocalProjects() {
  const projects = await readLocalProjects();
  let migrated = 0;
  let failed = 0;

  for (const project of projects) {
    try {
      // upsert by id, so running this twice just re-saves the same rows.
      await saveProject(project);
      migrated += 1;
    } catch {
      failed += 1;
    }
  }

  return { migrated, failed, total: projects.length };
}

export function clearLocalProjects() {
  try {
    if (typeof indexedDB === 'undefined') return;
    indexedDB.deleteDatabase(OLD_DB_NAME);
  } catch {
    // Best effort — leaving the old database in place is harmless.
  }
}

export function hasDismissedMigration() {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissMigration() {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore
  }
}

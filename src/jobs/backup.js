import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/db.js';

const KEEP_DAYS = 14;
const dir = path.join(path.dirname(config.dbPath), 'backups');

/** SQLite's online backup is safe while the app is writing, unlike copying the file. */
async function backupNow() {
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `console-${day}.db`);
  if (fs.existsSync(file)) return;
  await db.backup(file);
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.startsWith('console-') && fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full);
  }
  console.log(`Backup written to ${file}`);
}

export function startBackups() {
  const run = () => backupNow().catch(e => console.error('Backup failed:', e.message));
  run();
  setInterval(run, 60 * 60 * 1000);
}

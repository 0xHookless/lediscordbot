import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const DEFAULT_SETTINGS = {
  staffRoles: config.staffRoleIds,
  supportChannels: [],
  hiddenChannels: [],
  postRoles: {},
  signatureFormat: '— {first} · {role}'
};

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : structuredClone(DEFAULT_SETTINGS[key]);
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function allSettings() {
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k => [k, getSetting(k)]));
}

export function audit({ userId, action, channelId = null, messageId = null, content = '' }) {
  db.prepare('INSERT INTO audit_log (at, user_id, action, channel_id, message_id, content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Date.now(), userId, action, channelId, messageId, String(content).slice(0, 500));
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

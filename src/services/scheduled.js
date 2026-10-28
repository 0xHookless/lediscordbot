import { db, getUser } from '../db/db.js';
import { guild } from '../bot/client.js';
import { broadcast } from '../server/socket.js';

/** Pending and failed posts, plus anything sent in the last day so staff can see it went out. */
export function listScheduled() {
  const members = guild()?.members.cache;
  return db.prepare(`SELECT * FROM scheduled
                     WHERE status IN ('pending', 'failed') OR (status = 'sent' AND updated_at > ?)
                     ORDER BY run_at`)
    .all(Date.now() - 24 * 60 * 60 * 1000)
    .map(s => ({
      id: s.id,
      channelId: s.channel_id,
      runAt: s.run_at,
      payload: JSON.parse(s.payload),
      createdBy: s.created_by,
      createdByName: members?.get(s.created_by)?.displayName || getUser(s.created_by)?.name || 'Staff',
      createdByAvatar: members?.get(s.created_by)?.displayAvatarURL({ size: 64, extension: 'webp' }) || null,
      status: s.status,
      error: s.error,
      messageId: s.message_id
    }));
}

export const broadcastScheduled = () => broadcast('scheduled:update', { scheduled: listScheduled() });

export function listTemplates() {
  return db.prepare('SELECT id, name, data FROM templates ORDER BY name').all()
    .map(t => ({ id: t.id, name: t.name, embed: JSON.parse(t.data) }));
}

import { db, getSetting } from '../db/db.js';
import { client, guild } from '../bot/client.js';
import { isStaffMember, staffRoleIds } from './access.js';
import { broadcast } from '../server/socket.js';

/** Unanswered questions: support channels, DMs, and mentions of the bot or a staff role. */
export function shouldQueue(m) {
  if (m.author.bot || m.system) return false;
  const member = m.member ?? guild()?.members.cache.get(m.author.id);
  if (isStaffMember(member)) return false;
  if (!m.guildId) return true;
  const ids = staffRoleIds();
  return getSetting('supportChannels').includes(m.channelId)
    || m.mentions.users.has(client.user.id)
    || m.mentions.roles.some(r => ids.includes(r.id));
}

export function add(m) {
  const content = m.content || (m.attachments.size ? 'Sent an attachment' : '');
  db.prepare(`INSERT OR IGNORE INTO queue (message_id, channel_id, author_id, author_name, author_avatar, content, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(m.id, m.channelId, m.author.id, m.member?.displayName || m.author.globalName || m.author.username,
      (m.member ?? m.author).displayAvatarURL({ size: 64, extension: 'webp' }), content.slice(0, 500), m.createdTimestamp);
  changed();
}

export function resolve(messageId) {
  const r = db.prepare('UPDATE queue SET resolved_at = ? WHERE message_id = ? AND resolved_at IS NULL').run(Date.now(), messageId);
  if (r.changes) changed();
  return r.changes;
}

export function resolveChannel(channelId) {
  const r = db.prepare('UPDATE queue SET resolved_at = ? WHERE channel_id = ? AND resolved_at IS NULL').run(Date.now(), channelId);
  if (r.changes) changed();
  return r.changes;
}

export function claim(messageId, userId) {
  const r = db.prepare('UPDATE queue SET claimed_by = ? WHERE message_id = ? AND resolved_at IS NULL').run(userId, messageId);
  if (r.changes) changed();
  return r.changes;
}

export function listQueue() {
  const members = guild()?.members.cache;
  return db.prepare('SELECT * FROM queue WHERE resolved_at IS NULL ORDER BY created_at').all().map(q => ({
    messageId: q.message_id,
    channelId: q.channel_id,
    authorId: q.author_id,
    authorName: q.author_name,
    authorAvatar: q.author_avatar,
    content: q.content,
    createdAt: q.created_at,
    claimedBy: q.claimed_by,
    claimedByName: q.claimed_by ? members?.get(q.claimed_by)?.displayName || 'A staff member' : null,
    claimedByAvatar: q.claimed_by ? members?.get(q.claimed_by)?.displayAvatarURL({ size: 64, extension: 'webp' }) || null : null
  }));
}

function changed() {
  broadcast('queue:update', { queue: listQueue() });
}

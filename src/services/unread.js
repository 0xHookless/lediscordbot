import { db } from '../db/db.js';
import { client } from '../bot/client.js';
import { staffRoleIds } from './access.js';

/** Messages after this staff member's last-read point, counted from the bot's message cache. */
export function unreadFor(userId, channels) {
  const lastRead = Object.fromEntries(
    db.prepare('SELECT channel_id, last_read_id FROM read_state WHERE user_id = ?').all(userId).map(r => [r.channel_id, r.last_read_id])
  );
  const staffIds = staffRoleIds();
  const out = {};
  for (const channel of channels) {
    const last = lastRead[channel.id];
    if (!last) continue;
    const fresh = [...channel.messages.cache.values()]
      .filter(m => BigInt(m.id) > BigInt(last) && m.author.id !== client.user.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    if (!fresh.length) continue;
    const mentions = fresh.filter(m => !m.guildId
      || m.mentions.everyone
      || m.mentions.users.has(client.user.id)
      || m.mentions.users.has(userId)
      || m.mentions.roles.some(r => staffIds.includes(r.id))).length;
    out[channel.id] = { u: fresh.length, m: mentions, first: fresh[0].id };
  }
  return out;
}

/** New channels start as read, so staff aren't greeted by years of history marked unread. */
export function initReadState(userId, channels) {
  const insert = db.prepare('INSERT OR IGNORE INTO read_state (user_id, channel_id, last_read_id) VALUES (?, ?, ?)');
  for (const c of channels) if (c.lastMessageId) insert.run(userId, c.id, c.lastMessageId);
}

export function markRead(userId, channelId, messageId) {
  db.prepare(`INSERT INTO read_state (user_id, channel_id, last_read_id) VALUES (?, ?, ?)
              ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_id = excluded.last_read_id`)
    .run(userId, channelId, messageId);
}

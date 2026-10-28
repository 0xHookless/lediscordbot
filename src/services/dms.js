import { db } from '../db/db.js';
import { client } from '../bot/client.js';
import { broadcast } from '../server/socket.js';

export function listDMs() {
  return db.prepare('SELECT * FROM dm_channels ORDER BY last_message_at DESC').all().map(row => {
    const user = client.users.cache.get(row.user_id);
    return {
      id: row.channel_id,
      kind: 'dm',
      userId: row.user_id,
      name: user ? user.globalName || user.username : 'Unknown user',
      avatar: user ? user.displayAvatarURL({ size: 64, extension: 'webp' }) : null,
      topic: `Direct messages with ${user ? user.globalName || user.username : 'this member'}. Replies go from the bot.`,
      canPost: true,
      lockedReason: null
    };
  });
}

export function trackDM(channelId, userId) {
  const existing = db.prepare('SELECT 1 FROM dm_channels WHERE channel_id = ?').get(channelId);
  db.prepare(`INSERT INTO dm_channels (channel_id, user_id, last_message_at) VALUES (?, ?, ?)
              ON CONFLICT(channel_id) DO UPDATE SET last_message_at = excluded.last_message_at`)
    .run(channelId, userId, Date.now());
  if (!existing) broadcast('dms:update', { dms: listDMs() });
}

export function dmChannelObjects() {
  return db.prepare('SELECT channel_id FROM dm_channels').all()
    .map(r => client.channels.cache.get(r.channel_id)).filter(Boolean);
}

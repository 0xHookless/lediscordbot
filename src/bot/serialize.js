import { db } from '../db/db.js';
import { client } from './client.js';
import { hexOrNull, isStaffMember, staffRoleIds } from '../services/access.js';

export function authorInfo(user, member) {
  return {
    id: user.id,
    name: member?.displayName || user.globalName || user.username,
    avatar: (member ?? user).displayAvatarURL({ size: 64, extension: 'webp' }),
    color: member ? hexOrNull(member.displayHexColor) : null,
    bot: user.bot,
    staff: isStaffMember(member)
  };
}

function displayName(message) {
  return message.member?.displayName || message.author.globalName || message.author.username;
}

export function serializeMessage(m) {
  const via = db.prepare('SELECT user_id FROM sent_by WHERE message_id = ?').get(m.id);
  const ref = m.reference?.messageId ? m.channel.messages.cache.get(m.reference.messageId) : null;
  const staffIds = staffRoleIds();
  return {
    id: m.id,
    channelId: m.channelId,
    createdAt: m.createdTimestamp,
    editedAt: m.editedTimestamp,
    author: authorInfo(m.author, m.member),
    content: m.content || '',
    pinned: m.pinned,
    system: m.system,
    isDM: !m.guildId,
    via: via ? via.user_id : null,
    attachments: [...m.attachments.values()].map(a => ({ id: a.id, name: a.name, url: a.url, size: a.size, contentType: a.contentType })),
    embeds: m.embeds.map(e => ({
      title: e.title, description: e.description, color: e.hexColor, url: e.url,
      fields: e.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })),
      footer: e.footer?.text || null, timestamp: e.timestamp, image: e.image?.url || e.thumbnail?.url || null
    })),
    reactions: [...m.reactions.cache.values()].map(r => ({
      key: r.emoji.id ? r.emoji.identifier : r.emoji.name,
      emoji: r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name,
      count: r.count,
      me: r.me
    })),
    reference: m.reference?.messageId ? {
      messageId: m.reference.messageId,
      authorName: ref ? displayName(ref) : null,
      snippet: ref ? (ref.content || ref.embeds[0]?.title || 'Attachment').slice(0, 140) : null
    } : null,
    mentions: {
      users: Object.fromEntries(m.mentions.users.map(u => [u.id, m.mentions.members?.get(u.id)?.displayName || u.globalName || u.username])),
      roles: Object.fromEntries(m.mentions.roles.map(r => [r.id, r.name])),
      channels: Object.fromEntries(m.mentions.channels.map(c => [c.id, c.name ?? 'channel']))
    },
    mentionsBot: m.mentions.users.has(client.user.id),
    mentionsStaff: m.mentions.roles.some(r => staffIds.includes(r.id)),
    mentionsEveryone: m.mentions.everyone
  };
}

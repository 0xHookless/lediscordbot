import { ChannelType, EmbedBuilder } from 'discord.js';
import { audit, db, getSetting, getUser } from '../db/db.js';
import { guild } from '../bot/client.js';
import { serializeMessage } from '../bot/serialize.js';
import { broadcast } from '../server/socket.js';
import { roleLabel } from './access.js';
import { trackDM } from './dms.js';
import { HttpError } from './errors.js';
import * as queue from './queue.js';

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates the console's embed payload and builds a Discord embed from it. */
export function buildEmbed(e) {
  const title = String(e.title || '').trim();
  const description = String(e.description || '').trim();
  if (!title && !description) throw new HttpError(400, 'Add a title or description so the embed has something to show.');
  if (title.length > 256) throw new HttpError(400, 'Embed titles can be up to 256 characters.');
  if (description.length > 4096) throw new HttpError(400, 'Embed descriptions can be up to 4,096 characters.');
  const fields = (e.fields || []).filter(f => String(f.name || '').trim() && String(f.value || '').trim());
  if (fields.length > 25) throw new HttpError(400, 'Embeds can have up to 25 fields.');
  const embed = new EmbedBuilder().setColor(HEX.test(e.color) ? e.color : '#1D6FA3');
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields.map(f => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: f.inline !== false })));
  if (String(e.footer || '').trim()) embed.setFooter({ text: String(e.footer).trim().slice(0, 2048) });
  if (e.timestamp) embed.setTimestamp(new Date());
  if (e.image) {
    if (!/^https:\/\/\S+$/.test(e.image)) throw new HttpError(400, 'The image link must start with https://.');
    embed.setImage(e.image);
  }
  return embed;
}

export function signatureFor(userId) {
  const member = guild()?.members.cache.get(userId);
  const name = member?.displayName || getUser(userId)?.name || 'Staff';
  return getSetting('signatureFormat')
    .replaceAll('{name}', name)
    .replaceAll('{first}', name.split(' ')[0])
    .replaceAll('{role}', member ? roleLabel(member) : 'Staff');
}

export const uploadLimitBytes = () => [10, 10, 50, 100][guild()?.premiumTier ?? 0] * 1024 * 1024;

/** Sends as the bot on behalf of a staff member, then logs, clears the queue and notifies the console. */
export async function sendMessage({ channel, userId, isAdmin, content = '', replyTo = null, ping = true, embed = null, files = [], crosspost = false, signature = false, action = null }) {
  let text = String(content).trim();
  if (signature && text) text += '\n' + signatureFor(userId);
  if (!text && !embed && !files.length) throw new HttpError(400, 'Write a message, add a file or build an embed first.');
  if (text.length > 2000) throw new HttpError(400, `That message is ${text.length.toLocaleString()} characters. Discord allows 2,000.`);
  if (/@(everyone|here)\b/.test(text) && !isAdmin) throw new HttpError(403, 'Only admins can ping @everyone or @here.');

  const msg = await channel.send({
    content: text || undefined,
    embeds: embed ? [buildEmbed(embed)] : [],
    files: files.map(f => ({ attachment: f.buffer, name: f.originalname })),
    allowedMentions: { parse: isAdmin ? ['users', 'roles', 'everyone'] : ['users', 'roles'], repliedUser: !!ping },
    ...(replyTo ? { reply: { messageReference: replyTo, failIfNotExists: false } } : {})
  });
  db.prepare('INSERT OR REPLACE INTO sent_by (message_id, user_id, channel_id) VALUES (?, ?, ?)').run(msg.id, userId, channel.id);

  if (crosspost && channel.type === ChannelType.GuildAnnouncement) {
    await msg.crosspost().catch(e => console.warn('Crosspost failed:', e.message));
  }
  const isDM = !channel.guildId;
  let cleared = replyTo ? queue.resolve(replyTo) : 0;
  if (isDM) {
    cleared += queue.resolveChannel(channel.id);
    trackDM(channel.id, channel.recipientId);
  }
  audit({
    userId,
    action: action || (isDM ? 'DM' : replyTo ? 'Replied' : 'Sent'),
    channelId: channel.id,
    messageId: msg.id,
    content: text || (embed ? `${embed.title || embed.description} (embed)` : files.map(f => f.originalname).join(', '))
  });
  const message = serializeMessage(msg);
  broadcast('message:create', { message });
  return { message, cleared };
}

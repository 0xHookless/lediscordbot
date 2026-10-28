import { audit, db } from '../db/db.js';
import { botStatus } from '../bot/client.js';
import { resolveChannel } from '../services/access.js';
import { friendlyError } from '../services/errors.js';
import { broadcastScheduled } from '../services/scheduled.js';
import { sendMessage } from '../services/send.js';

let running = false;

async function tick() {
  if (running || botStatus() !== 'live') return;
  running = true;
  try {
    const due = db.prepare("SELECT * FROM scheduled WHERE status = 'pending' AND run_at <= ? ORDER BY run_at").all(Date.now());
    for (const post of due) {
      const payload = JSON.parse(post.payload);
      try {
        const channel = await resolveChannel(post.channel_id);
        if (!channel) throw new Error('The channel is no longer available to the bot.');
        const { message } = await sendMessage({
          channel,
          userId: post.created_by,
          isAdmin: payload.allowEveryone,
          content: payload.content,
          embed: payload.embed,
          crosspost: payload.crosspost,
          action: 'Scheduled post sent'
        });
        db.prepare("UPDATE scheduled SET status = 'sent', message_id = ?, updated_at = ? WHERE id = ?").run(message.id, Date.now(), post.id);
      } catch (e) {
        const reason = e.message?.startsWith('The channel') ? e.message : friendlyError(e);
        console.error(`Scheduled post ${post.id} failed:`, e.message);
        db.prepare("UPDATE scheduled SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(reason, Date.now(), post.id);
        audit({ userId: post.created_by, action: 'Scheduled post failed', channelId: post.channel_id, content: reason });
      }
    }
    if (due.length) broadcastScheduled();
  } finally {
    running = false;
  }
}

export function startScheduler() {
  setInterval(() => tick().catch(e => console.error('Scheduler error:', e)), 30_000);
}

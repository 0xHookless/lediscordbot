export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DISCORD_MESSAGES = {
  10003: 'That channel no longer exists.',
  10008: 'That message no longer exists.',
  30003: 'This channel already has 50 pinned messages. Unpin one first.',
  50001: 'The bot can no longer see this channel.',
  50007: "This member doesn't accept direct messages from the bot.",
  50013: 'The bot is missing a permission it needs for this. Check its role in Discord.'
};

/** Turns Discord and server errors into a sentence staff can act on. */
export function friendlyError(err) {
  if (err instanceof HttpError) return err.message;
  if (err?.name === 'RateLimitError') return 'Discord is rate limiting the bot. Wait a few seconds and retry.';
  if (err?.code === 50035) return `Discord rejected the message: ${err.message}`;
  if (DISCORD_MESSAGES[err?.code]) return DISCORD_MESSAGES[err.code];
  if (err?.name?.startsWith('DiscordAPIError')) return 'Discord returned an error. Try again in a moment.';
  return 'Something went wrong on the server. Check the console logs on the VPS.';
}

export const isDiscordError = err => err?.name?.startsWith('DiscordAPIError') || err?.name === 'RateLimitError';

import { Client, Events, GatewayIntentBits as I, Partials } from 'discord.js';
import { config } from '../config.js';

export const client = new Client({
  intents: [
    I.Guilds, I.GuildMembers, I.GuildPresences, I.GuildMessages, I.GuildMessageReactions,
    I.MessageContent, I.DirectMessages, I.DirectMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

let status = 'down';
export const botStatus = () => status;
export const setBotStatus = s => { status = s; };

export const guild = () => client.guilds.cache.get(config.guildId);

export function startBot() {
  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, resolve);
    client.login(config.token).catch(reject);
  });
}

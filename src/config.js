import 'dotenv/config';

function required(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key} in .env. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  clientSecret: required('CLIENT_SECRET'),
  guildId: required('GUILD_ID'),
  baseUrl: required('BASE_URL').replace(/\/$/, ''),
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  adminRoleIds: list(process.env.ADMIN_ROLE_IDS),
  staffRoleIds: list(process.env.STAFF_ROLE_IDS),
  dbPath: process.env.DB_PATH || 'data/console.db'
};

export const secureCookies = config.baseUrl.startsWith('https://');

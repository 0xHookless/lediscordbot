# Staff Console

A Discord bot plus a private web dashboard. Staff sign in with Discord and post, reply, DM and announce as one branded bot. Every message is logged to the staff member who sent it.

What it does:
- Live channel feed with unread counts, mention badges and a "New messages" divider for each staff member
- Send as the bot, with replies (ping on or off), mentions, attachments, an optional signature and a markdown preview
- Edit, delete, pin and react to the bot's messages
- DM members from the bot and see their replies
- **Needs reply** queue: unanswered messages in support channels, DMs and mentions of staff. Staff can claim an item and it clears when someone replies.
- Staff roster with Discord status, an "On duty" toggle, and one-click pings (a role, a person or everyone on duty)
- Embed builder with templates, scheduling (UTC) and crossposting
- `@everyone` and `@here` are admin only and need a confirm step
- Audit log, admin settings, browser notifications, light and dark themes, works on phones

Stack: Node 20, discord.js 14, Express, Socket.IO, SQLite, React with Vite and Tailwind. It runs as one process.

---

## 1. Create the Discord application

1. Go to https://discord.com/developers/applications, click **New Application** and name it (the name is what members see).
2. **Bot** tab:
   - Click **Reset Token** and copy the token. This is `DISCORD_TOKEN`.
   - Under **Privileged Gateway Intents**, turn on **Presence**, **Server Members** and **Message Content**.
   - Set an avatar here. It is what the server sees on every staff post.
3. **OAuth2** tab:
   - Copy the **Client ID** (`CLIENT_ID`) and **Client Secret** (`CLIENT_SECRET`).
   - Under **Redirects**, add `https://console.yourdomain.com/auth/callback`, using your real domain.
4. Invite the bot to your server. Open this link with your Client ID in it:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=257088
   ```
   That grants View Channels, Send Messages, Manage Messages (for pins), Embed Links, Attach Files, Read Message History, Mention Everyone and Add Reactions.
5. In Discord, turn on Developer Mode (User Settings > Advanced). Right-click your server and choose **Copy Server ID** for `GUILD_ID`. Right-click roles in Server Settings > Roles to copy their IDs.

The bot can only see and post in channels its role can access. Use channel permissions in Discord to control that.

## 2. Install on the VPS

You need Node.js 20 or newer (https://nodejs.org, LTS installer). Then, in the project folder:

```bash
npm install
```

Copy `.env.example` to `.env` and fill it in:

| Key | What to put |
|---|---|
| `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`, `GUILD_ID` | From step 1 |
| `BASE_URL` | `https://console.yourdomain.com` |
| `ADMIN_ROLE_IDS` | Role IDs that get admin rights in the console, comma separated |
| `STAFF_ROLE_IDS` | Role IDs that count as staff on first start. You can change these later in Settings. |

Then build the dashboard and start it:

```bash
npm run build
```

```bash
npm start
```

You should see `Bot logged in as …` and `Staff Console listening on http://127.0.0.1:3000`. The app only listens on the VPS itself. The next section makes it reachable.

## 3. Make it reachable (Cloudflare Tunnel)

The tunnel makes an outgoing connection from the VPS to Cloudflare. Cloudflare serves `https://console.yourdomain.com` and forwards to the app. You don't open any ports, and RDP is only needed for server maintenance.

**Windows VPS (dashboard-managed tunnel, recommended):**
1. Add your domain to Cloudflare (the free plan is fine).
2. In the Cloudflare dashboard, open **Zero Trust > Networks > Tunnels** and choose **Create a tunnel** > **Cloudflared**. Name it `staff-console`.
3. Pick **Windows**, then run the install command it shows in an elevated PowerShell on the VPS. It looks like `cloudflared.exe service install <token>` and installs cloudflared as a service that starts on boot.
4. Under **Public Hostname**, add `console` on your domain, with type **HTTP** and URL `127.0.0.1:3000`.

**Linux VPS:** install `cloudflared` and run `cloudflared tunnel login`, then `cloudflared tunnel create staff-console`, then `cloudflared tunnel route dns staff-console console.yourdomain.com`. Copy `deploy/cloudflared-config.yml` to `~/.cloudflared/config.yml`, fill it in, and run `sudo cloudflared service install`.

**Recommended: add a second lock.** In Zero Trust, go to **Access > Applications > Add an application > Self-hosted**, set it to `console.yourdomain.com`, and add a policy that allows only your staff's email addresses (one-time PIN works without any setup). Strangers then never reach the login page, and Discord sign-in still applies behind it.

## 4. Keep it running

**Windows:** install NSSM (https://nssm.cc, put `nssm.exe` on PATH), then in an elevated PowerShell:

```bash
powershell -ExecutionPolicy Bypass -File deploy\install-service.ps1
```

This creates the `StaffConsole` service. It starts on boot, restarts if it crashes, and writes logs to `logs\`.

**Linux:** copy `deploy/staff-console.service` to `/etc/systemd/system/`, adjust the paths and user, then run `sudo systemctl enable --now staff-console`.

**Backups:** the app writes a daily copy of its database to `data/backups/` and keeps 14 days. Copy that folder off the server now and then.

## 5. First sign-in

Open `https://console.yourdomain.com` and sign in with Discord. As an admin, open **Settings** (the gear icon) and set:
- **Staff roles:** who can sign in and appears in the roster.
- **Support channels:** where every member message goes to Needs reply.
- **Who can post where:** for example, only Admins in #announcements.
- **Hidden channels**, and the **signature** format.

## Updating

Pull or copy the new code, then run:

```bash
npm install
```

```bash
npm run build
```

Then restart the service (`nssm restart StaffConsole` or `sudo systemctl restart staff-console`).

## Troubleshooting

- **"Used disallowed intents" on start:** turn on the three privileged intents in step 1.
- **Sign-in loops back to Discord or says expired:** the redirect in the Developer Portal must exactly match `BASE_URL` + `/auth/callback`.
- **"This console is for staff only":** the account needs a role listed in `ADMIN_ROLE_IDS` or in Settings > Staff roles.
- **A channel is missing or shows a lock:** the bot's role can't view or send in it. Fix the channel permissions in Discord.
- **Unread counts after a restart** come from the last 50 messages per channel, so a very busy channel can under-count until you open it.

## Local development

Set `BASE_URL=http://localhost:3000` in `.env` and add `http://localhost:3000/auth/callback` as a redirect in the Developer Portal. Run `npm run build` and `npm start`, then open http://localhost:3000. For hot reload on the dashboard, keep `npm start` running and run `npm run dev:web` too. Then set `BASE_URL=http://localhost:5173` (and add that redirect), and the dev server proxies to the backend.

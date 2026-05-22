# personal-assistant-chatbot

A JavaScript SDK to drop a personalized AI-persona chatbot into your site. Built for IT, tech, and corporate professionals to screen inbound outreach from recruiters, HR, and clients without manually handling every cold call.

> **Live on npm** — [`personal-assistant-chatbot`](https://www.npmjs.com/package/personal-assistant-chatbot) · current version `0.0.1`

## What you get

- A **server handler** that proxies chat to the LLM provider of your choice (your own API key).
- A **React `<ChatWidget>`** component and a **vanilla JS bundle** for any site.
- A built-in **`/admin/chatbot` route** with a login + form + resume drag-and-drop, so a non-technical professional can configure and maintain their own profile without editing code.
- A **scaffolder** (`npx create-personal-assistant-chatbot`) for a ready-to-run Next.js starter.
- A **CLI** (`npx personal-assistant-chatbot init resume.pdf`) for parsing a resume into the config from the terminal.
- Pluggable **storage adapters**: filesystem (default), GitHub commit, S3-compatible.
- Built-in **email notifications** — get a summary in your inbox every time the AI classifies a chat as a real opportunity ([guide](docs/notifications.md)).
- A prebuilt **Docker image** — one container deploys the whole thing anywhere ([guide](docs/docker.md)).

The bot answers visitor questions strictly from the profile, captures intent, and fires an `onLead` callback only when a conversation is worth attention — so the professional can wire email / Slack / DB / whatever they like.

## Install

Add the SDK to an existing project — use whichever package manager you already have:

```bash
npm install personal-assistant-chatbot
```
```bash
pnpm add personal-assistant-chatbot
```
```bash
yarn add personal-assistant-chatbot
```

That's all you need for the server handlers, storage adapters, and the vanilla widget. For the **React** widget, make sure your app also has `react` and `react-dom` (they're optional peer dependencies); for the **S3** storage adapter, also install `@aws-sdk/client-s3`.

Don't want to wire it up by hand? Two `npx` commands need **no install at all**:

```bash
# Scaffold a ready-to-run Next.js starter app
npx create-personal-assistant-chatbot my-assistant
```
```bash
# Parse a resume into a profile.json from the terminal
npx personal-assistant-chatbot init resume.pdf --out profile.json
```

Requires Node.js 18.17 or newer.

## Quick start — scaffold a new app

```bash
npx create-personal-assistant-chatbot my-assistant
cd my-assistant
cp .env.local.example .env.local
# Fill in Google OAuth credentials (see "Admin auth" below)
npm install
npm run dev
```

Open <http://localhost:3000/admin/chatbot>, click **Sign in with Google**. Inside the admin:

1. **Connections tab** → paste your Gemini (or other LLM) API key, click Test, then Save.
2. **Basics** → drop a resume (or fill the form), then Save.

The public chat widget appears at <http://localhost:3000> once both pieces are in place.

## Quick start — Docker (deploy anywhere)

No codebase to integrate into? Run the whole thing as one container. It serves
the public chat page, the admin console, and the embeddable widget — and runs
on any host: a VPS, Railway, Render, Fly.io, or a home server.

```bash
docker run -d --name chatbot \
  -p 3000:3000 \
  -v pac-data:/data \
  -e CHATBOT_GOOGLE_CLIENT_ID=your-client-id \
  -e CHATBOT_GOOGLE_CLIENT_SECRET=your-client-secret \
  -e CHATBOT_ALLOWED_EMAILS=you@example.com \
  -e CHATBOT_BASE_URL=https://chat.example.com \
  ghcr.io/adiv1kram/chatbot_sdk:latest
```

Then open `/admin/chatbot`, sign in with Google, and configure the bot. The
`/data` volume keeps your profile and keys across restarts and updates.

New to this? The **[step-by-step setup guide](docs/docker.md)** walks a
non-technical professional through the whole thing in about 20 minutes —
installing Docker, Google sign-in, deploying, and embedding.

## Admin auth (Google OAuth)

The `/admin/chatbot` route is gated by Google sign-in. To enable it, register an OAuth client in Google Cloud Console:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. **Create credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add `http://localhost:3000/admin/chatbot/api/auth/callback` (and your production URL alongside, once you deploy).
4. Copy the **Client ID** and **Client secret**, and paste them into `.env.local`:

   ```env
   CHATBOT_GOOGLE_CLIENT_ID=...
   CHATBOT_GOOGLE_CLIENT_SECRET=...
   CHATBOT_ALLOWED_EMAILS=you@example.com
   ```

`CHATBOT_ALLOWED_EMAILS` is comma- or space-separated and case-insensitive. Anyone signing in with a Google email not on the list is rejected. Forgetting this is fine — the admin route detects missing config and shows a clear setup screen instead of crashing.

## Quick start — add to an existing Next.js App Router app

```js
// app/api/chat/route.js
import { createChatHandler } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

export const { GET, POST } = createChatHandler({
  storage: createFilesystemStorage({ path: 'profile.json' }),
  secretsStorage: createFilesystemStorage({ path: 'secrets.json' }),
  onLead: async (lead) => { /* email, Slack, DB — your call */ },
});
```

The LLM provider + API key come from `secrets.json` (set via the admin Connections tab) with `GEMINI_API_KEY` / `OPENAI_API_KEY` / etc. env vars as a fallback. You don't have to hardcode either.

```js
// app/admin/chatbot/[[...rest]]/route.js
import { createAdminRoute } from 'personal-assistant-chatbot/server/next';
import { createFilesystemStorage } from 'personal-assistant-chatbot/storage';

export const runtime = 'nodejs';

// CHATBOT_GOOGLE_CLIENT_ID / _SECRET / CHATBOT_ALLOWED_EMAILS are read from
// process.env automatically; pass `auth: { ... }` to override.
export const { GET, POST, PUT, DELETE } = createAdminRoute({
  storage: createFilesystemStorage({ path: 'profile.json' }),
  secretsStorage: createFilesystemStorage({ path: 'secrets.json' }),
});
```

The `secretsStorage` adapter must declare `supportsSecrets: true`. The `github` adapter refuses to be used for secrets — committing API keys to a repo is rejected at the contract level. Use `filesystem` or `s3` for `secretsStorage`, or omit it entirely and rely on env vars.

```jsx
// app/chat-panel.jsx
'use client';
import { ChatWidget } from 'personal-assistant-chatbot/react';

export function ChatPanel() {
  return <ChatWidget endpoint="/api/chat" />;
}
```

The widget probes `GET /api/chat` on mount and renders nothing until the profile has at least a name saved.

## Quick start — plain HTML site (vanilla bundle)

```html
<div id="chat-root"></div>
<script src="https://unpkg.com/personal-assistant-chatbot/dist/vanilla.global.js"></script>
<script>
  PersonalAssistant.mount('#chat-root', {
    endpoint: 'https://your-server/api/chat',
    theme: { color: '#3b82f6' },
  });
</script>
```

## Storage adapters

Profile data lives in a JSON document. Pick where it lives:

| Adapter | Where it stores | Good for |
| --- | --- | --- |
| `createFilesystemStorage({ path })` | A file on disk | VPS, Render, Railway, Fly, Docker, self-hosted |
| `createGithubStorage({ owner, repo, path, token, branch })` | A file in a GitHub repo (commits on save) | Vercel, Netlify, any serverless host wired to GitHub |
| `createS3Storage({ bucket, key, region, ... })` | An S3-compatible object | Vercel + R2/S3, anywhere read-only filesystems are an issue |

Use the same adapter for the chat route and the admin route. To use S3, install `@aws-sdk/client-s3` in your app.

## Subpath exports

| Import path | What it is |
| --- | --- |
| `personal-assistant-chatbot/server` | Web Standards `(Request) => Response` chat + admin handlers |
| `personal-assistant-chatbot/server/next` | Next.js App Router adapters (`createChatHandler`, `createAdminRoute`) |
| `personal-assistant-chatbot/server/express` | Express middleware adapters |
| `personal-assistant-chatbot/react` | React `<ChatWidget>` component |
| `personal-assistant-chatbot/vanilla` | `mount()` API for non-React sites |
| `personal-assistant-chatbot/storage` | Storage adapters (`createFilesystemStorage`, `createGithubStorage`, `createS3Storage`, `createStorage`) |
| `personal-assistant-chatbot/notify` | Email notifiers (`createGmailNotifier`, `createSmtpNotifier`, `buildLeadEmail`) |

## Email notifications

Get a summary email in your own inbox whenever the AI classifies a chat as a real lead — either an `opportunity` (concrete proposal) or `needs_followup` (visitor wants a real conversation and left contact info). Configure it inside `/admin/chatbot → Notifications`:

- **Gmail** — reuses the Google OAuth client you already set up for admin sign-in. One click connects your Gmail account and grants the `gmail.send` scope. Emails come *from* your real Gmail address.
- **SMTP** — paste host, port, user, pass, and a from-address for any mail provider (Outlook, FastMail, Mailgun, corporate SMTP, etc.).

Lighter chats (`info_only`, `spam`) stay quiet. One email per visitor session — refreshes won't duplicate. Failures never break the chat path; they show up in the in-memory "Recent deliveries" log. See [docs/notifications.md](docs/notifications.md) for details.

## Supported LLM providers (BYOK)

`'gemini'` (recommended — generous free tier), `'openai'`, `'anthropic'`, `'groq'`, `'openrouter'`. Each has sensible chat + heavy model defaults; override with `models: { chat, heavy }`.

## Development

```bash
npm install
npm run build       # produces dist/
npm run dev         # tsup watch mode
npm run lint
npm run format
npm test            # vitest run
npm run test:watch
```

`npm run prepublishOnly` runs lint + format check + tests + build — invoked automatically before `npm publish`. See `examples/nextjs-app-router/` for a working end-to-end example.

## License

MIT

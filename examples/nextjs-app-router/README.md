# Example — Next.js App Router

A minimal Next.js 15 app demonstrating the `personal-assistant-chatbot` SDK.

## Try it

### 1. Build the SDK

From the SDK root:

```bash
npm run build
```

### 2. Set up a Google OAuth client for /admin

1. Open <https://console.cloud.google.com/apis/credentials>.
2. **Create credentials → OAuth client ID → Web application**.
3. Add `http://localhost:3000/admin/chatbot/api/auth/callback` as an authorized redirect URI.
4. Copy the **Client ID** and **Client secret**.

If asked to configure the OAuth consent screen first: pick "External", fill in an app name + your email, then come back.

### 3. Run the example

```bash
cd examples/nextjs-app-router
cp .env.local.example .env.local
# Paste CHATBOT_GOOGLE_CLIENT_ID, CHATBOT_GOOGLE_CLIENT_SECRET, CHATBOT_ALLOWED_EMAILS (your own email).
npm install
npm run dev
```

### 4. Sign in + configure inside the admin

- Open <http://localhost:3000/admin/chatbot>, click **Sign in with Google**.
- Switch to the **Connections** tab, paste your Gemini (or other) API key, click **Test** to verify it works, then **Save**.
- Switch back to **Basics**, drop a resume or fill the form, **Save**.

The public chat widget appears at <http://localhost:3000> once your profile name AND an LLM key are both saved.

## What's in here

- `profile.json` — public profile data. Shipped empty.
- `secrets.json` — LLM API keys, written by the admin Connections tab. Gitignored by default.
- `app/api/chat/route.js` — public chat endpoint.
- `app/admin/chatbot/[[...rest]]/route.js` — admin route.
- `app/page.jsx` — server-rendered landing page.
- `app/chat-panel.jsx` — client component rendering `<ChatWidget>`.

## Notes

- The example links to the SDK via `file:../..` — re-run `npm run build` in the SDK root to pick up changes.
- On Vercel / Netlify (read-only filesystem), swap the storage adapters: GitHub adapter for `profile.json`, S3 for `secrets.json` (or fall back to env vars). The `github` adapter is **blocked** from storing secrets at the SDK level.

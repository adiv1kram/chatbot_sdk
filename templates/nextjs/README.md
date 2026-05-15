# {{projectName}}

Your personal assistant chatbot, scaffolded by `create-personal-assistant-chatbot`.

## Setup

### 1. Create a Google OAuth client (one-time)

The admin route uses Google sign-in to gate access. You need to register an OAuth client:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. **Create credentials → OAuth client ID → Web application**.
3. Under **Authorized redirect URIs**, add at least one:
   - For local dev: `http://localhost:3000/admin/chatbot/api/auth/callback`
   - For production: `https://YOUR_DOMAIN/admin/chatbot/api/auth/callback`
4. Save and copy the **Client ID** and **Client secret**.

If Google prompts you to configure the OAuth consent screen first, pick "External", fill in an app name + your email, and add the `email`, `profile`, and `openid` scopes.

### 2. Fill in `.env.local`

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with:

- `CHATBOT_GOOGLE_CLIENT_ID` — from step 1
- `CHATBOT_GOOGLE_CLIENT_SECRET` — from step 1
- `CHATBOT_ALLOWED_EMAILS` — comma-separated Google emails allowed to sign in (typically just yours)

LLM API keys don't go here. You'll paste them inside the admin UI in step 4.

### 3. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000/admin/chatbot> and click **Sign in with Google**.

### 4. Add your LLM API key (Connections tab)

Inside the admin, switch to the **Connections** tab and paste the API key for your chosen provider:

- Gemini (recommended — free tier): <https://aistudio.google.com/apikey>
- OpenAI: <https://platform.openai.com/api-keys>
- Anthropic: <https://console.anthropic.com/settings/keys>
- Groq: <https://console.groq.com/keys>
- OpenRouter: <https://openrouter.ai/keys>

Hit **Test** to verify the key works, then **Save**. The key is stored in `secrets.json` at the project root — this file is **gitignored by default**. Never commit it.

### 5. Fill in your profile, then go live

Drop your resume in the dropzone (or fill in the form), Save, and open <http://localhost:3000>. Once your name is saved AND an LLM key is configured, the chat widget appears on the public page.

## Customize lead handling

The SDK logs every lead to the server console by default. To do something real — email yourself, post to Slack, write to a DB — edit `app/api/chat/route.js` and replace the `onLead` callback body.

## Where the data lives

- `profile.json` — public profile data. Edit via /admin or by hand. Commit it to git or keep it gitignored, your call.
- `secrets.json` — LLM API keys. **Gitignored by default.** Treat like `.env.local`.

## Deploying to production

When you deploy, **register the production redirect URI in your Google OAuth client** so sign-in works from the real domain. Set `CHATBOT_GOOGLE_CLIENT_ID`, `CHATBOT_GOOGLE_CLIENT_SECRET`, `CHATBOT_ALLOWED_EMAILS` in your hosting provider's env vars.

On serverless hosts (Vercel, Netlify) the filesystem is read-only — swap `createFilesystemStorage` for `createGithubStorage` (for `profile.json`) or `createS3Storage` (for both files). The `github` adapter is *blocked* from storing secrets, so for `secrets.json` use S3, or fall back to env vars (`GEMINI_API_KEY` etc).

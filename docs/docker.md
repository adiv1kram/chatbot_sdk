# Setup guide — run your chatbot with Docker

This guide walks you through putting your personal AI assistant online. No
coding required. By the end you'll have:

- a private admin console where you upload your resume and edit your details,
- a public chat page visitors can use,
- a snippet you can paste into your existing website.

The whole thing runs as **one container** — a self-contained package called a
Docker image — so it works the same on any host. You run your own copy; there
is no service to sign up for and nothing is hosted for you.

Set aside about **20 minutes**. The only fiddly part is the Google sign-in
setup (Part 2); everything else is copy-and-paste.

---

## What you'll need

1. **A place to run the container.** Two common choices:
   - *Easiest:* a hosting platform that runs Docker images for you and gives
     you a web address with HTTPS automatically (Railway, Render, Fly.io, and
     similar). Good if you don't want to manage a server.
   - *Your own server:* any VPS or machine where you can install Docker.
2. **A Google account** — used to lock the admin console to just you.
3. **An LLM API key** — this powers the AI. A free
   [Google Gemini key](https://aistudio.google.com/apikey) works well to start.
   You'll paste this into the admin console later, not here.

---

## Part 1 — Install Docker

**If you're using a hosting platform** that deploys Docker images (Railway,
Render, etc.), you can skip this — they run the container for you. Jump to
Part 2.

**If you're using your own server**, install Docker once:

- **Linux:** follow the official install guide at
  <https://docs.docker.com/engine/install/>.
- **Mac / Windows:** install Docker Desktop from
  <https://www.docker.com/products/docker-desktop/>.

To confirm it works, open a terminal and run:

```bash
docker --version
```

If you see a version number, you're set.

---

## Part 2 — Set up Google sign-in

Your admin console is protected by Google sign-in, so only you can edit your
profile. To enable it, you create a free "OAuth client" in Google's developer
console. This is the one part that takes a few minutes — follow it slowly.

> **You need your web address first.** The setup below asks for your site's
> address (e.g. `https://chat.yourname.com`). If your hosting platform hasn't
> given you one yet, deploy first (Part 3), note the address it assigns, then
> come back here.

1. Go to the [Google Cloud Console — Credentials page](https://console.cloud.google.com/apis/credentials).
   Sign in and create a project if you don't already have one (any name).
2. If asked to **configure the consent screen** first:
   - Choose **External**, click Create.
   - Fill in an app name (e.g. "My Assistant"), your email where required, and
     save. You do **not** need to publish it or submit it for review.
3. Back on the Credentials page, click **Create credentials → OAuth client ID**.
4. For **Application type**, choose **Web application**.
5. Under **Authorized redirect URIs**, click **Add URI** and paste your
   callback address — your site address followed by
   `/admin/chatbot/api/auth/callback`:

   ```
   https://YOUR-ADDRESS/admin/chatbot/api/auth/callback
   ```

   For example: `https://chat.yourname.com/admin/chatbot/api/auth/callback`.
6. Click **Create**. Google shows you a **Client ID** and a **Client secret** —
   copy both somewhere safe. You'll need them in Part 3.

That's it. Google now handles the password, two-factor, and account recovery
for your admin login — you never manage a password yourself.

---

## Part 3 — Start the chatbot

You'll give the container a handful of settings (your Google keys, your web
address). The easiest way is a small text file called `.env`.

Create a file named `.env` with this content, filling in your own values:

```env
CHATBOT_GOOGLE_CLIENT_ID=paste-your-client-id-here
CHATBOT_GOOGLE_CLIENT_SECRET=paste-your-client-secret-here
CHATBOT_ALLOWED_EMAILS=you@example.com
CHATBOT_BASE_URL=https://YOUR-ADDRESS
```

- `CHATBOT_ALLOWED_EMAILS` — the Google email(s) allowed into the admin.
  Separate multiple emails with commas.
- `CHATBOT_BASE_URL` — your public web address, e.g. `https://chat.yourname.com`.

### If you're on a hosting platform (Railway, Render, etc.)

1. Create a new service and point it at the Docker image:
   `ghcr.io/adiv1kram/chatbot_sdk:latest`.
2. Add the four values above in the platform's **Environment Variables**
   section (instead of an `.env` file).
3. **Attach a persistent disk / volume and mount it at `/data`.** This is
   important — it's where your profile and keys are saved. Without it, your
   settings disappear when the service restarts.
4. Deploy. The platform gives you a web address and handles HTTPS for you.

### If you're on your own server

The simplest way is **Docker Compose**. Create a file named
`docker-compose.yml` next to your `.env` file:

```yaml
services:
  chatbot:
    image: ghcr.io/adiv1kram/chatbot_sdk:latest
    ports:
      - '3000:3000'
    env_file:
      - .env
    volumes:
      - pac-data:/data
    restart: unless-stopped

volumes:
  pac-data:
```

Then start it:

```bash
docker compose up -d
```

Your chatbot is now running on port 3000. To make it reachable on your real
web address with HTTPS, put it behind a reverse proxy — [Caddy](https://caddyserver.com/)
is the easiest, as it gets HTTPS certificates automatically. Point the proxy at
`localhost:3000`.

> The `pac-data` volume is where your profile and API keys live. Keep it — it's
> what makes your settings survive restarts and updates.

---

## Part 4 — Configure your bot

Open `https://YOUR-ADDRESS/admin/chatbot` in a browser and click
**Sign in with Google**.

Inside the admin console:

1. **Connections tab** — paste your LLM API key (e.g. your free Gemini key),
   click **Test** to confirm it works, then **Save connections**.
2. **Basics tab** — drag your resume PDF onto the drop zone to auto-fill the
   form. Review what it found, edit anything, and add a photo URL if you like.
3. Look through the other tabs (Experience, Projects, Contact, and so on) and
   fill in what you want the bot to know.
4. Click **Save changes**.

Once you've saved your name and a working API key, your chatbot goes live.

---

## Part 5 — Put the bot in front of visitors

You have two ways to share it, and both work at the same time:

- **Link to the standalone page.** Your web address itself is a working chat
  page. Add `https://YOUR-ADDRESS` to your LinkedIn, email signature, or
  portfolio.
- **Embed it in your existing website.** Open the **Embed tab** in the admin
  console and copy the snippet. Paste it into any site — a portfolio page, a
  Wix or Squarespace block, a WordPress custom-HTML widget.

  If your website is on a different web address than the chatbot, add that
  website's address to the `CHATBOT_ALLOWED_ORIGINS` setting (see the table
  below) so it's allowed to load the widget.

---

## Keeping it running

**Updating to a newer version:**

```bash
# Docker Compose
docker compose pull && docker compose up -d
```

On a hosting platform, trigger a redeploy. Your `/data` volume stays attached,
so your profile and keys carry over untouched.

**Backing up:** your entire setup is the two files on the `/data` volume
(`profile.json` and `secrets.json`). Copy that volume to back up; restore it by
mounting it again.

---

## All the settings

| Setting | Required? | What it does |
| --- | --- | --- |
| `CHATBOT_GOOGLE_CLIENT_ID` | Yes | Google sign-in client ID (from Part 2). |
| `CHATBOT_GOOGLE_CLIENT_SECRET` | Yes | Google sign-in client secret (from Part 2). |
| `CHATBOT_ALLOWED_EMAILS` | Yes | Comma-separated Google emails allowed into the admin. |
| `CHATBOT_BASE_URL` | Strongly recommended | Your public web address. Needed so Google sign-in and the embed snippet use the right URL. |
| `CHATBOT_ALLOWED_ORIGINS` | No | Comma-separated website addresses allowed to embed the widget. Use `*` to allow any. |
| `GEMINI_API_KEY` (or `OPENAI_API_KEY`, etc.) | No | A fallback AI key. Usually you set this in the admin Connections tab instead. |
| `PORT` | No | Port the chatbot listens on. Default `3000`. |

---

## Troubleshooting

**"Admin sign-in is not configured yet."** One of the three Google settings is
missing or blank. Double-check `CHATBOT_GOOGLE_CLIENT_ID`,
`CHATBOT_GOOGLE_CLIENT_SECRET`, and `CHATBOT_ALLOWED_EMAILS`.

**Google shows a "redirect URI mismatch" error.** The address you registered in
Part 2 must exactly match your site. It has to be your address followed by
`/admin/chatbot/api/auth/callback`, with the same `https://` and no typos. You
can add more than one redirect URI if you test locally and in production.

**"That Google account isn't on the admin allowlist."** The email you signed in
with isn't in `CHATBOT_ALLOWED_EMAILS`. Add it (comma-separated) and restart.

**My profile disappeared after a restart.** The `/data` volume isn't attached.
On a hosting platform, attach a persistent disk mounted at `/data`. With Docker
Compose, make sure the `volumes:` section is present.

**The chat says it's not configured.** You need both a saved name (Basics tab)
and a working API key (Connections tab). Check both.

---

## For developers: building the image yourself

The published image is the easy path, but you can build from source. From the
repository root:

```bash
docker build -f docker/Dockerfile -t personal-assistant-chatbot .
```

This compiles the SDK, builds the app against it, and produces a small
standalone runtime image.

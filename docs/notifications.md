# Email notifications

The chatbot can email you a summary every time a conversation produces a
real lead. Pick Gmail (recommended — sends from your own address, no new
credentials) or SMTP (works with any mail provider).

> **When emails fire.** As soon as a conversation looks like a real lead —
> not only when the visitor clicks "End chat". The moment the visitor shares a
> contact handle (email or phone), the chatbot classifies the conversation in
> the background and, if it's actionable, emails you right away. Most visitors
> never press "End chat", so waiting for it would drop the majority of leads;
> the End button is now just a backstop that runs the same check.
>
> Emails fire on either of the two "actionable" classifications:
>
> - `opportunity` — concrete job, consulting, advisory, speaking, mentorship, or collaboration proposal. Email subject says **"New opportunity"**.
> - `needs_followup` — visitor wanted a real conversation/call/meeting but didn't pitch a fully formed proposal (the common case: visitor leaves name/company/email and asks to talk). Email subject says **"New lead"**.
>
> Lighter interactions (`info_only`, `spam`) are not emailed. The assistant is
> also prompted to gather a complete lead — name, contact, and what the visitor
> wants — and to ask for whatever's missing before the chat trails off. One
> email per visitor session: the mid-chat trigger and the End backstop share a
> dedupe, and refreshing the page won't duplicate.

---

## Setup — Gmail (recommended)

This path reuses the Google OAuth client you already configured for the
admin sign-in (`CHATBOT_GOOGLE_CLIENT_ID` / `_SECRET`). Emails are sent
through your own Gmail account, so they come from your real address and
land in the recipient's inbox without spam-filter concerns.

1. **Enable the Gmail API** in your Google Cloud project: open
   <https://console.cloud.google.com/apis/library/gmail.googleapis.com>
   and click **Enable**.
2. Open your deployment at `/admin/chatbot`, sign in, and switch to the
   **Notifications** tab.
3. Pick **Gmail** under "Send via".
4. Click **Connect Gmail**. You'll be redirected to Google to grant the
   `gmail.send` scope. After confirming, you're sent back to the admin
   with a "Gmail connected" banner.
5. Verify the **Send opportunity emails to** field shows the address you
   want notified (defaults to the Gmail you connected — change it for any
   other inbox).
6. Click **Save notifications**, then **Send test email** to confirm.

If the connect step shows "no refresh token", Google already issued tokens
for this client on a previous sign-in. Revoke the app at
<https://myaccount.google.com/permissions> and click Connect again — that
forces a fresh consent and a new refresh token.

## Setup — SMTP (any provider)

Use this if you can't or don't want to use Gmail (corporate Outlook,
FastMail, Mailgun's SMTP, etc.).

1. Open `/admin/chatbot` → **Notifications**.
2. Pick **SMTP** under "Send via".
3. Fill in host, port, username, password, and the "From" address.
   - Port `587` with TLS off (STARTTLS) works for most providers.
   - Port `465` with TLS on works for legacy Gmail SMTP and some others.
4. Set the **Send opportunity emails to** field.
5. **Save**, then **Send test email**.

For Gmail via SMTP specifically, generate an app password at
<https://myaccount.google.com/apppasswords> — your normal Gmail password
won't authenticate.

## Recipient + dedupe

- `Send opportunity emails to` is the only required field once a provider
  is connected. Defaults to your verified Gmail address for the Gmail path.
- Each visitor session triggers at most one email. The dedupe set lives
  in-memory and resets when the container restarts — sufficient for the
  single-container Docker deploy.

## Recent deliveries

The Notifications tab shows the last 20 sends (success + failure). The log
is in-memory — restarting the container clears it. There is no persistent
audit log in v0.1.0.

## How it integrates

- Email-send is fully isolated from the chat path. A failed `notifier.send`
  is caught, logged to the in-memory delivery log, and never breaks the
  chat response.
- The existing `onLead` callback still fires alongside email sending —
  use it for Slack/CRM/webhook integrations in parallel.
- Email content uses the same brief generator as `onLead`, so the
  professional gets exactly what the AI classified.

## Programmatic use (advanced)

The notifier is also exported directly for tests and custom integrations:

```js
import {
  createGmailNotifier,
  createSmtpNotifier,
  buildLeadEmail,
} from 'personal-assistant-chatbot/notify';

const notifier = createGmailNotifier({
  clientId: process.env.CHATBOT_GOOGLE_CLIENT_ID,
  clientSecret: process.env.CHATBOT_GOOGLE_CLIENT_SECRET,
  refreshToken: '<long-lived token captured via admin connect-gmail flow>',
  fromEmail: 'you@gmail.com',
});

const { subject, html, text } = buildLeadEmail({
  professionalName: 'You',
  lead: {
    /* lead from onLead */
  },
  transcript,
});

await notifier.send({ to: 'you@example.com', subject, html, text });
```

`createChatHandler` also accepts a `notifier` option for tests or for
deployments that want to bypass `secrets.json`:

```js
createChatHandler({
  storage,
  secretsStorage,
  notifier: createSmtpNotifier({ host, port, user, pass, from }),
});
```

When `notifier` is omitted, it's resolved from `secrets.notify` at
send-time — so admin-UI changes take effect without a restart.

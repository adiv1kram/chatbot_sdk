# How it works — end to end

This document explains what `personal-assistant-chatbot` does, how a conversation
moves through the system, and — importantly — **what gets saved and what does
not**. Read this before wiring the SDK into a site so the behaviour holds no
surprises.

For installation and copy-paste setup, see [`README.md`](README.md). For
deploying the whole thing as one container, see [`docs/docker.md`](docs/docker.md).
This file is about the *runtime model*.

---

## 1. The mental model

The SDK turns one professional's background into a chatbot that speaks **as
their AI assistant**. A visitor (recruiter, client, HR) asks questions; the bot
answers strictly from a profile the professional filled in; when a conversation
looks like a real opportunity, the SDK hands the professional a short lead
brief through a callback.

There are four moving parts:

| Part | What it is | Where it runs |
| --- | --- | --- |
| **Widget** | `<ChatWidget>` (React) or the `mount()` vanilla bundle | The visitor's browser |
| **Chat handler** | `createChatHandler` — a `(Request) => Response` function | The professional's server / container |
| **Admin route** | `createAdminRoute` — login + profile editor at `/admin/chatbot` | The same server |
| **Storage** | `profile.json` + `secrets.json` behind a pluggable adapter | Disk, a GitHub repo, or S3 |

Two principles drive everything below:

1. **The chat handler is stateless.** It keeps no conversation in memory. Every
   request from the widget carries the *entire* message history. The server
   reads it, calls the LLM, streams a reply, and forgets.
2. **The SDK never persists conversations on its own.** Profiles and API keys
   are saved (that is what storage adapters are for). Chat transcripts are
   *not* — they only leave the browser if **you** wire a callback. See §6.

---

## 2. One-time setup (the professional's side)

Before any visitor can chat, the professional configures the bot once through
the built-in admin route — no code editing required.

```
Visit /admin/chatbot
        │
        ▼
Sign in with Google ──►  OAuth + PKCE; only emails in CHATBOT_ALLOWED_EMAILS pass
        │
        ▼
Connections tab  ──►  paste an LLM API key (Gemini / OpenAI / …), Test, Save
        │                                   └─► written to secrets.json
        ▼
Basics tab  ──►  drop a resume PDF  ──►  parsed server-side  ──►  preview & edit
        │                                                          │
        │        (or fill the form by hand)                        │
        ▼                                                          ▼
Save  ──────────────────────────────────────────────►  written to profile.json
```

What is stored, and where:

- **`profile.json`** — name, headline, bio, experience, education, projects,
  credentials, skills, offerings, contact fields, preferences, guardrails, and
  a `freeform` text blob. This is the *only* knowledge the bot ever speaks
  from. Safe to commit to git.
- **`secrets.json`** — the LLM provider + API key. Kept in a **separate** file
  on a **separate** storage adapter, and gitignored by default. The `github`
  storage adapter refuses to hold secrets (committing keys to a repo is
  blocked at the adapter contract level). Use `filesystem` or `s3`, or skip the
  file and rely on env vars.

Both files are read fresh by the chat handler on every request, so an admin
edit takes effect on the next message — no redeploy, no restart.

**Until the profile has at least a name saved, the public widget renders
nothing.** Visitors never see a half-built chatbot.

---

## 3. The widget decides whether to show itself

On mount, the widget sends `GET` to the chat endpoint. The handler answers:

```json
{ "configured": true, "profileReady": true, "keyReady": true }
```

- `profileReady` — the profile has a name.
- `keyReady` — an LLM key resolved (from `secrets.json`, an env var, or inline
  config — in that order of precedence).
- `configured` — both of the above.

If `configured` is false, **the widget returns `null` and renders nothing**.
Only when everything is in place does the chat UI appear.

---

## 4. How a conversation moves — a single message turn

A conversation lives in **the widget's local React state** — an array of
`{ role, content }` messages. It exists only in that browser tab. There is no
conversation ID on the server and nothing written to a database.

Here is what happens when the visitor sends one message:

```
VISITOR types "Are you open to consulting?"  (or taps an intent chip)
        │
        ▼
Widget appends {role:'user', content:'...'} to its local array
        │
        ▼
POST /api/chat
   { action:'message', sessionId, messages:[ ...the WHOLE history... ] }
        │
        ▼
Chat handler:
   1. CORS / method / JSON checks
   2. validate the request shape
   3. load profile.json   (via storage adapter)
   4. is the profile configured?  no ─► 503 not_configured
   5. resolve LLM key: secrets.json ► env var ► inline config ► 503
   6. rate-limit check (see §5)     hit ─► 429 limit_reached
   7. build the system prompt from the profile
   8. streamText() to the LLM provider
        │
        ▼
Response body = a plain-text stream
        │
        ▼
Widget reads the stream chunk by chunk, appends each chunk to the
last assistant bubble  ─►  the reply types itself out live
        │
        ▼
On a clean finish, the server commits the rate-limit counters
(failed or rejected turns cost nothing).
```

Key consequences of the stateless design:

- **Reload the page and the conversation is gone.** Nothing is resumed.
- The server cannot "remember" an earlier turn — the widget re-sends the full
  history each time, and that is the bot's only context.
- `sessionId` (a stable per-widget id) is used **only** for rate limiting, not
  for storage.

### What keeps the bot on-script

Every turn rebuilds a **system prompt** from the profile. It instructs the LLM
to:

- speak in the first person as the professional, while disclosing it is an AI;
- answer **only** from the profile — never invent salary, availability, dates,
  or commitments; for anything missing, offer to pass it along;
- honour each contact field's `shareInChat` flag — shareable details can be
  given out, gated ones route to a follow-up instead;
- collect the visitor's name / company / email **mid-chat, once intent looks
  real** — never demand it upfront;
- respect the profile's `guardrails` (topics to avoid, things to mention).

Because the bot is re-grounded in the profile on every single turn, there is no
slow drift over a long conversation.

---

## 5. Rate limits and the "near-limit" nudge

The chat handler runs an in-memory limiter with three counters (all defaults,
all overridable via `createChatHandler({ rateLimit })`, or `rateLimit: false`
to disable):

| Counter | Default | Resets |
| --- | --- | --- |
| Per session | 30 messages | new widget instance / new tab |
| Per IP | 20 messages / 5 min | sliding window |
| Daily global | 150 LLM calls | UTC midnight |

Two thresholds matter:

- **At 80% of any counter** — the handler appends a one-shot instruction to the
  system prompt for that *single* reply: after answering, the bot warmly asks
  for the visitor's name and email, so the lead is captured *before* the door
  closes.
- **At 100%** — the handler returns `429`. The widget swaps its message input
  for a small **name / email / company / note form**. Submitting it sends
  `action:'final_lead'`, which fires `onLead` (classification
  `needs_followup`) with the transcript — **no LLM call needed** — so the
  professional can still follow up even though the chat budget is spent.

Counters live in process memory; they reset on restart. That is fine for a
personal-portfolio bot. For a multi-instance deploy, back them with Redis/KV.

---

## 6. Ending a chat — classification, the lead brief, and callbacks

The widget shows an **"End chat"** button once a conversation has started. The
SDK also reaches this path automatically via the limit form (`final_lead`).

When the visitor ends the chat:

```
POST /api/chat   { action:'end', messages:[ ...full transcript... ] }
        │
        ▼
classifyIntent()  ── one LLM call (heavy model), strict-JSON output ──►
        │
        ▼
   one of: spam | info_only | opportunity | needs_followup
        │
        ├─ opportunity / needs_followup  ──►  generateLeadBrief()
        │        │                            (a second LLM call: topic,
        │        │                             highlights, next step,
        │        │                             visitor name/company/email)
        │        ▼
        │   onLead({ classification, confidence, visitor, brief, transcript })
        │
        └─ spam / info_only  ──►  no lead brief, onLead does NOT fire
        │
        ▼
onChatEnd({ transcript, classification, confidence })   ── fires for EVERY chat
```

This is the **only** point where a transcript can leave the browser, and it
does so **only if you provided a callback**:

- **`onLead(lead)`** — fires only for actionable conversations (`opportunity`
  or `needs_followup`). This is where you send an email, post to Slack, write a
  row to a DB — whatever the professional wants.
- **`onChatEnd(chat)`** — fires at the end of every chat regardless of
  classification. Use it if you want to log or persist *all* transcripts.

Both callbacks are passed to `createChatHandler`. **If you pass neither, the
transcript is simply discarded** when the request finishes. The SDK ships no
database and no default persistence — that choice is deliberately yours.

> Callbacks are awaited but sandboxed: if your callback throws, the error is
> logged and the visitor still gets a clean response.

If the visitor closes the tab *without* clicking "End chat", no `end` request
is sent — that conversation is never classified and produces no lead. The
80% nudge (§5) exists partly to capture contact details before that can happen.

---

## 7. Where data lives — a summary

| Data | Persisted? | Where | Written by |
| --- | --- | --- | --- |
| Profile (`profile.json`) | **Yes** | filesystem / GitHub / S3 adapter | Admin route on Save |
| LLM key (`secrets.json`) | **Yes** | filesystem / S3 adapter (never GitHub) | Admin Connections tab |
| Live conversation | No | The visitor's browser tab only | — |
| Rate-limit counters | In-memory only | Server process RAM | The handler |
| Chat transcript | **Only if you wire a callback** | Wherever your `onLead` / `onChatEnd` sends it | Your code |
| Lead brief | **Only if you wire `onLead`** | Same | Your code |

The takeaway: the SDK is a stateless proxy with a configurable knowledge base.
It remembers *who the professional is*. It does **not** remember *who visited
or what they said* unless you explicitly tell it to.

---

## 8. End-to-end picture

```
                 ┌─────────────────────── visitor's browser ──────────────────────┐
                 │  <ChatWidget> / mount()                                         │
                 │  • holds the message array in local state                       │
                 │  • streams replies token-by-token                               │
                 │  • renders nothing until GET says "configured"                  │
                 └───────────────┬───────────────────────────────┬─────────────────┘
                                 │ POST message / end / final_lead │ GET probe
                                 ▼                                 ▼
        ┌──────────────────── professional's server / container ───────────────────┐
        │                                                                          │
        │   createChatHandler          createAdminRoute (/admin/chatbot)            │
        │   • stateless per request    • Google OAuth login                         │
        │   • loads profile + key      • profile editor + resume upload             │
        │   • streams LLM reply        • Connections tab for API keys               │
        │   • rate limits              • writes profile.json / secrets.json         │
        │   • classifies on 'end'                                                   │
        │   • fires onLead / onChatEnd ──►  YOUR code: email, Slack, DB, …           │
        │                                                                          │
        └───────────────┬──────────────────────────────────┬───────────────────────┘
                         │ read/write                       │ chat completions
                         ▼                                  ▼
              profile.json / secrets.json            LLM provider (BYOK)
              (filesystem · GitHub · S3)              Gemini · OpenAI · Anthropic
                                                      Groq · OpenRouter
```

That is the whole system. If you remember one thing: **profiles are saved,
conversations are not — you decide what to do with a transcript via `onLead`
and `onChatEnd`.**

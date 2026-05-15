// personal-assistant-chatbot — admin SPA
// Vanilla ES module. Self-contained: no external runtime deps. Served by
// createAdminHandler() as /static/ui.js.
//
// Architecture: a single state object S, a render() that rebuilds the root,
// and event delegation on the root for actions. Form inputs are kept
// "uncontrolled" — they read defaults from state, and their own change events
// write back into state — so typing doesn't trigger re-renders. Only
// structural changes (tab switch, add/remove row, save, resume preview)
// trigger render().

const ROOT_ID = 'pac-admin-root';
const SECTIONS = [
  { id: 'basics', label: 'Basics' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'skills', label: 'Skills' },
  { id: 'offerings', label: 'What I’m open to' },
  { id: 'contact', label: 'Contact' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'guardrails', label: 'Guardrails' },
  { id: 'freeform', label: 'Anything else' },
  { id: 'welcome', label: 'Welcome message' },
  { id: 'connections', label: 'Connections' },
];

const CREDENTIAL_TYPES = [
  { id: 'certification', label: 'Certification' },
  { id: 'research', label: 'Research' },
  { id: 'publication', label: 'Publication' },
  { id: 'award', label: 'Award' },
  { id: 'felicitation', label: 'Felicitation' },
  { id: 'other', label: 'Other' },
];

const PROVIDER_META = {
  gemini:     { label: 'Gemini (Google)',   keyUrl: 'https://aistudio.google.com/apikey' },
  openai:     { label: 'OpenAI',            keyUrl: 'https://platform.openai.com/api-keys' },
  anthropic:  { label: 'Anthropic',         keyUrl: 'https://console.anthropic.com/settings/keys' },
  groq:       { label: 'Groq',              keyUrl: 'https://console.groq.com/keys' },
  openrouter: { label: 'OpenRouter',        keyUrl: 'https://openrouter.ai/keys' },
};
const PROVIDER_IDS = ['gemini', 'openai', 'anthropic', 'groq', 'openrouter'];

const EMPTY_PROFILE = {
  name: '', headline: '', bio: '', photoUrl: '',
  experience: [], education: [], projects: [], credentials: [], skills: [],
  offerings: [], contact: {}, preferences: {}, guardrails: {},
  freeform: '', disclosure: { botGreeting: '' },
};

const S = {
  auth: 'checking', // 'checking' | 'login' | 'authed'
  loginError: '',
  email: '',
  profile: structuredClone(EMPTY_PROFILE),
  loadError: '',
  activeTab: 'basics',
  saving: false,
  saveError: '',
  savedAt: 0,
  parseBusy: false,
  parseError: '',
  parsedSuggestion: null,
  connections: {
    loaded: false,
    loading: false,
    available: false,
    reason: '',
    masked: null, // { defaultProvider, providers: { gemini: { configured, last4, source } } }
    pendingDefault: null,
    pendingKeys: {}, // provider -> new value being typed
    saving: false,
    savedAt: 0,
    saveError: '',
    testResults: {}, // provider -> { ok, error?, model?, busy? }
  },
};

const LOGIN_ERROR_MESSAGES = {
  oauth_denied: "Google sign-in was cancelled. Try again to continue.",
  missing_code: "Google didn't return a sign-in result. Try again.",
  pending_expired: "Sign-in took too long. Try again.",
  state_mismatch: "Sign-in security check failed. Try again (and avoid opening multiple admin tabs).",
  oauth_failed: "Couldn't complete sign-in with Google. Double-check your Google OAuth client ID and secret.",
  userinfo_failed: "Signed in, but we couldn't read your Google profile. Try again.",
  email_not_verified: "Your Google account email isn't verified. Verify it in Google, then try again.",
  unauthorized_email: "That Google account isn't on the admin allowlist. Add the email to CHATBOT_ALLOWED_EMAILS and retry.",
};

const root = document.getElementById(ROOT_ID);

// ---------- API ----------
const api = {
  async session() {
    const r = await fetch(rel('api/session'), { credentials: 'same-origin' });
    if (!r.ok) return { authenticated: false };
    return r.json();
  },
  startLogin() {
    // GET navigation so the browser preserves the OAuth redirect chain.
    location.assign(rel('api/auth/login'));
  },
  async logout() {
    await fetch(rel('api/logout'), { method: 'POST', credentials: 'same-origin' });
  },
  async getProfile() {
    const r = await fetch(rel('api/profile'), { credentials: 'same-origin' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.reason || d.error || 'Failed to load profile.');
    }
    const d = await r.json();
    return d.profile;
  },
  async saveProfile(profile) {
    const r = await fetch(rel('api/profile'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d.error === 'invalid_profile') {
        throw new Error('Profile is invalid: ' + (d.issues || []).slice(0, 3).join('; '));
      }
      throw new Error(d.reason || d.error || 'Save failed.');
    }
    const d = await r.json();
    return d.profile;
  },
  async parseResume(file) {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch(rel('api/parse-resume'), {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      if (d.error === 'llm_not_configured') {
        throw new Error('No LLM API key configured. Set one in the Connections tab first.');
      }
      if (d.error === 'pdf_empty') {
        throw new Error('That PDF had no extractable text. Is it a scanned image?');
      }
      if (d.error === 'file_too_large') throw new Error('That PDF is too large (max 10 MB).');
      throw new Error(d.reason || d.error || 'Failed to parse resume.');
    }
    const d = await r.json();
    return d.profile;
  },
  async getSecrets() {
    const r = await fetch(rel('api/secrets'), { credentials: 'same-origin' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.reason || d.error || 'Failed to load connections.');
    }
    return r.json();
  },
  async saveSecrets(patch) {
    const r = await fetch(rel('api/secrets'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.reason || d.error || 'Failed to save connections.');
    }
    return r.json();
  },
  async testSecret(provider) {
    const r = await fetch(rel('api/secrets/test'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    return r.json();
  },
};

function rel(suffix) {
  // The HTML shell sits at the admin mount root. All API calls are relative
  // to it so the mount path is irrelevant.
  const base = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  return base + suffix;
}

// ---------- Bootstrap ----------
boot().catch((err) => {
  root.innerHTML = `<div class="pac-shell"><div class="pac-banner pac-banner-error">${escapeHtml(
    err instanceof Error ? err.message : String(err)
  )}</div></div>`;
});

async function boot() {
  // Surface any ?error=... from the OAuth callback redirect.
  const params = new URLSearchParams(location.search);
  const err = params.get('error');
  if (err) {
    S.loginError = LOGIN_ERROR_MESSAGES[err] || `Sign-in failed (${err}).`;
    // Strip the query so a refresh doesn't keep showing it.
    history.replaceState({}, '', location.pathname);
  }
  const session = await api.session();
  if (!session.authenticated) {
    S.auth = 'login';
    render();
    return;
  }
  S.auth = 'authed';
  S.email = session.email || '';
  await loadProfile();
  render();
}

async function loadProfile() {
  try {
    const p = await api.getProfile();
    S.profile = normalizeProfile(p);
    S.loadError = '';
  } catch (err) {
    S.loadError = err.message;
  }
}

function normalizeProfile(p) {
  // Make sure every key exists so renderers don't have to guard.
  const merged = { ...structuredClone(EMPTY_PROFILE), ...(p || {}) };
  merged.contact = { ...(p?.contact || {}) };
  merged.preferences = { ...(p?.preferences || {}) };
  merged.guardrails = { ...(p?.guardrails || {}) };
  merged.disclosure = { ...(p?.disclosure || {}) };
  for (const k of ['experience', 'education', 'projects', 'credentials', 'skills', 'offerings']) {
    if (!Array.isArray(merged[k])) merged[k] = [];
  }
  return merged;
}

// ---------- Render dispatch ----------
function render() {
  if (S.auth === 'checking') {
    root.innerHTML = `<div class="pac-loading">Loading…</div>`;
    return;
  }
  if (S.auth === 'login') {
    renderLogin();
    return;
  }
  renderAdmin();
}

// ---------- Login screen ----------
function renderLogin() {
  root.innerHTML = `
    <div class="pac-login">
      <h1>Chatbot admin</h1>
      <p>Sign in with the Google account on this site's admin allowlist.</p>
      ${S.loginError ? `<div class="pac-banner pac-banner-error">${escapeHtml(S.loginError)}</div>` : ''}
      <button id="pac-google-signin" class="pac-google-btn" type="button" aria-label="Sign in with Google">
        <span class="pac-google-btn-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
        </span>
        <span>Sign in with Google</span>
      </button>
      <p class="pac-login-hint">First time here? Your developer needs to register the Google OAuth client and add your email to <code>CHATBOT_ALLOWED_EMAILS</code>.</p>
    </div>`;
  document.getElementById('pac-google-signin').addEventListener('click', () => {
    api.startLogin();
  });
}

// ---------- Admin shell ----------
function renderAdmin() {
  const isConfigured = !!(S.profile.name && S.profile.name.trim());
  root.innerHTML = `
    <div class="pac-shell">
      <div class="pac-header">
        <h1>Your chatbot profile</h1>
        <span class="pac-status">${isConfigured ? '✓ Live' : '⚠ Not configured yet'}</span>
        ${S.email ? `<span class="pac-user-pill" title="Signed in via Google">${escapeHtml(S.email)}</span>` : ''}
        <button id="pac-logout" class="pac-button pac-button-ghost" type="button">Sign out</button>
      </div>

      ${
        !isConfigured
          ? `<div class="pac-banner">Your chatbot won't appear on your public page until you save at least your name.</div>`
          : ''
      }
      ${S.loadError ? `<div class="pac-banner pac-banner-error">${escapeHtml(S.loadError)}</div>` : ''}

      ${renderDropzone()}

      <nav class="pac-tabs" role="tablist">
        ${SECTIONS.map(
          (s) =>
            `<button class="pac-tab" role="tab" data-tab="${s.id}" aria-current="${
              S.activeTab === s.id ? 'true' : 'false'
            }">${escapeHtml(s.label)}</button>`
        ).join('')}
      </nav>

      <div id="pac-section">${renderSection(S.activeTab)}</div>

      <div class="pac-sticky-save">
        ${S.saving ? '<span class="pac-saving-indicator">Saving…</span>' : ''}
        ${S.saveError ? `<span class="pac-saving-indicator" style="color:var(--pac-danger)">${escapeHtml(S.saveError)}</span>` : ''}
        ${S.savedAt && Date.now() - S.savedAt < 4000 ? `<span class="pac-saving-indicator" style="color:var(--pac-success)">Saved ✓</span>` : ''}
        <button id="pac-save" class="pac-button pac-button-primary" type="button"${S.saving ? ' disabled' : ''}>
          Save changes
        </button>
      </div>
    </div>
    ${renderParsedSuggestionModal()}`;

  attachAdminListeners();
}

function renderDropzone() {
  if (S.parseBusy) {
    return `<div class="pac-card"><div class="pac-dropzone pac-dropzone-busy">
      <strong>Reading your resume…</strong>
      <span>Parsing the PDF and asking the AI to structure it. This usually takes 10–30 seconds.</span>
    </div></div>`;
  }
  return `
    <div class="pac-card">
      <h2>Got a resume? Drop it in.</h2>
      <p class="pac-card-hint">We'll read it and pre-fill the form below. You'll review and edit before anything is saved.</p>
      <label class="pac-dropzone" id="pac-dropzone">
        <strong>Drop a PDF here or click to choose</strong>
        <span>Max 10 MB. We never store the PDF — only what you save below.</span>
        <input type="file" accept="application/pdf,.pdf" id="pac-resume-input" />
      </label>
      ${
        S.parseError
          ? `<div class="pac-banner pac-banner-error" style="margin-top:12px">${escapeHtml(S.parseError)}</div>`
          : ''
      }
    </div>`;
}

function renderParsedSuggestionModal() {
  if (!S.parsedSuggestion) return '';
  const p = S.parsedSuggestion;
  const counts = [
    p.name ? `Name: ${escapeHtml(p.name)}` : null,
    p.headline ? `Headline: ${escapeHtml(p.headline)}` : null,
    p.experience?.length ? `${p.experience.length} role(s)` : null,
    p.education?.length ? `${p.education.length} education entries` : null,
    p.projects?.length ? `${p.projects.length} project(s)` : null,
  ].filter(Boolean);
  return `
    <div class="pac-modal-bg" id="pac-modal-bg">
      <div class="pac-modal" role="dialog" aria-labelledby="pac-modal-title">
        <h2 id="pac-modal-title">Pre-fill from your resume?</h2>
        <p>We found:</p>
        <ul style="margin: 0 0 14px 18px; padding: 0; color: var(--pac-muted); font-size: 13px;">
          ${counts.map((c) => `<li>${c}</li>`).join('')}
        </ul>
        <p>This will <strong>overwrite</strong> your current Basics, Experience, Education, and Projects sections. Skills, offerings, contact, and anything else you've written stays untouched.</p>
        <div class="pac-modal-actions">
          <button class="pac-button" type="button" id="pac-modal-cancel">Cancel</button>
          <button class="pac-button pac-button-primary" type="button" id="pac-modal-accept">Pre-fill form</button>
        </div>
      </div>
    </div>`;
}

// ---------- Section renderers ----------
function renderSection(id) {
  switch (id) {
    case 'basics': return renderBasics();
    case 'experience': return renderExperience();
    case 'education': return renderEducation();
    case 'projects': return renderProjects();
    case 'credentials': return renderCredentials();
    case 'skills': return renderSkills();
    case 'offerings': return renderOfferings();
    case 'contact': return renderContact();
    case 'preferences': return renderPreferences();
    case 'guardrails': return renderGuardrails();
    case 'freeform': return renderFreeform();
    case 'welcome': return renderWelcome();
    case 'connections': return renderConnections();
    default: return '';
  }
}

function renderBasics() {
  return card(
    'Basics',
    'The minimum the bot needs to introduce you.',
    `
    <div class="pac-grid">
      ${textField('name', 'Name', S.profile.name, { required: true })}
      ${textField('headline', 'Headline', S.profile.headline, {
        placeholder: 'e.g. Senior Backend Engineer · 8 yrs · Distributed systems',
      })}
    </div>
    ${textareaField('bio', 'Short bio', S.profile.bio, {
      help: 'A 2–3 sentence first-person summary the bot can read out when asked who you are.',
    })}
    ${textField('photoUrl', 'Photo URL (optional)', S.profile.photoUrl, {
      type: 'url',
      placeholder: 'https://…',
      help: 'Shown in the chat header. Leave blank for a colored placeholder.',
    })}`
  );
}

function renderExperience() {
  return card(
    'Experience',
    'Roles you want the bot to talk about. Order doesn’t matter — the bot picks what’s relevant.',
    rowList('experience', S.profile.experience, (e, i) => `
      <div class="pac-grid">
        ${textField(`experience.${i}.company`, 'Company', e.company)}
        ${textField(`experience.${i}.role`, 'Role', e.role)}
        ${textField(`experience.${i}.startDate`, 'Start (YYYY-MM)', e.startDate, { placeholder: '2023-01' })}
        ${textField(`experience.${i}.endDate`, 'End (YYYY-MM, blank = present)', e.endDate ?? '', { placeholder: 'present' })}
      </div>
      ${textareaField(`experience.${i}.description`, 'What you did there', e.description)}
      ${tagInput(`experience.${i}.skills`, 'Skills used in this role', e.skills || [])}
    `) +
      `<button class="pac-add" data-add="experience" type="button">+ Add a role</button>`
  );
}

function renderEducation() {
  return card(
    'Education',
    '',
    rowList('education', S.profile.education, (e, i) => `
      <div class="pac-grid">
        ${textField(`education.${i}.institution`, 'Institution', e.institution)}
        ${textField(`education.${i}.degree`, 'Degree', e.degree)}
      </div>
      <div class="pac-grid">
        ${textField(`education.${i}.year`, 'Year', e.year ?? '', { placeholder: '2017' })}
        ${textField(`education.${i}.marks`, 'Marks / grade', e.marks ?? '', {
          placeholder: 'e.g. 8.7 CGPA, First Class, 85%',
        })}
      </div>
    `) +
      `<button class="pac-add" data-add="education" type="button">+ Add education</button>`
  );
}

function renderProjects() {
  return card(
    'Projects',
    'Highlights you want visitors to know about.',
    rowList('projects', S.profile.projects, (e, i) => `
      <div class="pac-grid">
        ${textField(`projects.${i}.name`, 'Name', e.name)}
        ${textField(`projects.${i}.url`, 'URL (optional)', e.url, { type: 'url' })}
      </div>
      ${textareaField(`projects.${i}.description`, 'Short description', e.description)}
      ${tagInput(`projects.${i}.tech`, 'Tech / tools', e.tech || [])}
    `) +
      `<button class="pac-add" data-add="projects" type="button">+ Add project</button>`
  );
}

function renderCredentials() {
  return card(
    'Credentials',
    'Certifications, research, awards, felicitations, publications — anything formal you want the bot to mention. Add a URL for verifiable items (Credly badge, DOI, ResearchGate, etc.).',
    rowList('credentials', S.profile.credentials, (c, i) => `
      <div class="pac-grid">
        <div class="pac-field">
          <label>Type</label>
          <select data-path="credentials.${i}.type">
            ${CREDENTIAL_TYPES.map((t) => `<option value="${t.id}"${c.type === t.id ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
          </select>
        </div>
        ${textField(`credentials.${i}.date`, 'Date', c.date, { placeholder: 'e.g. 2024-03, March 2024' })}
      </div>
      ${textField(`credentials.${i}.title`, 'Title', c.title, {
        placeholder: 'e.g. AWS Certified Solutions Architect — Associate',
      })}
      ${textField(`credentials.${i}.issuer`, 'Issuer / source', c.issuer, {
        placeholder: 'e.g. Amazon Web Services, IEEE, Stanford',
      })}
      ${textField(`credentials.${i}.url`, 'Verification URL (optional)', c.url, {
        type: 'url',
        placeholder: 'https://credly.com/badges/… or https://doi.org/…',
      })}
      ${textareaField(`credentials.${i}.notes`, 'Notes (optional)', c.notes, {
        placeholder: 'Abstract, citation count, why this matters, etc.',
      })}
    `) +
      `<button class="pac-add" data-add="credentials" type="button">+ Add credential</button>`
  );
}

function renderSkills() {
  return card(
    'Skills',
    'Type a skill and press Enter. The bot uses these when matching what a visitor needs.',
    tagInput('skills', '', S.profile.skills, { placeholder: 'e.g. Go, Postgres, Kubernetes…' })
  );
}

function renderOfferings() {
  const offeringTypes = ['consulting', 'full_time', 'mentorship', 'advisory', 'speaking', 'other'];
  return card(
    'What I’m open to',
    'The kinds of engagements the bot should let through to you. Be specific about availability and rates so the bot can answer real questions.',
    rowList('offerings', S.profile.offerings, (o, i) => `
      <div class="pac-grid">
        <div class="pac-field">
          <label>Type</label>
          <select data-path="offerings.${i}.type">
            ${offeringTypes.map((t) => `<option value="${t}"${o.type === t ? ' selected' : ''}>${labelForOffering(t)}</option>`).join('')}
          </select>
        </div>
        ${textField(`offerings.${i}.rateRange`, 'Rate range (optional)', o.rateRange, { placeholder: '$200–300/hr' })}
      </div>
      ${textareaField(`offerings.${i}.description`, 'What this looks like', o.description)}
      ${textField(`offerings.${i}.availability`, 'Availability', o.availability, {
        placeholder: 'e.g. up to 6 hours/week, evenings',
      })}
    `) +
      `<button class="pac-add" data-add="offerings" type="button">+ Add an offering</button>`
  );
}

function renderContact() {
  const channels = [
    { key: 'linkedin', label: 'LinkedIn URL', type: 'url', placeholder: 'https://linkedin.com/in/…' },
    { key: 'calendly', label: 'Calendar link', type: 'url', placeholder: 'https://cal.com/yourname' },
    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://yoursite.com' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 555 0100' },
  ];
  return card(
    'Contact',
    'For each channel, decide whether the bot may share it directly in chat or should route through lead-capture instead.',
    channels
      .map((c) => {
        const v = S.profile.contact?.[c.key] || { value: '', shareInChat: false };
        return `
          <div class="pac-grid" style="align-items: end;">
            ${textField(`contact.${c.key}.value`, c.label, v.value, {
              type: c.type,
              placeholder: c.placeholder,
            })}
            <label class="pac-checkbox" style="padding-bottom: 10px;">
              <input type="checkbox" data-path="contact.${c.key}.shareInChat"${v.shareInChat ? ' checked' : ''} />
              Bot may share this in chat
            </label>
          </div>`;
      })
      .join('')
  );
}

function renderPreferences() {
  const tones = ['friendly', 'formal', 'casual'];
  return card(
    'Preferences',
    '',
    `
    <div class="pac-grid">
      <div class="pac-field">
        <label>Tone</label>
        <select data-path="preferences.tone">
          ${tones.map((t) => `<option value="${t}"${(S.profile.preferences?.tone || 'friendly') === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      ${textField('preferences.timeZone', 'Time zone', S.profile.preferences?.timeZone || '', {
        placeholder: 'e.g. America/New_York',
      })}
    </div>
    ${tagInput('preferences.languages', 'Languages', S.profile.preferences?.languages || ['English'])}
    ${tagInput('preferences.locations', 'Locations / cities', S.profile.preferences?.locations || [])}`
  );
}

function renderGuardrails() {
  return card(
    'Guardrails',
    'Two short lists the bot reads on every turn.',
    `
    ${tagInput('guardrails.neverDiscuss', 'Topics the bot must never discuss', S.profile.guardrails?.neverDiscuss || [], {
      placeholder: 'e.g. my current salary',
    })}
    ${tagInput('guardrails.alwaysMention', 'Things worth mentioning when relevant', S.profile.guardrails?.alwaysMention || [], {
      placeholder: 'e.g. prefer remote-first roles',
    })}`
  );
}

function renderFreeform() {
  return card(
    'Anything else',
    'A free-form text area for anything that doesn’t fit a structured field. The bot reads this verbatim — write it like you’re talking to the bot.',
    textareaField('freeform', '', S.profile.freeform, {
      placeholder:
        "e.g. I'm especially excited about… My availability has been changing recently because… The kind of company I'd join is… A few things I'd want a recruiter to know upfront…",
      rows: 10,
    })
  );
}

function renderConnections() {
  const c = S.connections;

  if (!c.loaded && !c.loading) {
    // Kick off the fetch; the tab re-renders when it lands.
    loadConnections();
  }
  if (c.loading) {
    return card('Connections', '', `<p class="pac-card-hint">Loading…</p>`);
  }
  if (!c.available) {
    return card(
      'Connections',
      '',
      `<div class="pac-banner">
        Your developer hasn't configured a secrets store yet, so API keys can't be edited here. ${c.reason ? `<br><br><small style="color: var(--pac-muted)">${escapeHtml(c.reason)}</small>` : ''}
        <br><br>Set <code>GEMINI_API_KEY</code> (or another provider's env var) in your hosting's environment variables instead.
      </div>`
    );
  }

  const masked = c.masked || { defaultProvider: 'gemini', providers: {} };
  const pendingDefault = c.pendingDefault ?? masked.defaultProvider;

  const providerCards = PROVIDER_IDS.map((id) => {
    const meta = PROVIDER_META[id];
    const state = masked.providers[id] || { configured: false, last4: '', source: 'none' };
    const test = c.testResults[id] || null;
    const pendingValue = c.pendingKeys[id];
    const hasPending = typeof pendingValue === 'string';
    const statusBadge = state.configured
      ? `<span class="pac-conn-badge pac-conn-badge-ok">Connected · ${state.source === 'env' ? 'env var' : 'saved'} ${state.last4 ? `· ending ${escapeHtml(state.last4)}` : ''}</span>`
      : `<span class="pac-conn-badge pac-conn-badge-off">Not connected</span>`;
    const testHtml = test
      ? test.busy
        ? `<span class="pac-conn-test pac-conn-test-busy">Testing…</span>`
        : test.ok
          ? `<span class="pac-conn-test pac-conn-test-ok">✓ Working (${escapeHtml(test.model || '')})</span>`
          : `<span class="pac-conn-test pac-conn-test-err">${escapeHtml(test.reason || test.error || 'Failed')}</span>`
      : '';
    return `
      <div class="pac-conn-row">
        <div class="pac-conn-row-head">
          <strong>${escapeHtml(meta.label)}</strong>
          ${statusBadge}
          <a class="pac-conn-link" href="${escapeAttr(meta.keyUrl)}" target="_blank" rel="noopener noreferrer">get key →</a>
        </div>
        <div class="pac-conn-row-inputs">
          <input type="password" autocomplete="off" spellcheck="false"
            data-secret-provider="${id}"
            placeholder="${state.configured ? 'Paste a new key to replace (or clear field)' : `Paste your ${escapeHtml(meta.label)} API key`}"
            value="${hasPending ? escapeAttr(pendingValue) : ''}" />
          <button type="button" class="pac-button" data-secret-test="${id}"${state.configured || hasPending ? '' : ' disabled'}>Test</button>
        </div>
        ${testHtml ? `<div class="pac-conn-test-row">${testHtml}</div>` : ''}
      </div>`;
  }).join('');

  return card(
    'Connections',
    'Paste your LLM API keys. Stored in secrets.json on your server — never sent to us. Setting a key here overrides the equivalent env var on this deployment.',
    `
    <div class="pac-field" style="margin-bottom: 16px">
      <label>Default LLM provider</label>
      <select data-secret-default-provider>
        ${PROVIDER_IDS.map((id) => `<option value="${id}"${pendingDefault === id ? ' selected' : ''}>${escapeHtml(PROVIDER_META[id].label)}</option>`).join('')}
      </select>
      <span class="pac-help">Used for chat replies and resume parsing.</span>
    </div>

    ${providerCards}

    <div class="pac-conn-actions">
      ${c.saving ? '<span class="pac-saving-indicator">Saving…</span>' : ''}
      ${c.saveError ? `<span class="pac-saving-indicator" style="color:var(--pac-danger)">${escapeHtml(c.saveError)}</span>` : ''}
      ${c.savedAt && Date.now() - c.savedAt < 4000 ? `<span class="pac-saving-indicator" style="color:var(--pac-success)">Saved ✓</span>` : ''}
      <button type="button" class="pac-button pac-button-primary" data-secret-save${c.saving ? ' disabled' : ''}>Save connections</button>
    </div>`
  );
}

async function loadConnections() {
  if (S.connections.loading) return;
  S.connections.loading = true;
  try {
    const data = await api.getSecrets();
    S.connections.available = data.available !== false;
    S.connections.masked = data.masked || null;
    S.connections.reason = data.reason || '';
    S.connections.pendingDefault = null;
    S.connections.pendingKeys = {};
  } catch (err) {
    S.connections.available = false;
    S.connections.reason = err.message;
  } finally {
    S.connections.loading = false;
    S.connections.loaded = true;
    if (S.activeTab === 'connections') rerenderSection();
  }
}

async function saveConnections() {
  if (S.connections.saving) return;
  S.connections.saving = true;
  S.connections.saveError = '';
  rerenderSection();

  const patch = {};
  if (S.connections.pendingDefault && S.connections.pendingDefault !== S.connections.masked?.defaultProvider) {
    patch.defaultProvider = S.connections.pendingDefault;
  }
  if (Object.keys(S.connections.pendingKeys).length) {
    patch.providers = {};
    for (const [provider, value] of Object.entries(S.connections.pendingKeys)) {
      patch.providers[provider] = { apiKey: value };
    }
  }

  try {
    const res = await api.saveSecrets(patch);
    S.connections.masked = res.masked;
    S.connections.pendingDefault = null;
    S.connections.pendingKeys = {};
    S.connections.savedAt = Date.now();
    S.connections.testResults = {};
  } catch (err) {
    S.connections.saveError = err.message;
  } finally {
    S.connections.saving = false;
    rerenderSection();
    setTimeout(() => {
      if (Date.now() - S.connections.savedAt >= 4000 && S.activeTab === 'connections') rerenderSection();
    }, 4100);
  }
}

async function testConnection(provider) {
  S.connections.testResults[provider] = { busy: true };
  rerenderSection();
  try {
    const res = await api.testSecret(provider);
    S.connections.testResults[provider] = res;
  } catch (err) {
    S.connections.testResults[provider] = { ok: false, error: 'test_failed', reason: err.message };
  } finally {
    rerenderSection();
  }
}

function renderWelcome() {
  return card(
    'Welcome message',
    'The first line the bot says when a visitor opens the chat. Leave blank for an auto-generated greeting.',
    textareaField('disclosure.botGreeting', '', S.profile.disclosure?.botGreeting || '', {
      placeholder: `Hi, I'm ${S.profile.name || 'your AI'}'s assistant — ask me anything about their background.`,
      rows: 3,
    })
  );
}

// ---------- Render helpers ----------
function card(title, hint, inner) {
  return `<section class="pac-card">
    <h2>${escapeHtml(title)}</h2>
    ${hint ? `<p class="pac-card-hint">${escapeHtml(hint)}</p>` : ''}
    ${inner}
  </section>`;
}

function textField(path, label, value, opts = {}) {
  const type = opts.type || 'text';
  const placeholder = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : '';
  const required = opts.required ? ' required' : '';
  return `<div class="pac-field">
    <label>${escapeHtml(label)}</label>
    <input data-path="${path}" type="${type}"${placeholder}${required} value="${escapeAttr(value ?? '')}" />
    ${opts.help ? `<span class="pac-help">${escapeHtml(opts.help)}</span>` : ''}
  </div>`;
}

function textareaField(path, label, value, opts = {}) {
  const placeholder = opts.placeholder ? ` placeholder="${escapeHtml(opts.placeholder)}"` : '';
  const rows = opts.rows || 3;
  return `<div class="pac-field">
    ${label ? `<label>${escapeHtml(label)}</label>` : ''}
    <textarea data-path="${path}"${placeholder} rows="${rows}">${escapeHtml(value || '')}</textarea>
    ${opts.help ? `<span class="pac-help">${escapeHtml(opts.help)}</span>` : ''}
  </div>`;
}

function tagInput(path, label, values, opts = {}) {
  return `<div class="pac-field">
    ${label ? `<label>${escapeHtml(label)}</label>` : ''}
    <div class="pac-tag-input" data-tags="${path}">
      ${(values || [])
        .map(
          (v, i) =>
            `<span class="pac-tag">${escapeHtml(v)}<button type="button" data-remove-tag="${path}:${i}" aria-label="remove">×</button></span>`
        )
        .join('')}
      <input type="text" placeholder="${escapeHtml(opts.placeholder || 'type and press Enter')}" />
    </div>
  </div>`;
}

function rowList(key, items, renderItem) {
  if (!items.length) {
    return `<p class="pac-card-hint" style="margin: 0 0 8px">No entries yet.</p>`;
  }
  return items
    .map(
      (item, i) => `
      <div class="pac-row" data-row-key="${key}" data-row-index="${i}">
        <div class="pac-row-actions">
          <button type="button" class="pac-button pac-button-ghost pac-button-danger" data-remove-row="${key}:${i}" aria-label="Remove">Remove</button>
        </div>
        ${renderItem(item, i)}
      </div>`
    )
    .join('');
}

function labelForOffering(t) {
  return ({
    consulting: 'Consulting',
    full_time: 'Full-time roles',
    mentorship: 'Mentorship',
    advisory: 'Advisory',
    speaking: 'Speaking',
    other: 'Other',
  })[t] || t;
}

// ---------- Event wiring ----------
function attachAdminListeners() {
  // Logout
  document.getElementById('pac-logout')?.addEventListener('click', async () => {
    await api.logout();
    S.auth = 'login';
    S.email = '';
    S.profile = structuredClone(EMPTY_PROFILE);
    render();
  });

  // Tabs
  for (const btn of document.querySelectorAll('.pac-tab')) {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab && tab !== S.activeTab) {
        S.activeTab = tab;
        rerenderSection();
      }
    });
  }

  // Save button
  document.getElementById('pac-save')?.addEventListener('click', save);

  // Form inputs (delegated)
  const sectionRoot = document.getElementById('pac-section');
  sectionRoot.addEventListener('input', onFormInput);
  sectionRoot.addEventListener('change', onFormInput);

  // Add-row buttons + connections actions
  sectionRoot.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const addKey = target.dataset.add;
    if (addKey) {
      addRow(addKey);
      return;
    }
    const removeRow = target.dataset.removeRow;
    if (removeRow) {
      const [k, idxStr] = removeRow.split(':');
      removeRowAt(k, Number(idxStr));
      return;
    }
    const removeTag = target.dataset.removeTag;
    if (removeTag) {
      const [path, idxStr] = removeTag.split(':');
      removeTagAt(path, Number(idxStr));
      return;
    }
    if (target.hasAttribute('data-secret-save')) {
      saveConnections();
      return;
    }
    const testProvider = target.dataset.secretTest;
    if (testProvider) {
      testConnection(testProvider);
    }
  });

  // Tag input — capture Enter and commas
  sectionRoot.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.tagName !== 'INPUT' || target.type !== 'text') return;
    const wrapper = target.closest('.pac-tag-input');
    if (!wrapper) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = target.value.trim().replace(/,$/, '');
      if (value) {
        const path = wrapper.getAttribute('data-tags');
        addTag(path, value);
        target.value = '';
      }
    } else if (e.key === 'Backspace' && target.value === '') {
      const path = wrapper.getAttribute('data-tags');
      const arr = getByPath(S.profile, path);
      if (Array.isArray(arr) && arr.length) removeTagAt(path, arr.length - 1);
    }
  });

  // Resume drop zone
  const drop = document.getElementById('pac-dropzone');
  const fileInput = document.getElementById('pac-resume-input');
  if (drop && fileInput) {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) startResumeParse(file);
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) startResumeParse(f);
    });
  }

  // Modal
  document.getElementById('pac-modal-cancel')?.addEventListener('click', () => {
    S.parsedSuggestion = null;
    render();
  });
  document.getElementById('pac-modal-accept')?.addEventListener('click', () => {
    applyParsedSuggestion();
  });
}

function onFormInput(e) {
  const target = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} */ (e.target);
  // Connections-tab inputs use a different attribute scheme.
  if (target.dataset?.secretProvider) {
    S.connections.pendingKeys[target.dataset.secretProvider] = target.value;
    return;
  }
  if (target.hasAttribute && target.hasAttribute('data-secret-default-provider')) {
    S.connections.pendingDefault = target.value;
    return;
  }
  if (!target.dataset?.path) return;
  const path = target.dataset.path;
  let value;
  if (target.type === 'checkbox') {
    value = /** @type {HTMLInputElement} */ (target).checked;
  } else {
    value = target.value;
  }
  setByPath(S.profile, path, value);
}

function rerenderSection() {
  // Update tab aria + section content only. Do NOT re-attach listeners:
  // `#pac-section`, the tab buttons, save/logout, and the dropzone all
  // persist across this kind of partial update — their handlers are still
  // alive. Re-attaching here would stack a fresh copy on top of the existing
  // ones, causing actions like "+ Add education" to fire N times.
  for (const btn of document.querySelectorAll('.pac-tab')) {
    btn.setAttribute('aria-current', btn.getAttribute('data-tab') === S.activeTab ? 'true' : 'false');
  }
  const sectionRoot = document.getElementById('pac-section');
  if (sectionRoot) sectionRoot.innerHTML = renderSection(S.activeTab);
}

function addRow(key) {
  if (!Array.isArray(S.profile[key])) S.profile[key] = [];
  S.profile[key].push(blankRow(key));
  rerenderSection();
}

function removeRowAt(key, idx) {
  if (!Array.isArray(S.profile[key])) return;
  S.profile[key].splice(idx, 1);
  rerenderSection();
}

function blankRow(key) {
  if (key === 'experience')
    return { company: '', role: '', startDate: '', endDate: null, description: '', skills: [] };
  if (key === 'education') return { institution: '', degree: '', year: '', marks: '' };
  if (key === 'projects') return { name: '', description: '', url: '', tech: [] };
  if (key === 'credentials')
    return { type: 'certification', title: '', issuer: '', date: '', url: '', notes: '' };
  if (key === 'offerings')
    return { type: 'consulting', description: '', availability: '', rateRange: '' };
  return {};
}

function addTag(path, value) {
  let arr = getByPath(S.profile, path);
  if (!Array.isArray(arr)) {
    setByPath(S.profile, path, []);
    arr = getByPath(S.profile, path);
  }
  arr.push(value);
  rerenderSection();
}

function removeTagAt(path, idx) {
  const arr = getByPath(S.profile, path);
  if (!Array.isArray(arr)) return;
  arr.splice(idx, 1);
  rerenderSection();
}

async function save() {
  if (S.saving) return;
  S.saving = true;
  S.saveError = '';
  render();
  try {
    const saved = await api.saveProfile(stripEmpty(S.profile));
    S.profile = normalizeProfile(saved);
    S.savedAt = Date.now();
    S.saving = false;
    render();
    setTimeout(() => {
      if (Date.now() - S.savedAt >= 4000) render();
    }, 4100);
  } catch (err) {
    S.saving = false;
    S.saveError = err.message;
    render();
  }
}

async function startResumeParse(file) {
  if (S.parseBusy) return;
  S.parseBusy = true;
  S.parseError = '';
  render();
  try {
    const parsed = await api.parseResume(file);
    S.parsedSuggestion = parsed;
  } catch (err) {
    S.parseError = err.message;
  } finally {
    S.parseBusy = false;
    render();
  }
}

function applyParsedSuggestion() {
  if (!S.parsedSuggestion) return;
  const s = S.parsedSuggestion;
  // Overwrite scoped to what resumes provide. Other sections stay untouched.
  if (s.name) S.profile.name = s.name;
  if (s.headline) S.profile.headline = s.headline;
  if (s.bio) S.profile.bio = s.bio;
  if (Array.isArray(s.experience) && s.experience.length) S.profile.experience = s.experience;
  if (Array.isArray(s.education) && s.education.length) S.profile.education = s.education;
  if (Array.isArray(s.projects) && s.projects.length) S.profile.projects = s.projects;
  S.parsedSuggestion = null;
  S.activeTab = 'basics';
  render();
}

// ---------- Path helpers ----------
function getByPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[Number.isNaN(Number(part)) ? part : Number(part)];
  }
  return cur;
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = Number.isNaN(Number(parts[i])) ? parts[i] : Number(parts[i]);
    const nextKey = parts[i + 1];
    const nextIsIndex = !Number.isNaN(Number(nextKey));
    if (cur[key] == null) cur[key] = nextIsIndex ? [] : {};
    cur = cur[key];
  }
  const lastKey = parts[parts.length - 1];
  cur[Number.isNaN(Number(lastKey)) ? lastKey : Number(lastKey)] = value;
}

function stripEmpty(obj) {
  // Light cleanup: convert "" endDate to null for experience entries, drop
  // entirely empty rows. Server's validator is forgiving, but this keeps
  // stored profile.json tidy.
  const clone = structuredClone(obj);
  if (Array.isArray(clone.experience)) {
    clone.experience = clone.experience
      .map((e) => ({ ...e, endDate: e.endDate === '' ? null : e.endDate }))
      .filter((e) => e.company || e.role || e.description);
  }
  if (Array.isArray(clone.education)) {
    clone.education = clone.education.filter((e) => e.institution || e.degree);
  }
  if (Array.isArray(clone.projects)) {
    clone.projects = clone.projects.filter((p) => p.name || p.description);
  }
  if (Array.isArray(clone.credentials)) {
    clone.credentials = clone.credentials.filter(
      (c) => c.title || c.issuer || c.url || c.notes
    );
  }
  if (Array.isArray(clone.offerings)) {
    clone.offerings = clone.offerings.filter((o) => o.description || o.availability || o.rateRange);
  }
  return clone;
}

// ---------- Escaping ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}

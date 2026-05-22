import { UI_JS_BUNDLE } from './ui-bundle.js';

/**
 * Build the HTML shell for the admin SPA. The `<base>` tag is set to the
 * mount path with a trailing slash so the relative ./static/* URLs resolve
 * correctly regardless of whether the visitor typed a trailing slash on the
 * admin URL or not.
 *
 * @param {string} mountPath - request.url.pathname for the shell request.
 */
export function renderAdminShell(mountPath) {
  const base = mountPath.endsWith('/') ? mountPath : mountPath + '/';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chatbot Admin</title>
  <meta name="robots" content="noindex, nofollow" />
  <base href="${escapeAttribute(base)}" />
  <link rel="stylesheet" href="static/ui.css" />
</head>
<body>
  <div id="pac-admin-root"><div class="pac-loading">Loading…</div></div>
  <script type="module" src="static/ui.js"></script>
</body>
</html>`;
}

function escapeAttribute(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export const ADMIN_CSS = `
/* ============================================================
   Personal Assistant Chatbot — Admin
   Aesthetic matched to the public chat widget:
   - System-font stack (visitor-facing widget uses the same)
   - White surfaces, soft cool-gray borders (#e5e7eb / #d1d5db)
   - Blue accent (#3b82f6) with darker hover (#2563eb)
   - 8–12px rounded corners, soft elevations, friendly tone
   ============================================================ */

:root {
  color-scheme: light;
  /* Surfaces */
  --pac-bg:           #f7f8fa;
  --pac-surface:      #ffffff;
  --pac-surface-alt:  #fafafa;
  --pac-border:       #e5e7eb;
  --pac-border-strong:#d1d5db;
  /* Ink */
  --pac-text:         #111827;
  --pac-text-soft:    #374151;
  --pac-muted:        #6b7280;
  --pac-muted-soft:   #9ca3af;
  /* Accent (matches widget DEFAULT_COLOR) */
  --pac-accent:       #3b82f6;
  --pac-accent-hover: #2563eb;
  --pac-accent-soft:  #eff6ff;
  --pac-accent-ring:  rgba(59, 130, 246, 0.18);
  /* Status */
  --pac-success:      #065f46;
  --pac-success-bg:   #ecfdf5;
  --pac-success-bd:   #a7f3d0;
  --pac-warning:      #92400e;
  --pac-warning-bg:   #fffbeb;
  --pac-warning-bd:   #fcd34d;
  --pac-danger:       #b91c1c;
  --pac-danger-bg:    #fef2f2;
  --pac-danger-bd:    #fecaca;
  /* Geometry */
  --pac-radius:       8px;
  --pac-radius-lg:    12px;
  --pac-radius-pill:  999px;
  --pac-shadow-1:     0 1px 2px rgba(17, 24, 39, 0.04);
  --pac-shadow-2:     0 1px 3px rgba(17, 24, 39, 0.06), 0 1px 2px rgba(17, 24, 39, 0.04);
  --pac-shadow-3:     0 4px 16px rgba(17, 24, 39, 0.08);
  /* Type — match the widget exactly */
  --pac-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --pac-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--pac-bg);
  color: var(--pac-text);
  font-family: var(--pac-font);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.pac-loading {
  padding: 96px 24px;
  text-align: center;
  color: var(--pac-muted);
  font-size: 14px;
}

/* ============================================================
   Shell — page container + header
   ============================================================ */

.pac-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 24px 96px;
}

.pac-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--pac-border);
}
.pac-header h1 {
  margin: 0;
  flex: 1;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--pac-text);
}
.pac-header .pac-status {
  font-size: 12px;
  color: var(--pac-muted);
  font-weight: 500;
  padding: 4px 10px;
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius-pill);
}

.pac-user-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pac-muted);
  padding: 4px 10px;
  border-radius: var(--pac-radius-pill);
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
}

/* ============================================================
   Tabs — pill row, scrollable on mobile
   ============================================================ */

.pac-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 18px 0 22px;
  padding: 4px;
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius-lg);
  box-shadow: var(--pac-shadow-1);
  overflow-x: auto;
}
.pac-tab {
  flex: 0 0 auto;
  padding: 7px 13px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--pac-radius);
  color: var(--pac-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 160ms ease, color 160ms ease;
}
.pac-tab:hover { color: var(--pac-text); background: var(--pac-surface-alt); }
.pac-tab[aria-current="true"] {
  color: #fff;
  background: var(--pac-accent);
}
.pac-tab[aria-current="true"]:hover { background: var(--pac-accent-hover); }

/* ============================================================
   Cards
   ============================================================ */

.pac-card {
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius-lg);
  box-shadow: var(--pac-shadow-2);
  padding: 22px 24px;
  margin-bottom: 16px;
  animation: pac-rise 220ms ease both;
}
.pac-card h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--pac-text);
}
.pac-card .pac-card-hint {
  margin: 0 0 18px;
  color: var(--pac-muted);
  font-size: 13px;
  line-height: 1.55;
  max-width: 64ch;
}

@keyframes pac-rise {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ============================================================
   Form elements
   ============================================================ */

.pac-grid { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
@media (max-width: 640px) { .pac-grid { grid-template-columns: 1fr; } }

.pac-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
.pac-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pac-text-soft);
}

.pac-field input[type="text"],
.pac-field input[type="url"],
.pac-field input[type="email"],
.pac-field input[type="tel"],
.pac-field input[type="number"],
.pac-field input[type="password"],
.pac-field textarea,
.pac-field select {
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--pac-text);
  line-height: 1.45;
  background: #fff;
  border: 1px solid var(--pac-border-strong);
  border-radius: var(--pac-radius);
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.pac-field textarea { resize: vertical; min-height: 88px; line-height: 1.55; }
.pac-field select {
  -webkit-appearance: none; -moz-appearance: none; appearance: none;
  padding-right: 36px;
  cursor: pointer;
  height: 40px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1.5L6 6.5L11 1.5' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 14px center;
}
.pac-field input::placeholder,
.pac-field textarea::placeholder {
  color: var(--pac-muted-soft);
}
.pac-field input:hover,
.pac-field textarea:hover,
.pac-field select:hover { border-color: #b8bfca; }
.pac-field input:focus,
.pac-field textarea:focus,
.pac-field select:focus {
  border-color: var(--pac-accent);
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
}
.pac-field .pac-help {
  font-size: 12.5px;
  color: var(--pac-muted);
  line-height: 1.5;
}

.pac-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--pac-text-soft);
}
.pac-checkbox input[type="checkbox"] {
  appearance: none; -webkit-appearance: none;
  width: 16px; height: 16px;
  border: 1px solid var(--pac-border-strong);
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
  position: relative;
  flex: 0 0 auto;
}
.pac-checkbox input[type="checkbox"]:hover { border-color: var(--pac-accent); }
.pac-checkbox input[type="checkbox"]:checked {
  background: var(--pac-accent);
  border-color: var(--pac-accent);
}
.pac-checkbox input[type="checkbox"]:checked::after {
  content: "";
  position: absolute; inset: 2px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 6.5l2.8 2.8L10 4' stroke='%23fff' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-size: contain;
}
.pac-checkbox input[type="checkbox"]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
}

/* ============================================================
   Buttons — match widget aesthetic (rounded, soft, friendly)
   ============================================================ */

.pac-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--pac-radius);
  border: 1px solid var(--pac-border-strong);
  background: #fff;
  color: var(--pac-text-soft);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  min-height: 36px;
}
.pac-button:hover {
  background: var(--pac-surface-alt);
  border-color: #b8bfca;
  color: var(--pac-text);
}
.pac-button:active { box-shadow: inset 0 1px 2px rgba(17,24,39,0.06); }
.pac-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
  border-color: var(--pac-accent);
}
.pac-button:disabled { opacity: 0.5; cursor: not-allowed; }
.pac-button:disabled:hover { background: #fff; border-color: var(--pac-border-strong); color: var(--pac-text-soft); }

.pac-button-primary {
  background: var(--pac-accent);
  color: #fff;
  border-color: var(--pac-accent);
  box-shadow: var(--pac-shadow-1);
}
.pac-button-primary:hover {
  background: var(--pac-accent-hover);
  border-color: var(--pac-accent-hover);
  color: #fff;
}
.pac-button-primary:disabled:hover { background: var(--pac-accent); border-color: var(--pac-accent); }

.pac-button-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--pac-muted);
}
.pac-button-ghost:hover { background: var(--pac-surface-alt); border-color: transparent; color: var(--pac-text); }

.pac-button-danger { color: var(--pac-danger); border-color: var(--pac-danger-bd); }
.pac-button-danger:hover { background: var(--pac-danger-bg); border-color: var(--pac-danger); color: var(--pac-danger); }

/* Add-row button — full-width dashed CTA */
.pac-add {
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--pac-border-strong);
  background: transparent;
  color: var(--pac-muted);
  border-radius: var(--pac-radius);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}
.pac-add:hover {
  color: var(--pac-accent);
  border-color: var(--pac-accent);
  background: var(--pac-accent-soft);
}

/* Repeating rows (experience, education, etc.) */
.pac-row {
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius);
  padding: 16px 18px 18px;
  margin-bottom: 12px;
  background: var(--pac-surface-alt);
  position: relative;
}
.pac-row .pac-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 8px;
}

/* ============================================================
   Tag input — pills like the widget's intent chips
   ============================================================ */

.pac-tag-input {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--pac-border-strong);
  background: #fff;
  border-radius: var(--pac-radius);
  min-height: 42px;
  align-items: center;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.pac-tag-input:focus-within {
  border-color: var(--pac-accent);
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
}
.pac-tag-input input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  padding: 4px 6px;
  font: inherit;
  background: transparent;
}
.pac-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px;
  background: var(--pac-accent-soft);
  color: var(--pac-accent-hover);
  border-radius: var(--pac-radius-pill);
  font-size: 12px;
  font-weight: 500;
}
.pac-tag button {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  opacity: 0.7;
}
.pac-tag button:hover { opacity: 1; }

/* ============================================================
   Banners
   ============================================================ */

.pac-banner {
  padding: 12px 14px;
  border-radius: var(--pac-radius);
  margin-bottom: 16px;
  background: var(--pac-warning-bg);
  border: 1px solid var(--pac-warning-bd);
  color: var(--pac-warning);
  font-size: 13px;
  line-height: 1.55;
}
.pac-banner-success {
  background: var(--pac-success-bg);
  border-color: var(--pac-success-bd);
  color: var(--pac-success);
}
.pac-banner-error {
  background: var(--pac-danger-bg);
  border-color: var(--pac-danger-bd);
  color: var(--pac-danger);
}

/* ============================================================
   Resume dropzone
   ============================================================ */

.pac-dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px;
  width: 100%; min-height: 132px;
  box-sizing: border-box;
  border: 1.5px dashed var(--pac-border-strong);
  border-radius: var(--pac-radius-lg);
  padding: 28px 18px;
  text-align: center;
  color: var(--pac-muted);
  background: var(--pac-surface-alt);
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}
.pac-dropzone:hover { border-color: var(--pac-accent); background: var(--pac-accent-soft); }
.pac-dropzone.is-over {
  border-color: var(--pac-accent);
  background: var(--pac-accent-soft);
  color: var(--pac-accent-hover);
}
.pac-dropzone strong {
  color: var(--pac-text);
  font-size: 14px;
  font-weight: 600;
}
.pac-dropzone span {
  font-size: 12px;
  color: var(--pac-muted);
  line-height: 1.5;
  max-width: 460px;
}
.pac-dropzone-busy { opacity: 0.75; pointer-events: none; }
.pac-dropzone input[type="file"] { display: none; }

/* ============================================================
   Sticky save bar
   ============================================================ */

.pac-sticky-save {
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, rgba(247, 248, 250, 0.96) 60%, rgba(247, 248, 250, 0));
  padding: 18px 0 14px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.pac-saving-indicator {
  font-size: 13px;
  color: var(--pac-muted);
  align-self: center;
  margin-right: auto;
  font-weight: 500;
}

/* ============================================================
   Login screen — single centered card, matches widget feel
   ============================================================ */

.pac-login {
  max-width: 420px;
  margin: 96px auto 80px;
  padding: 32px 30px 28px;
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius-lg);
  box-shadow: var(--pac-shadow-3);
}
.pac-login h1 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--pac-text);
  letter-spacing: -0.01em;
}
.pac-login p {
  margin: 0 0 20px;
  color: var(--pac-muted);
  font-size: 14px;
  line-height: 1.55;
}
.pac-login form { display: flex; flex-direction: column; gap: 10px; }
.pac-login-hint {
  font-size: 12.5px;
  color: var(--pac-muted);
  margin: 18px 0 0;
  line-height: 1.55;
}
.pac-login-hint code {
  font-family: var(--pac-mono);
  font-size: 11.5px;
  background: var(--pac-surface-alt);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--pac-border);
}

.pac-google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 11px 14px;
  min-height: 44px;
  background: #fff;
  color: var(--pac-text);
  font: inherit;
  font-weight: 500;
  font-size: 14px;
  border: 1px solid var(--pac-border-strong);
  border-radius: var(--pac-radius);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.pac-google-btn:hover {
  background: var(--pac-surface-alt);
  border-color: var(--pac-muted-soft);
  box-shadow: var(--pac-shadow-2);
}
.pac-google-btn:active { background: var(--pac-surface-alt); }
.pac-google-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
  border-color: var(--pac-accent);
}
.pac-google-btn-icon { display: inline-flex; align-items: center; }

/* ============================================================
   Connections / Notifications shared chrome
   ============================================================ */

.pac-conn-row {
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius);
  padding: 16px 18px;
  margin-bottom: 12px;
  background: var(--pac-surface-alt);
}
.pac-conn-row-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.pac-conn-row-head strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--pac-text);
  flex: 0 0 auto;
}
.pac-conn-link {
  font-size: 12px;
  color: var(--pac-accent);
  text-decoration: none;
  margin-left: auto;
  font-weight: 500;
}
.pac-conn-link:hover { color: var(--pac-accent-hover); text-decoration: underline; }

.pac-conn-row-inputs { display: flex; gap: 8px; align-items: stretch; }
.pac-conn-row-inputs input {
  flex: 1;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--pac-border-strong);
  border-radius: var(--pac-radius);
  background: #fff;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.pac-conn-row-inputs input:focus {
  border-color: var(--pac-accent);
  box-shadow: 0 0 0 3px var(--pac-accent-ring);
}
.pac-conn-row-inputs button { flex: 0 0 auto; min-width: 78px; }

.pac-conn-badge {
  display: inline-flex; align-items: center;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: var(--pac-radius-pill);
  font-weight: 500;
  line-height: 1.6;
}
.pac-conn-badge-ok {
  background: var(--pac-success-bg);
  color: var(--pac-success);
  border: 1px solid var(--pac-success-bd);
}
.pac-conn-badge-off {
  background: var(--pac-surface-alt);
  color: var(--pac-muted);
  border: 1px solid var(--pac-border);
}

.pac-conn-test-row { margin-top: 10px; }
.pac-conn-test { font-size: 12.5px; }
.pac-conn-test-ok  { color: var(--pac-success); }
.pac-conn-test-err { color: var(--pac-danger); }
.pac-conn-test-busy { color: var(--pac-muted); font-style: italic; }

.pac-conn-actions {
  display: flex; gap: 10px; align-items: center; justify-content: flex-end;
  margin-top: 18px; padding-top: 16px;
  border-top: 1px solid var(--pac-border);
}

/* ============================================================
   Modal
   ============================================================ */

.pac-modal-bg {
  position: fixed; inset: 0;
  background: rgba(17, 24, 39, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  z-index: 100;
  animation: pac-fade 180ms ease;
}
.pac-modal {
  background: var(--pac-surface);
  border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius-lg);
  padding: 24px 26px 22px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 48px rgba(17, 24, 39, 0.20);
  animation: pac-rise 220ms ease both;
}
.pac-modal h2 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--pac-text);
  letter-spacing: -0.005em;
}
.pac-modal p {
  margin: 0 0 16px;
  color: var(--pac-muted);
  font-size: 14px;
  line-height: 1.55;
}
.pac-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

@keyframes pac-fade { from { opacity: 0; } to { opacity: 1; } }

/* ============================================================
   Embed code block
   ============================================================ */

.pac-embed-code {
  background: #0f172a;
  color: #e2e8f0;
  padding: 14px 16px;
  border-radius: var(--pac-radius);
  font-family: var(--pac-mono);
  font-size: 12.5px;
  line-height: 1.65;
  overflow-x: auto;
  white-space: pre;
  margin: 0 0 12px;
}

/* ============================================================
   Selection + scrollbar
   ============================================================ */

::selection { background: var(--pac-accent); color: #fff; }

* {
  scrollbar-width: thin;
  scrollbar-color: var(--pac-border-strong) transparent;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-thumb { background: var(--pac-border-strong); border-radius: var(--pac-radius); }
*::-webkit-scrollbar-thumb:hover { background: var(--pac-muted-soft); }
*::-webkit-scrollbar-track { background: transparent; }
`;

/**
 * Return the inlined admin UI bundle. The UI source is baked into the handler
 * bundle at build time so it does not need filesystem access at runtime — this
 * is what makes the handler work under Next.js's server bundling and on
 * platforms with read-only filesystems.
 */
export async function getAdminUiBundle() {
  return UI_JS_BUNDLE;
}

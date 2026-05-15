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
:root {
  color-scheme: light;
  --pac-bg: #f8fafc;
  --pac-surface: #ffffff;
  --pac-border: #e2e8f0;
  --pac-text: #0f172a;
  --pac-muted: #64748b;
  --pac-accent: #2563eb;
  --pac-accent-hover: #1d4ed8;
  --pac-danger: #b91c1c;
  --pac-success: #15803d;
  --pac-radius: 8px;
  --pac-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--pac-bg); color: var(--pac-text);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.pac-loading { padding: 48px; color: var(--pac-muted); text-align: center; }

.pac-shell { max-width: 920px; margin: 0 auto; padding: 24px 20px 80px; }
.pac-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.pac-header h1 { font-size: 20px; margin: 0; flex: 1; font-weight: 600; }
.pac-header .pac-status { font-size: 12px; color: var(--pac-muted); }
.pac-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 14px; border-radius: var(--pac-radius); border: 1px solid var(--pac-border);
  background: var(--pac-surface); color: var(--pac-text); font-weight: 500; font-size: 13px;
  cursor: pointer; transition: background 120ms ease, border-color 120ms ease;
}
.pac-button:hover { background: #f1f5f9; }
.pac-button:disabled { opacity: 0.5; cursor: not-allowed; }
.pac-button-primary { background: var(--pac-accent); color: #fff; border-color: var(--pac-accent); }
.pac-button-primary:hover { background: var(--pac-accent-hover); border-color: var(--pac-accent-hover); }
.pac-button-danger { color: var(--pac-danger); }
.pac-button-ghost { background: transparent; border-color: transparent; color: var(--pac-muted); }
.pac-button-ghost:hover { background: #f1f5f9; color: var(--pac-text); }

.pac-banner { padding: 12px 14px; border-radius: var(--pac-radius); margin-bottom: 16px;
  background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
.pac-banner-success { background: #f0fdf4; border-color: #86efac; color: #14532d; }
.pac-banner-error { background: #fef2f2; border-color: #fecaca; color: var(--pac-danger); }

.pac-card { background: var(--pac-surface); border: 1px solid var(--pac-border);
  border-radius: var(--pac-radius); box-shadow: var(--pac-shadow); padding: 18px 20px; margin-bottom: 16px; }
.pac-card h2 { font-size: 15px; margin: 0 0 12px; font-weight: 600; }
.pac-card .pac-card-hint { color: var(--pac-muted); font-size: 12px; margin: -6px 0 12px; }

.pac-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
@media (max-width: 640px) { .pac-grid { grid-template-columns: 1fr; } }
.pac-field { display: flex; flex-direction: column; gap: 6px; }
.pac-field label { font-size: 12px; font-weight: 500; color: var(--pac-muted); text-transform: uppercase; letter-spacing: 0.02em; }
.pac-field input[type="text"], .pac-field input[type="url"], .pac-field input[type="email"],
.pac-field input[type="tel"], .pac-field input[type="password"], .pac-field textarea, .pac-field select {
  width: 100%; padding: 9px 11px; font: inherit; color: inherit; line-height: 1.4;
  background: #fff; border: 1px solid var(--pac-border); border-radius: var(--pac-radius);
  outline: none; transition: border-color 120ms ease, box-shadow 120ms ease;
}
.pac-field textarea { resize: vertical; min-height: 80px; }
.pac-field select {
  -webkit-appearance: none; -moz-appearance: none; appearance: none;
  padding-right: 34px; cursor: pointer; height: 40px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1.5L6 6.5L11 1.5' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat; background-position: right 12px center; background-size: 12px 8px;
}
.pac-field select::-ms-expand { display: none; }
.pac-field select option { color: var(--pac-text); background: #fff; }
.pac-field input:focus, .pac-field textarea:focus, .pac-field select:focus {
  border-color: var(--pac-accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.pac-field .pac-help { font-size: 12px; color: var(--pac-muted); }
.pac-checkbox { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--pac-muted); }

.pac-row { border: 1px solid var(--pac-border); border-radius: var(--pac-radius);
  padding: 14px 16px 16px; margin-bottom: 12px; position: relative; background: #fdfdfd; }
.pac-row .pac-row-actions { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; }
.pac-add { width: 100%; padding: 9px; border: 1px dashed var(--pac-border); background: transparent;
  color: var(--pac-muted); border-radius: var(--pac-radius); cursor: pointer; font-size: 13px; }
.pac-add:hover { color: var(--pac-accent); border-color: var(--pac-accent); }

.pac-tag-input { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px;
  border: 1px solid var(--pac-border); border-radius: var(--pac-radius); background: #fff; min-height: 40px; align-items: center; }
.pac-tag-input input { flex: 1; min-width: 100px; border: none; outline: none; padding: 4px 6px; font: inherit; background: transparent; }
.pac-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
  background: #eff6ff; color: var(--pac-accent); border-radius: 999px; font-size: 12px; }
.pac-tag button { background: none; border: none; color: inherit; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; }

.pac-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--pac-border); margin: 18px 0 18px; }
.pac-tab { padding: 8px 14px; border: none; background: transparent; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--pac-muted); font: inherit; font-weight: 500; }
.pac-tab:hover { color: var(--pac-text); }
.pac-tab[aria-current="true"] { color: var(--pac-accent); border-bottom-color: var(--pac-accent); }

.pac-dropzone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; width: 100%; min-height: 120px; box-sizing: border-box;
  border: 2px dashed var(--pac-border); border-radius: var(--pac-radius);
  padding: 28px 16px; text-align: center; color: var(--pac-muted); background: #f8fafc;
  cursor: pointer; transition: border-color 120ms ease, background 120ms ease;
}
.pac-dropzone.is-over { border-color: var(--pac-accent); background: #eff6ff; color: var(--pac-accent); }
.pac-dropzone strong { color: var(--pac-text); font-size: 14px; }
.pac-dropzone span { font-size: 12px; color: var(--pac-muted); line-height: 1.5; max-width: 420px; }
.pac-dropzone-busy { opacity: 0.7; pointer-events: none; }
.pac-dropzone input[type="file"] { display: none; }

.pac-sticky-save { position: sticky; bottom: 0; background: linear-gradient(to top, rgba(248, 250, 252, 0.95), rgba(248, 250, 252, 0.6));
  padding: 14px 0; display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; backdrop-filter: blur(8px); }
.pac-saving-indicator { font-size: 13px; color: var(--pac-muted); align-self: center; margin-right: auto; }

.pac-login { max-width: 400px; margin: 80px auto; padding: 28px; background: var(--pac-surface);
  border: 1px solid var(--pac-border); border-radius: var(--pac-radius); box-shadow: var(--pac-shadow); }
.pac-login h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
.pac-login p { margin: 0 0 16px; color: var(--pac-muted); font-size: 13px; }
.pac-login form { display: flex; flex-direction: column; gap: 10px; }
.pac-login-hint { font-size: 12px; color: var(--pac-muted); margin: 16px 0 0; line-height: 1.5; }
.pac-login-hint code { font-size: 11px; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; }

.pac-google-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 10px 14px; min-height: 42px;
  background: #fff; color: #1f2937; font: inherit; font-weight: 500; font-size: 14px;
  border: 1px solid #dadce0; border-radius: var(--pac-radius); cursor: pointer;
  transition: background 120ms ease, box-shadow 120ms ease;
}
.pac-google-btn:hover { background: #f8fafc; box-shadow: 0 1px 3px rgba(15,23,42,0.08); }
.pac-google-btn:active { background: #f1f5f9; }
.pac-google-btn:focus { outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25); }
.pac-google-btn-icon { display: inline-flex; align-items: center; }

.pac-user-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  color: var(--pac-muted); padding: 4px 10px; border-radius: 999px; background: #f1f5f9; }

.pac-conn-row { border: 1px solid var(--pac-border); border-radius: var(--pac-radius);
  padding: 14px 16px; margin-bottom: 10px; background: #fdfdfd; }
.pac-conn-row-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pac-conn-row-head strong { font-size: 14px; flex: 0 0 auto; }
.pac-conn-link { font-size: 12px; color: var(--pac-accent); text-decoration: none; margin-left: auto; }
.pac-conn-link:hover { text-decoration: underline; }
.pac-conn-row-inputs { display: flex; gap: 8px; align-items: stretch; }
.pac-conn-row-inputs input { flex: 1; padding: 9px 11px; font: inherit;
  border: 1px solid var(--pac-border); border-radius: var(--pac-radius); background: #fff; outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease; }
.pac-conn-row-inputs input:focus { border-color: var(--pac-accent); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
.pac-conn-row-inputs button { flex: 0 0 auto; min-width: 72px; }

.pac-conn-badge { display: inline-flex; align-items: center; font-size: 11px; padding: 2px 8px;
  border-radius: 999px; font-weight: 500; }
.pac-conn-badge-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.pac-conn-badge-off { background: #f1f5f9; color: var(--pac-muted); border: 1px solid var(--pac-border); }

.pac-conn-test-row { margin-top: 8px; font-size: 12px; }
.pac-conn-test { font-size: 12px; }
.pac-conn-test-ok { color: var(--pac-success); }
.pac-conn-test-err { color: var(--pac-danger); }
.pac-conn-test-busy { color: var(--pac-muted); font-style: italic; }

.pac-conn-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end;
  margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--pac-border); }

.pac-modal-bg { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 100; }
.pac-modal { background: var(--pac-surface); border-radius: var(--pac-radius);
  padding: 20px 22px; max-width: 460px; width: 100%; box-shadow: 0 8px 32px rgba(15, 23, 42, 0.2); }
.pac-modal h2 { margin: 0 0 8px; font-size: 16px; }
.pac-modal p { margin: 0 0 14px; color: var(--pac-muted); }
.pac-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
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

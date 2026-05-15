/**
 * GitHub-backed storage. Reads and writes a file in a GitHub repository via
 * the Contents API. Each save creates a real commit, which triggers the dev's
 * normal CI/CD redeploy on platforms wired to GitHub (Vercel, Netlify, etc.).
 *
 * @param {import('./index.js').GithubStorageConfig} config
 * @returns {import('../core/types.js').StorageAdapter}
 */
export function createGithubStorage(config) {
  const { owner, repo, path, token } = config;
  if (!owner || !repo || !path || !token) {
    throw new Error(
      'createGithubStorage: config.owner, config.repo, config.path, config.token are all required'
    );
  }
  const branch = config.branch;
  const commitMessage = config.commitMessage ?? 'chore: update profile';
  const authorName = config.authorName ?? 'personal-assistant-chatbot';
  const authorEmail = config.authorEmail ?? 'bot@personal-assistant-chatbot';

  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

  async function fetchExisting() {
    const url = branch ? `${apiBase}?ref=${encodeURIComponent(branch)}` : apiBase;
    const res = await fetch(url, {
      method: 'GET',
      headers: githubHeaders(token),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub read failed (${res.status}): ${await safeText(res)}`);
    }
    /** @type {{sha: string, content: string, encoding: string}} */
    const data = await res.json();
    return data;
  }

  return {
    // GitHub-backed storage commits files to a repo — never appropriate for
    // API keys or other secrets. The admin handler refuses to use this
    // adapter as `secretsStorage` based on this flag.
    supportsSecrets: false,
    async read() {
      const existing = await fetchExisting();
      if (!existing) return null;
      if (existing.encoding !== 'base64') {
        throw new Error(`GitHub returned unexpected encoding "${existing.encoding}"`);
      }
      return base64Decode(existing.content.replace(/\n/g, ''));
    },
    async write(content) {
      const existing = await fetchExisting();
      const body = {
        message: commitMessage,
        content: base64Encode(content),
        committer: { name: authorName, email: authorEmail },
        ...(branch ? { branch } : {}),
        ...(existing?.sha ? { sha: existing.sha } : {}),
      };
      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...githubHeaders(token), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`GitHub write failed (${res.status}): ${await safeText(res)}`);
      }
    },
  };
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'personal-assistant-chatbot',
  };
}

function base64Encode(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  // Browser / edge fallback. Avoid btoa(utf8) loss by encoding via TextEncoder first.
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(b64) {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

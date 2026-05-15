import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChatPanel } from './chat-panel';

export const dynamic = 'force-dynamic';

async function loadProfile() {
  try {
    const raw = await readFile(resolve(process.cwd(), 'profile.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function Page() {
  const profile = await loadProfile();
  const isConfigured = !!(profile?.name && String(profile.name).trim());

  if (!isConfigured) {
    return (
      <main
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: '96px 24px',
          minHeight: '100vh',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#0f172a',
        }}
      >
        <h1 style={{ fontSize: 26, margin: '0 0 12px' }}>Your chatbot is almost ready</h1>
        <p style={{ color: '#64748b', lineHeight: 1.6 }}>
          Visit <a href="/admin/chatbot">/admin/chatbot</a> to upload your resume or fill in your
          profile. Once you save your name, this page will become your public landing page and the
          chatbot will appear here.
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: 0 }}>{profile.name}</h1>
      {profile.headline && <p style={{ color: '#4b5563', fontSize: 18 }}>{profile.headline}</p>}
      {profile.bio && <p style={{ color: '#4b5563', lineHeight: 1.6 }}>{profile.bio}</p>}

      <h2 style={{ marginTop: 48 }}>Chat with my AI assistant</h2>
      <p style={{ color: '#4b5563' }}>
        Ask about my background, projects, or availability. Real opportunities get passed back to me.
      </p>

      <div style={{ marginTop: 16 }}>
        <ChatPanel
          name={profile.name}
          welcomeMessage={profile.disclosure?.botGreeting}
        />
      </div>
    </main>
  );
}

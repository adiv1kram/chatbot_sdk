import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ChatPanel } from './chat-panel';

export const dynamic = 'force-dynamic';

const dataDir = process.env.CHATBOT_DATA_DIR || process.cwd();

async function loadProfile() {
  try {
    const raw = await readFile(resolve(join(dataDir, 'profile.json')), 'utf8');
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {profile.photoUrl && (
          <img
            src={profile.photoUrl}
            alt={profile.name}
            width={96}
            height={96}
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}
        <div>
          <h1 style={{ margin: 0 }}>{profile.name}</h1>
          {profile.headline && (
            <p style={{ color: '#4b5563', fontSize: 18, margin: '6px 0 0' }}>{profile.headline}</p>
          )}
        </div>
      </div>
      {profile.bio && (
        <p style={{ color: '#4b5563', lineHeight: 1.6, marginTop: 20 }}>{profile.bio}</p>
      )}

      <h2 style={{ marginTop: 48 }}>Chat with my AI assistant</h2>
      <p style={{ color: '#4b5563' }}>
        Ask about my background, projects, or availability. Real opportunities get passed back to
        me.
      </p>

      <div style={{ marginTop: 16 }}>
        <ChatPanel
          name={profile.name}
          photoUrl={profile.photoUrl}
          welcomeMessage={profile.disclosure?.botGreeting}
        />
      </div>
    </main>
  );
}

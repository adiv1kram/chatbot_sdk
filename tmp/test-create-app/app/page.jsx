'use client';

import { ChatWidget } from 'personal-assistant-chatbot/react';
import { profile } from '@/lib/profile';

export default function Page() {
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
      {profile.headline && (
        <p style={{ color: '#4b5563', fontSize: 18 }}>{profile.headline}</p>
      )}
      {profile.bio && <p style={{ color: '#4b5563', lineHeight: 1.6 }}>{profile.bio}</p>}

      <h2 style={{ marginTop: 48 }}>Chat with my AI assistant</h2>
      <p style={{ color: '#4b5563' }}>
        Ask about my background, projects, or availability. Real opportunities get passed back to
        me.
      </p>

      <div style={{ marginTop: 16 }}>
        <ChatWidget
          endpoint="/api/chat"
          theme={{
            color: '#3b82f6',
            botName: `${profile.name}'s AI Assistant`,
            welcomeMessage: profile.disclosure?.botGreeting,
          }}
          intentChips={[
            { label: 'Job opportunity' },
            { label: 'Consulting' },
            { label: 'Mentorship' },
            { label: 'Just curious' },
          ]}
        />
      </div>
    </main>
  );
}

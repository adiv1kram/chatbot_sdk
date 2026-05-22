'use client';

import { ChatWidget } from 'personal-assistant-chatbot/react';

export function ChatPanel({ name, welcomeMessage, photoUrl }) {
  return (
    <ChatWidget
      endpoint="/api/chat"
      theme={{
        color: '#3b82f6',
        botName: name ? `${name}'s AI Assistant` : 'AI Assistant',
        avatarUrl: photoUrl || undefined,
        welcomeMessage,
      }}
      intentChips={[
        { label: 'Job opportunity' },
        { label: 'Consulting' },
        { label: 'Mentorship' },
        { label: 'Just curious' },
      ]}
    />
  );
}

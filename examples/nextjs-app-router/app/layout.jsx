export const metadata = {
  title: 'Personal Assistant Chatbot — Example',
  description: 'Phase 1 example app demonstrating the SDK with Gemini.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          background: '#f9fafb',
          color: '#111827',
        }}
      >
        {children}
      </body>
    </html>
  );
}

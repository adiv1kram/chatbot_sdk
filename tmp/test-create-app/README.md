# test-create-app

Your personal assistant chatbot, scaffolded by `create-personal-assistant-chatbot`.

## Setup

1. Fill in `lib/profile.js` with your real details. The fastest way is to run, from this directory:

   ```bash
   npx personal-assistant-chatbot init ./resume.pdf --out lib/profile.js
   ```

   You can also edit the file by hand. TODO sections are marked with 📝.

2. Add your LLM API key:

   ```bash
   cp .env.local.example .env.local
   # paste your key into .env.local
   ```

   Get a free Gemini key at <https://aistudio.google.com/apikey>.

3. Wire your `onLead` callback in `app/api/chat/route.js` (email yourself, Slack, save to DB — whatever you want).

4. Run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:3000>.

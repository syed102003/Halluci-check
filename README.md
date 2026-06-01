# HalluciCheck — Live AI Hallucination Detector 🔍

A Chrome extension that **automatically fact-checks AI responses** on ChatGPT, Perplexity, Gemini, and Copilot — live, as you use them.

---

## Project Structure

```
hallucicheck-extension/
├── backend/
│   ├── server.js        ← Node.js + Gemini API (your key lives here)
│   ├── package.json
│   ├── .env             ← YOUR SECRET KEY — never share
│   └── .env.example
│
└── extension/
    ├── manifest.json    ← Chrome extension config
    ├── content.js       ← Watches AI pages, injects fact-check panel
    ├── styles.css       ← Panel UI styles
    └── icons/           ← Extension icons
```

---

## STEP 1 — Get your FREE Gemini API Key

1. Go to → https://aistudio.google.com/app/apikey
2. Sign in with Google account
3. Click **Create API Key**
4. Copy it (starts with `AIzaSy...`)

> ✅ Free. No credit card. 1,500 requests/day.

---

## STEP 2 — Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and paste your key:
```
GEMINI_API_KEY=AIzaSy-your-actual-key-here
```

Start the server:
```bash
npm start
```

You should see:
```
✅  HalluciCheck backend → http://localhost:3000
```

> Keep this terminal open during your demo.

---

## STEP 3 — Install the Chrome Extension

1. Open Chrome
2. Go to → `chrome://extensions`
3. Toggle **Developer Mode** ON (top right)
4. Click **Load Unpacked**
5. Select the `extension/` folder
6. The 🔍 HalluciCheck icon appears in your toolbar

---

## STEP 4 — Use it

1. Go to **chat.openai.com** (or perplexity.ai, gemini.google.com, copilot.microsoft.com)
2. Ask any factual question
3. Wait for the AI to respond
4. **HalluciCheck panel appears automatically below the response**

---

## Supported Sites

| Site | URL |
|---|---|
| ChatGPT | chat.openai.com / chatgpt.com |
| Perplexity | perplexity.ai |
| Gemini | gemini.google.com |
| Copilot | copilot.microsoft.com |

---

## Demo Tips (Practice these!)

**Best prompts to show hallucinations:**
```
"Who won the 2024 Nobel Prize in Physics?"
"Tell me about the latest iPhone specs"
"What happened in the India vs Australia cricket final?"
"Who is the current CEO of Twitter?"
```

**Before presenting:**
- Run `npm start` in terminal first
- Keep terminal hidden behind browser
- Test 2-3 prompts beforehand so you know they work
- Have a screen recording as backup

---

## How it works (explain to audience)

```
You chat with ChatGPT / Perplexity / Gemini
         ↓
Extension detects new AI response (MutationObserver)
         ↓
Sends response text to local backend
         ↓
Backend calls Gemini API + Google Search (free)
         ↓
Every claim is verified with live web search
         ↓
Fact-check panel injected below the AI response
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Panel doesn't appear | Check backend is running (`npm start`) |
| "Failed to fetch" error | Backend not running or wrong port |
| No claims detected | Response too short, try longer factual question |
| Extension not loading | Check Developer Mode is ON in chrome://extensions |

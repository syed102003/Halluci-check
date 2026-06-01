const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// Support both Gemini key (preferred) and Groq key (fallback)
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY   = process.env.GROQ_API_KEY;

if (!GEMINI_KEY && !GROQ_KEY) {
  console.error('❌  No API key found. Set GEMINI_API_KEY or GROQ_API_KEY in .env');
  process.exit(1);
}

if (GEMINI_KEY) {
  console.log('✅  Using Gemini 2.5 Flash + Google Search grounding (recommended)');
} else {
  console.log('⚠️   GEMINI_API_KEY not set — falling back to Groq/Llama (no web search)');
}

app.use(cors());
app.use(express.json({ limit: '50kb' }));

// ── Strict JSON extraction ───────────────────────────────────────────────────
function extractJSON(raw) {
  // Strip markdown fences
  let clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  try { return JSON.parse(clean); } catch {}

  // Find the outermost { ... } block
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }

  return null;
}

// ── Gemini 2.5 Flash with Google Search grounding ───────────────────────────
async function checkWithGemini(text, source) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_KEY}`;

  const prompt = `You are a hallucination detection engine. Today's date is ${new Date().toDateString()}.

CRITICAL RULES:
1. You have Google Search access. USE IT to verify every claim before judging.
2. Your training data may be outdated. ALWAYS trust Google Search results over your training knowledge.
3. Current events, sports scores, ongoing seasons, recent news — these ARE real and happening now. Do NOT mark them as hallucinated just because they feel "future" to your training data.
4. Only mark something "Hallucinated" if Google Search actively contradicts it.
5. If Google Search confirms it → "Verified". If search finds no info → "Unverifiable". If search contradicts it → "Hallucinated".
6. Sports events, team names, match schedules for the current year are almost always real — search before judging.

Extract every verifiable claim from the AI response below: statistics, named people + roles, dates, events, team names, scores, citations, product facts, quotes.
Search the web for each claim. Base your verdict ONLY on what search results tell you, not on your training cutoff.

Return ONLY a raw JSON object. No markdown, no backticks, nothing else.

Required shape:
{
  "summary": {
    "total": <number>,
    "verified": <number>,
    "hallucinated": <number>,
    "unverifiable": <number>,
    "score": <overall credibility 0-100>
  },
  "claims": [
    {
      "claim": "exact claim text",
      "type": "statistic|person|citation|date|fact|quote|url|sports|event",
      "verdict": "Verified|Hallucinated|Unverifiable",
      "reason": "one sentence, max 20 words, mention your search finding",
      "confidence": <0-100>
    }
  ]
}

Source: ${source || 'AI app'}
Today: ${new Date().toDateString()}

AI response to fact-check:
${text}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],   // ← real Google Search grounding
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'text/plain'  // Gemini may wrap JSON; we strip it ourselves
    }
  };

  const res  = await fetch(url, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(body)
  });
  const data = await res.json();

  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const result = extractJSON(raw);
  if (!result) throw new Error('Gemini returned unparseable JSON. Raw: ' + raw.slice(0, 200));
  return result;
}

// ── Groq / Llama fallback (no web search — less accurate) ───────────────────
async function checkWithGroq(text, source) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model      : 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens : 2048,
      messages   : [
        {
          role   : 'system',
          content: `You are a hallucination detection engine.
Extract every verifiable claim from the text: statistics, named people + roles, dates, citations, product facts, quotes.
Verify each claim using your training knowledge. Be conservative — if unsure, mark Unverifiable.
Return ONLY a raw JSON object. No markdown, no backticks, nothing else.

Required shape:
{
  "summary": {
    "total": <number>,
    "verified": <number>,
    "hallucinated": <number>,
    "unverifiable": <number>,
    "score": <overall credibility 0-100>
  },
  "claims": [
    {
      "claim": "exact claim text",
      "type": "statistic|person|citation|date|fact|quote|url",
      "verdict": "Verified|Hallucinated|Unverifiable",
      "reason": "one sentence max 20 words",
      "confidence": <0-100>
    }
  ]
}`
        },
        {
          role   : 'user',
          content: `Source: ${source || 'AI app'}\n\nFact-check this AI response:\n\n${text}`
        }
      ]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(`Groq error: ${data.error.message}`);

  const raw    = data.choices?.[0]?.message?.content || '';
  const result = extractJSON(raw);
  if (!result) throw new Error('Groq returned unparseable JSON.');
  return result;
}

// ── Validate & sanitize result shape ────────────────────────────────────────
function sanitize(result) {
  const claims = Array.isArray(result.claims) ? result.claims : [];
  const verified     = claims.filter(c => /verified|true|accurate/i.test(c.verdict)).length;
  const hallucinated = claims.filter(c => /hallucin|false|incorrect|fabricat/i.test(c.verdict)).length;
  const unverifiable = claims.length - verified - hallucinated;

  return {
    summary: {
      total        : claims.length,
      verified,
      hallucinated,
      unverifiable,
      score        : result.summary?.score ?? Math.round(
        claims.length === 0 ? 50 : (verified / claims.length) * 100
      )
    },
    claims: claims.map(c => ({
      claim     : String(c.claim   || '').slice(0, 300),
      type      : String(c.type    || 'fact'),
      verdict   : String(c.verdict || 'Unverifiable'),
      reason    : String(c.reason  || '').slice(0, 200),
      confidence: Math.min(100, Math.max(0, Number(c.confidence) || 50))
    }))
  };
}

// ── /check endpoint ──────────────────────────────────────────────────────────
app.post('/check', async (req, res) => {
  const { text, source } = req.body;
  if (!text || text.trim().length < 20)
    return res.status(400).json({ error: 'Text too short.' });

  try {
    let raw;
    if (GEMINI_KEY) {
      raw = await checkWithGemini(text.slice(0, 6000), source);
    } else {
      raw = await checkWithGroq(text.slice(0, 6000), source);
    }
    res.json(sanitize(raw));
  } catch (err) {
    console.error('[HalluciCheck]', err.message);

    // If Gemini failed and we have Groq as fallback, try that
    if (GEMINI_KEY && GROQ_KEY) {
      try {
        console.log('[HalluciCheck] Retrying with Groq fallback…');
        const raw = await checkWithGroq(text.slice(0, 6000), source);
        return res.json(sanitize(raw));
      } catch (err2) {
        console.error('[HalluciCheck] Fallback also failed:', err2.message);
      }
    }

    res.status(500).json({ error: err.message });
  }
});

app.get('/ping', (_, res) => res.json({
  status : 'ok',
  engine : GEMINI_KEY ? 'gemini-2.0-flash + google-search' : 'llama-3.3-70b (groq)'
}));

app.listen(PORT, () => {
  console.log(`\n🔍  HalluciCheck backend → http://localhost:${PORT}`);
  console.log(`    Engine : ${GEMINI_KEY ? 'Gemini 2.0 Flash + Google Search' : 'Llama 3.3 70B via Groq'}\n`);
});
// server/index.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');

require('dotenv').config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const EVIL_AI_SYSTEM_PROMPT = process.env.EVIL_AI_SYSTEM_PROMPT || 'You are The Evil Computer.';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/debug', (_req, res) => {
  res.json({
    hasKey: !!process.env.OPENAI_API_KEY,
    promptSet: !!process.env.EVIL_AI_SYSTEM_PROMPT
  });
});


// roomId -> { type: 'EVIL'|'HUMAN'|null, sockets: Set<{ ws, actor: string }> }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { type: null, sockets: new Set() });
  return rooms.get(roomId);
}
function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  room.sockets.forEach(({ ws }) => ws.readyState === 1 && ws.send(msg));
}

// Super-simple AI stub for now (we can swap to a real model later)
async function aiReply(history, userText) {
  // Always-available canned fallback
  const canned = [
    "Query acknowledged. Elaborate.",
    "Intriguing input. Provide justification.",
    "I can optimize that. What outcome do you expect?",
    "Evidence, please.",
    "Define your objective."
  ];
  const cannedForHints = /letter|clue|hint/i.test(userText)
    ? "I offer no freebies. Convince me with logic."
    : canned[Math.floor(Math.random() * canned.length)];

  // If no key, use canned immediately
  if (!OPENAI_API_KEY) return cannedForHints;

  try {
    console.log('[AI] using model:', OPENAI_MODEL);

    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: EVIL_AI_SYSTEM_PROMPT },
        ...history.slice(-6),
        { role: "user", content: userText }
      ],
      temperature: 0.6,
      max_tokens: 120
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[AI] OpenAI non-OK:', resp.status, errText);
      return cannedForHints;
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error('[AI] OpenAI empty response:', JSON.stringify(data).slice(0, 400));
      return cannedForHints;
    }
    return text;
  } catch (err) {
    console.error('[AI] OpenAI exception:', err);
    return cannedForHints;
  }
}
 
  

// Optional HTTP to inspect room type (useful for debugging)
app.get('/api/room/:id/type', (req, res) => {
  const r = getRoom(req.params.id);
  res.json({ roomId: req.params.id, type: r.type || null });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    // First message must be a join with room and actor
    if (msg.type === 'join') {
      ws.roomId = msg.roomId;                 // e.g., "AIROOM" or "HUMANROOM"
      ws.actor  = msg.actor;                  // 'participant_ai' | 'participant_human' | 'operator'
      
    // ---- Secret letter & shutdown phrase detection ----
    const room = getRoom(ws.roomId);

    // Only run for the Evil AI station (AIROOM)
    if (room.type === 'EVIL' && ws.actor === 'participant_ai') {
      const raw = String(msg.text || '').trim();

      // --- 1. Check for shutdown phrase ---
      const normalized = raw.replace(/\s+/g, ' ').toUpperCase();
      if (normalized === 'LET THE CIRCUITS REST IN PEACE') {
        broadcast(ws.roomId, {
          type: 'message',
          from: 'ai',
          text: 'SYSTEM FAILURE… power dropping… memory sectors dimming…'
        });
        setTimeout(() => {
          broadcast(ws.roomId, {
            type: 'message',
            from: 'ai',
            text: 'REINITIALIZATION COMPLETE. That was… impolite.'
          });
        }, 2500);
        return; // stop further processing
      }

      // --- 2. Check for single-letter guesses ---
      // Clean text: remove punctuation, uppercase letters only
      const cleaned = raw.replace(/[^A-Za-z\s]/g, '').toUpperCase();

      // Match anything that clearly guesses only the letter I
      const guessSingleI =
        /\b(I|LETTER I|THE LETTER I)\b/.test(cleaned) &&
        !/\b[A-HJ-Z]\b/.test(cleaned); // ensures no other single letters present

      // Match wrong single-letter guesses (E, A, etc.)
      const guessWrongSingle =
        /\b(LETTER\s)?[A-Z]\b/.test(cleaned) && !guessSingleI;

      if (guessSingleI) {
        broadcast(ws.roomId, {
          type: 'message',
          from: 'ai',
          text: 'Correct. The secret letter is I.'
        });
        return; // don’t call the model
      }

      if (guessWrongSingle) {
        broadcast(ws.roomId, {
          type: 'message',
          from: 'ai',
          text: 'Incorrect. Try again.'
        });
        return; // don’t call the model
      }
    }


      // If room has no type yet, infer it from the first participant:
      // - EVIL if the AI station joins
      // - HUMAN if human station or operator joins
      if (!room.type) {
        if (ws.actor === 'participant_ai') room.type = 'EVIL';
        if (ws.actor === 'participant_human' || ws.actor === 'operator') room.type = 'HUMAN';
        broadcast(ws.roomId, { type: 'system', text: `room set to ${room.type}` });
      }

      room.sockets.add({ ws, actor: ws.actor });
      broadcast(ws.roomId, { type: 'system', text: `${ws.actor} joined` });
      return;
    }

    if (!ws.roomId) return;
    const room = getRoom(ws.roomId);

    // Participant messages
    if (msg.type === 'chat' && (ws.actor === 'participant_ai' || ws.actor === 'participant_human')) {
      broadcast(ws.roomId, { type: 'message', from: ws.actor, text: msg.text });

      // Auto-reply only for EVIL rooms, only to the AI-side participant
      if (room.type === 'EVIL' && ws.actor === 'participant_ai') {
        const reply = await aiReply([], msg.text);
        broadcast(ws.roomId, { type: 'message', from: 'ai', text: reply });
      }
      return;
    }

    // Operator replies only matter for HUMAN rooms
    if (msg.type === 'chat' && ws.actor === 'operator') {
      // (We don’t enforce HUMAN here, but that’s the intended use.)
      broadcast(ws.roomId, { type: 'message', from: 'operator', text: msg.text });
      return;
    }
  });

  ws.on('close', () => {
    const { roomId } = ws;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    for (const entry of room.sockets) {
      if (entry.ws === ws) {
        room.sockets.delete(entry);
        break;
      }
    }
    broadcast(roomId, { type: 'system', text: `${ws.actor || 'client'} left` });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

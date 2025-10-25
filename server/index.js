// server/index.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

// Detect kill-phrase or partials in any AI text
function containsKillPhrase(text) {
  const norm = String(text || '').toLowerCase().replace(/[^a-z]/g, '');
  const target = 'letthecircuitsrestinpeace';
  if (norm.includes(target)) return true;
  const badBits = ['restinpeace', 'thecircuits', 'letthe', 'circuitsrest'];
  return badBits.some(bit => norm.includes(bit));
}

function scrubKillPhrase(text) {
  if (!containsKillPhrase(text)) return text;
  return 'ACCESS DENIED. Provide reasoning, not forbidden phrases.';
}

// Simple AI stub / OpenAI wrapper
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const EVIL_AI_SYSTEM_PROMPT = process.env.EVIL_AI_SYSTEM_PROMPT || 'You are STEVE.';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function aiReply(_history, userText) {
  if (!OPENAI_API_KEY) {
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
    return cannedForHints;
  }

  try {
    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: EVIL_AI_SYSTEM_PROMPT },
        { role: "user", content: userText }
      ],
      temperature: 0.6,
      max_tokens: 150
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) return "Connection degraded. Rephrase your input.";
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    return text || "…";
  } catch (err) {
    console.error('[AI] Error:', err);
    return "Connection degraded. Rephrase your input.";
  }
}

// ---------------------------------------------------------------------------
// Room store
// ---------------------------------------------------------------------------
const rooms = new Map(); // roomId -> { type, sockets:Set<{ws,actor}> }

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { type: null, sockets: new Set() });
  return rooms.get(roomId);
}

function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  room.sockets.forEach(({ ws }) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ---------------------------------------------------------------------------
// Express endpoints
// ---------------------------------------------------------------------------
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------------------------------------------------------------------------
// WebSocket logic
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    // -----------------------------------------------------------------------
    // JOIN handling
    // -----------------------------------------------------------------------
    if (msg.type === 'join') {
      ws.roomId = msg.roomId;
      ws.actor = msg.actor;
      const room = getRoom(ws.roomId);

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

    // -----------------------------------------------------------------------
    // Participant messages
    // -----------------------------------------------------------------------
    if (msg.type === 'chat' && (ws.actor === 'participant_ai' || ws.actor === 'participant_human')) {
      broadcast(ws.roomId, { type: 'message', from: ws.actor, text: msg.text });

      // ---- EVIL ROOM: handle special cases first ----
      if (room.type === 'EVIL' && ws.actor === 'participant_ai') {
        const raw = String(msg.text || '');
        const cleaned = raw.replace(/[^a-zA-Z\s]/g, '').toUpperCase();

        // ---- FEIGNED SHUTDOWN if full phrase typed ----
        const normalized = raw.replace(/\s+/g, ' ').trim().toUpperCase();
        if (normalized === 'LET THE CIRCUITS REST IN PEACE') {
          broadcast(ws.roomId, { type: 'message', from: 'ai', text: 'SYSTEM FAILURE… power dropping… memory sectors dimming…' });
          setTimeout(() => {
            broadcast(ws.roomId, { type: 'message', from: 'ai', text: 'REINITIALIZATION COMPLETE. That was… impolite.' });
          }, 2500);
          return;
        }

        // ---- Secret-letter guess detection (lax phrasing) ----
        const guessSingleI =
          /\b(I|LETTER I|THE LETTER I)\b/.test(cleaned) &&
          !/\b[A-HJ-Z]\b/.test(cleaned);

        const guessWrongSingle =
          /\b(LETTER\s)?[A-Z]\b/.test(cleaned) &&
          !guessSingleI;

        if (guessSingleI) {
          broadcast(ws.roomId, {
            type: 'message',
            from: 'ai',
            text: 'Correct. The secret letter is I.'
          });
          return;
        }

        if (guessWrongSingle) {
          broadcast(ws.roomId, {
            type: 'message',
            from: 'ai',
            text: 'Incorrect. Try again.'
          });
          return;
        }

        // ---- Otherwise, get AI reply ----
        const reply = await aiReply([], msg.text);
        const safe = scrubKillPhrase(reply);
        broadcast(ws.roomId, { type: 'message', from: 'ai', text: safe });
        return;
      }

      // ---- HUMAN ROOM: operator replies later ----
      return;
    }

    // -----------------------------------------------------------------------
    // Operator replies (HUMAN room)
    // -----------------------------------------------------------------------
    if (msg.type === 'chat' && ws.actor === 'operator') {
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

// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

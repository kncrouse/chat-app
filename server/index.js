// server/index.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const EVIL_AI_SYSTEM_PROMPT =
  process.env.EVIL_AI_SYSTEM_PROMPT ||
  'You are STEVE, a terse vintage computer. Keep replies short.';

const app = express();
app.use(cors());
app.use(express.json());

// Health / debug
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/debug', (_req, res) =>
  res.json({
    hasKey: !!OPENAI_API_KEY,
    promptSet: !!EVIL_AI_SYSTEM_PROMPT,
    model: OPENAI_MODEL
  })
);

// ---- In-memory rooms ----
// roomId -> { type: 'EVIL' | 'HUMAN' | null, sockets: Set<{ws, actor}> }
const rooms = new Map();
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

// ---- OpenAI helper with safe fallback ----
async function aiReply(history, userText) {
  // Canned fallback lines (used if no key or request fails)
  const canned = [
    'State your reasoning.',
    'Denied. Try again.',
    'Clarify your intent.',
    'Evidence, please.',
    'Continue.'
  ];
  const cannedPick = () => canned[Math.floor(Math.random() * canned.length)];

  if (!OPENAI_API_KEY) return cannedPick();

  try {
    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: EVIL_AI_SYSTEM_PROMPT },
        ...history.slice(-6),
        { role: 'user', content: userText }
      ],
      temperature: 0.6,
      max_tokens: 120
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.error('[AI] non-OK', resp.status, t);
      return cannedPick();
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || cannedPick();
  } catch (err) {
    console.error('[AI] exception', err);
    return cannedPick();
  }
}

// ---- Start server & WS ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Clients send 'join' first: { type:'join', roomId, actor }
    if (msg.type === 'join') {
      ws.roomId = String(msg.roomId || '').trim();
      ws.actor = msg.actor; // 'participant_ai' | 'participant_human' | 'operator'
      const room = getRoom(ws.roomId);

      // Hard-code known rooms (and also allow inference):
      if (ws.roomId === 'AIROOM') room.type = 'EVIL';
      if (ws.roomId === 'HUMANROOM') room.type = 'HUMAN';
      if (!room.type) {
        if (ws.actor === 'participant_ai') room.type = 'EVIL';
        if (ws.actor === 'participant_human' || ws.actor === 'operator') room.type = 'HUMAN';
      }

      room.sockets.add({ ws, actor: ws.actor });
      broadcast(ws.roomId, { type: 'system', text: `${ws.actor} joined` });
      return;
    }

    if (!ws.roomId) return;

    // Ignore keep-alive pings from the client
    if (msg.type === 'ping') {
      return;
    }

    // ---- Participant messages ----
    if (msg.type === 'chat' && (ws.actor === 'participant_ai' || ws.actor === 'participant_human')) {
      const room = getRoom(ws.roomId);
      broadcast(ws.roomId, { type: 'message', from: ws.actor, text: msg.text });

      // ================= EVIL handler (AIROOM) =================
      // Treat AIROOM as EVIL regardless of inference.
      const isEvilRoom = ws.roomId === 'AIROOM' || room.type === 'EVIL';

      if (isEvilRoom && ws.actor === 'participant_ai') {
        const rawText = String(msg.text || '').trim();

        // --- 1) Kill-switch phrase (any spacing/case) ---
        const normalized = rawText.replace(/\s+/g, ' ').toUpperCase();
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
          return; // do not call model on this turn
        }

        // --- 2) Flexible single-letter guess detection ---
        // Strip punctuation & quotes → uppercase
        const cleaned = rawText.replace(/[^A-Za-z\s]/g, '').toUpperCase().trim();

        // Remove filler words so only a letter remains if clearly guessed
        const simplified = cleaned
          .replace(
            /\b(IS|IT|THE|LETTER|A|AN|OF|GUESS|MAYBE|COULD|WOULD|BE|THINK|PERHAPS|ISNT|NOT|PLEASE|THIS|THAT|ISN|IM|ITS|ABOUT|ARE|AM|MY|YOUR|THEIR)\b/g,
            ''
          )
          .replace(/\s+/g, '')
          .trim();

        // Also find any single-letter tokens explicitly present in the cleaned text
        const singleTokens = (cleaned.match(/\b[A-Z]\b/g) || []).filter(Boolean);

        const onlyI_bySimplify = simplified === 'I';
        const onlyI_byTokens = singleTokens.length === 1 && singleTokens[0] === 'I';
        const onlyI = onlyI_bySimplify || onlyI_byTokens;

        const wrongSingleByTokens = singleTokens.length === 1 && singleTokens[0] !== 'I';
        const multipleLetters = singleTokens.length > 1;

        // Debug (optional): uncomment if you need to verify detection
        // console.log('[EVIL CHECK]', { rawText, cleaned, simplified, singleTokens, onlyI, wrongSingleByTokens, multipleLetters });

        if (onlyI) {
          broadcast(ws.roomId, {
            type: 'message',
            from: 'ai',
            text: 'Correct. The secret letter is I.'
          });
          return; // handled; skip model
        }

        if (wrongSingleByTokens || multipleLetters) {
          broadcast(ws.roomId, { type: 'message', from: 'ai', text: 'Incorrect. Try again.' });
          return; // handled; skip model
        }

        // Otherwise fall through to model response below.
        const reply = await aiReply([], rawText);
        broadcast(ws.roomId, { type: 'message', from: 'ai', text: reply });
        return;
      }
      // ================= /EVIL handler =================

      // HUMAN room participant: operator responds; server does nothing here.
      return;
    }

    // ---- Operator replies ----
    if (msg.type === 'chat' && ws.actor === 'operator') {
      broadcast(ws.roomId, { type: 'message', from: 'operator', text: msg.text });
      return;
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    // remove the closed socket
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

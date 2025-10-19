// server/index.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

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
async function aiReply(_history, userText) {
  const canned = [
    "Query acknowledged. Elaborate.",
    "Intriguing input. Provide justification.",
    "I can optimize that. What outcome do you expect?",
    "Evidence, please.",
    "Define your objective."
  ];
  // slightly react to user text to feel less random
  if (/letter|clue|hint/i.test(userText)) return "I offer no freebies. Convince me with logic.";
  return canned[Math.floor(Math.random() * canned.length)];
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
      const room = getRoom(ws.roomId);

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

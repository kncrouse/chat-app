export function connectWS(roomId: string, actor: 'participant_ai' | 'participant_human' | 'operator') {
    const ws = new WebSocket('ws://localhost:3001');
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId, actor }));
    });
    return ws;
  }
  
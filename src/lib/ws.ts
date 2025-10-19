import { PUBLIC_WS_URL } from '$env/static/public';

export function connectWS(
  roomId: string,
  actor: 'participant_ai' | 'participant_human' | 'operator'
) {
  // use hosted WS when available, fallback to local dev
  const url =
    PUBLIC_WS_URL ||
    (location.hostname === 'localhost'
      ? 'ws://localhost:3001'
      : '');
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', roomId, actor }));
  });
  return ws;
}

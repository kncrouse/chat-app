<script lang="ts">
    import { connectWS } from '$lib/ws';
  
    let ws: WebSocket | null = null;
    let log: string[] = [];
    let input = '';
    let connected = false;
  
    // You will type the room code on the page when you set up the projector.
    let roomId = '';
  
    function join() {
      if (!roomId.trim()) return;
      ws = connectWS(roomId.trim(), 'participant_ai');
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        log = [...log, `← ${JSON.stringify(msg)}`];
      });
      connected = true;
    }
  
    function send() {
      if (!ws || ws.readyState !== WebSocket.OPEN || !input.trim()) return;
      const msg = { type: 'chat', text: input.trim() };
      ws.send(JSON.stringify(msg));
      log = [...log, `→ ${JSON.stringify(msg)}`];
      input = '';
    }
  </script>
  
  <h2>Evil AI Computer</h2>
  
  {#if !connected}
    <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
      <input placeholder="Room code (e.g., AIROOM)" bind:value={roomId} />
      <button on:click={join}>Join</button>
    </div>
  {:else}
    <div style="border:1px solid #ccc; height:220px; overflow:auto; padding:8px; margin:8px 0;">
      {#each log as line}<div>{line}</div>{/each}
    </div>
    <div style="display:flex; gap:8px;">
      <input bind:value={input} placeholder="Type…" on:keydown={(e)=> e.key==='Enter' && send()} />
      <button on:click={send}>Send</button>
    </div>
  {/if}
  
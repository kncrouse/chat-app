<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  let ws: WebSocket | null = null;
  let log: { from: string; text: string }[] = [];
  let input = '';

  onMount(() => {
    ws = connectWS('AIROOM', 'participant_ai');
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'message') {
        log = [...log, { from: msg.from, text: msg.text }];
      }
    });
  });

  function send() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !input.trim()) return;
    ws.send(JSON.stringify({ type: 'chat', text: input.trim() }));
    log = [...log, { from: 'me', text: input.trim() }];
    input = '';
  }
</script>

<h2>The Evil Computer</h2>

<div class="chat-window">
  {#each log as m}
    <div class="line {m.from === 'me' ? 'right' : 'left'}">
      <span class="speaker">{m.from === 'me' ? 'YOU>' : 'AI>'}</span>
      <span class="text">{m.text}</span>
    </div>
  {/each}
</div>

<div class="row">
  <input bind:value={input} placeholder="Type command…" on:keydown={(e)=> e.key==='Enter' && send()} />
</div>

<style>
.chat-window {
  background: #000;
  color: #0f0;
  font-family: 'Courier New', monospace;
  font-size: 22px;
  height: 60vh;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #222;
}
.line {
  display: flex;
  margin-bottom: 6px;
  white-space: pre-wrap;
}
.line.left { justify-content: flex-start; }
.line.right { justify-content: flex-end; }
.speaker {
  color: #9f9;
  margin-right: 6px;
}
.text {
  color: #0f0;
}
input {
  width: 100%;
  background: #000;
  color: #0f0;
  border: 1px solid #222;
  padding: 10px;
  font-size: 22px;
  font-family: 'Courier New', monospace;
}
</style>

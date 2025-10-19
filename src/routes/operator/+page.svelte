<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'user' | 'me'; text: string };

  let ws: WebSocket | null = null;
  let log: Line[] = [];
  let input = '';

  onMount(() => {
    // Always join the HUMANROOM as the operator
    ws = connectWS('HUMANROOM', 'operator');

    // Only render participant messages (from 'participant_human')
    // Ignore our own 'operator' echoes from the server.
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg?.type === 'message' && msg?.from === 'participant_human') {
        log = [...log, { from: 'user', text: msg.text }];
      }
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;

    // Send to server
    ws.send(JSON.stringify({ type: 'chat', text }));

    // Show our own line locally on the right; we do NOT add the server echo
    log = [...log, { from: 'me', text }];
    input = '';
  }
</script>

<h2>Operator Console</h2>

<div class="chat-window">
  {#each log as m}
    <div class="line {m.from === 'me' ? 'right' : 'left'}">
      <span class="speaker">{m.from === 'me' ? 'YOU>' : 'USER>'}</span>
      <span class="text">{m.text}</span>
    </div>
  {/each}
</div>

<div class="row">
  <input
    bind:value={input}
    placeholder="Type reply…"
    on:keydown={(e) => e.key === 'Enter' && send()}
  />
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
    border-radius: 10px;
    margin-bottom: 14px;
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
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  input {
    width: 100%;
    background: #000;
    color: #0f0;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 10px;
    font-size: 22px;
    font-family: 'Courier New', monospace;
  }
</style>

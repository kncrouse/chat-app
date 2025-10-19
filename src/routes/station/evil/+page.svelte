<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { side: 'left' | 'right'; speaker: string; text: string };

  let ws: WebSocket | null = null;
  let log: Line[] = [];
  let input = '';
  let winEl: HTMLDivElement | null = null;

  function push(line: Line) {
    log = [...log, line];
    // auto-scroll to bottom
    queueMicrotask(() => {
      if (winEl) winEl.scrollTop = winEl.scrollHeight;
    });
  }

  onMount(() => {
    // Always join the AI room as participant_ai
    ws = connectWS('AIROOM', 'participant_ai');

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      // We ONLY render the true AI replies coming from the server
      if (msg?.type === 'message' && msg?.from === 'ai') {
        push({ side: 'left', speaker: 'STEVE>', text: msg.text });
      }
      // Ignore echoes of our own participant messages (from: 'participant_ai')
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;

    // Send to server
    ws.send(JSON.stringify({ type: 'chat', text }));

    // Render our own line on the RIGHT column
    push({ side: 'right', speaker: 'YOU>', text });
    input = '';
  }
</script>

<!-- no header, pure terminal feel -->
<div class="chat-window" bind:this={winEl}>
  {#each log as m}
    <div class="message {m.side}">
      <span class="speaker">{m.speaker}</span>
      <span class="text">{m.text}</span>
    </div>
  {/each}
</div>

<div class="row">
  <input
    bind:value={input}
    placeholder="Type command…"
    on:keydown={(e) => e.key === 'Enter' && send()}
  />
</div>

<style>
  /* Two-column terminal layout: left = responder, right = you */
  .chat-window {
    background: #000;
    color: #0f0;
    font-family: "Courier New", monospace;
    font-size: 22px;
    border: 1px solid #222;
    border-radius: 10px;
    height: 60vh;
    overflow: auto;
    padding: 12px;

    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 24px;
    row-gap: 12px;
  }
  .message {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .message.left  { grid-column: 1; justify-self: start; text-align: left; }
  .message.right { grid-column: 2; justify-self: end;  text-align: right; }

  .speaker { color: #9f9; margin-right: 8px; }
  .text    { color: #0f0; }

  .row { margin-top: 12px; }
  input {
    width: 100%;
    background: #000;
    color: #0f0;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 12px;
    font-size: 22px;
    font-family: "Courier New", monospace;
  }
</style>

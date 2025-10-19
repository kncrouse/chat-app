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
    queueMicrotask(() => {
      if (winEl) winEl.scrollTop = winEl.scrollHeight;
    });
  }

  onMount(() => {
    // Always join the human room as participant_human
    ws = connectWS('HUMANROOM', 'participant_human');

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      // Render ONLY operator replies from the server
      if (msg?.type === 'message' && msg?.from === 'operator') {
        push({ side: 'left', speaker: 'SCOTT>', text: msg.text });
      }
      // Ignore echoes of our own participant messages (from: 'participant_human')
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;

    ws.send(JSON.stringify({ type: 'chat', text }));

    // Local display of the participant line on the RIGHT column
    push({ side: 'right', speaker: 'YOU>', text });
    input = '';
  }
</script>

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

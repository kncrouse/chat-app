<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'me' | 'brain'; text: string };

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
    ws = connectWS('HUMANROOM', 'participant_human');

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      // Only append operator replies; ignore echoes of our own messages
      if (msg?.type === 'message' && msg?.from === 'operator') {
        push({ from: 'brain', text: msg.text });
      }
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;
    ws.send(JSON.stringify({ type: 'chat', text }));
    push({ from: 'me', text });
    input = '';
  }
</script>

<div class="chat-window" bind:this={winEl}>
  {#each log as m}
    <div class="line {m.from === 'me' ? 'right' : 'left'}">
      <span class="speaker">{m.from === 'me' ? 'YOU>' : 'SCOTT>'}</span>
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
    overflow-y: auto;
    padding: 14px;
  }

  .line {
    display: flex;
    width: 100%;
    margin: 10px 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .line.left  { justify-content: flex-start; text-align: left; }
  .line.right { justify-content: flex-end;  text-align: right; }

  .speaker { color: #9f9; margin-right: 8px; }
  .text    { color: #0f0; max-width: 60ch; display: inline-block; }

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

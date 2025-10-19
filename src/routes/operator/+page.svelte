<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'me' | 'brain'; text: string };

  let ws: WebSocket | null = null;
  let log: Line[] = [];
  let input = '';
  let winEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;

  onMount(() => {
    // Focus when the page loads
    if (inputEl) inputEl.focus();

    // Always refocus if anything else steals focus
    const keepFocus = () => {
     if (document.activeElement !== inputEl && inputEl) {
       inputEl.focus();
      }
    };
    window.addEventListener('mousedown', keepFocus);
    window.addEventListener('keydown', keepFocus);
    window.addEventListener('touchstart', keepFocus);

    onDestroy(() => {
      window.removeEventListener('mousedown', keepFocus);
      window.removeEventListener('keydown', keepFocus);
      window.removeEventListener('touchstart', keepFocus);
    });
  });

  function push(line: Line) {
    log = [...log, line];
    queueMicrotask(() => { if (winEl) winEl.scrollTop = winEl.scrollHeight; });
  }

  onMount(() => {
    // Always connect as operator to HUMANROOM
    ws = connectWS('HUMANROOM', 'operator');

    // Show ONLY the participant's messages from server on the left
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg?.type === 'message' && msg?.from === 'participant_human') {
        push({ from: 'user', text: msg.text });
      }
      // Ignore 'operator' echoes to avoid double-rendering our own lines
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;

    // Send to server
    ws.send(JSON.stringify({ type: 'chat', text }));

    // Render our own line on the RIGHT only locally
    push({ from: 'me', text });
    input = '';
  }
</script>

<div class="chat-window" bind:this={winEl}>
  {#each log as m}
    <div class="line {m.from}">
      <span class="speaker">{m.from === 'me' ? 'YOU>' : 'USER>'}</span>
      <span class="text">{m.text}</span>
    </div>
  {/each}
</div>

<div class="row">
  <input
    bind:this={inputEl}
    bind:value={input}
    placeholder="Type command…"
    on:keydown={(e) => e.key === 'Enter' && send()}
    autofocus
  />
</div>

<style>
  .chat-window{
    background:#000;color:#0f0;font-family:"Courier New",monospace;font-size:22px;
    border:1px solid #222;border-radius:10px;height:60vh;overflow-y:auto;padding:14px;
  }

  /* Each message is a single stacked row; no overlap */
  .line{
    display:flex; align-items:flex-start; gap:8px;
    width:100%; margin:12px 0; white-space:pre-wrap; word-break:break-word;
  }

  /* Left: participant (USER) */
  .line.user { justify-content:flex-start; }
  .line.user .text { max-width:min(60ch, 46vw); text-align:left; }

  /* Right: operator (YOU) */
  .line.me { flex-direction:row-reverse; justify-content:flex-start; }
  .line.me .text { max-width:min(60ch, 46vw); text-align:right; }
  .line.me .speaker { margin-left:8px; margin-right:0; }

  .speaker{ color:#9f9; margin-right:8px; }
  .text{ color:#0f0; }

  .row{ margin-top:12px; }
  input{
    width:100%; background:#000; color:#0f0; border:1px solid #222; border-radius:10px;
    padding:12px; font-size:22px; font-family:"Courier New",monospace;
  }

  input:focus {
    outline: none;
    box-shadow: none;
  }
</style>

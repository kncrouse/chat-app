<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'me' | 'ai'; text: string };

  let ws: WebSocket | null = null;
  let log: Line[] = [];
  let input = '';
  let winEl: HTMLDivElement | null = null;

  function push(line: Line) {
    log = [...log, line];
    queueMicrotask(() => { if (winEl) winEl.scrollTop = winEl.scrollHeight; });
  }

  onMount(() => {
    ws = connectWS('AIROOM', 'participant_ai');
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg?.type === 'message' && msg?.from === 'ai') {
        push({ from: 'ai', text: msg.text });
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
    <div class="line {m.from}">
      <span class="speaker">{m.from === 'me' ? 'YOU>' : 'STEVE>'}</span>
      <span class="text">{m.text}</span>
    </div>
  {/each}
</div>

<div class="row">
  <input
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

  /* Each message is a single row; NEVER overlaps */
  .line{
    display:flex; align-items:flex-start; gap:8px;
    width:100%; margin:12px 0; white-space:pre-wrap; word-break:break-word;
  }

  /* Left side (STEVE): normal flow, text constrained to half screen */
  .line.ai .text{ max-width:min(60ch, 46vw); text-align:left; }
  .line.ai { justify-content:flex-start; }

  /* Right side (YOU): reverse row so label sits on right; also clamp width */
  .line.me{ flex-direction:row-reverse; justify-content:flex-start; }
  .line.me .text{ max-width:min(60ch, 46vw); text-align:right; }
  .line.me .speaker{ margin-left:8px; margin-right:0; }

  .speaker{ color:#9f9; margin-right:8px; }
  .text{ color:#0f0; }

  .row{ margin-top:12px; }
  input{
    width:100%; background:#000; color:#0f0; border:1px solid #222; border-radius:10px;
    padding:12px; font-size:22px; font-family:"Courier New",monospace;
  }
</style>

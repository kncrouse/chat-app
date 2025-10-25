<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'me' | 'ai'; text: string };

  let ws: WebSocket | null = null;
  let log: Line[] = [];
  let input = '';
  let winEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;

  let lastUserSentAt = 0;

  // Append a line and scroll (only in browser)
  function push(line: Line) {
    log = [...log, line];
    if (browser) {
      queueMicrotask(() => { if (winEl) winEl.scrollTop = winEl.scrollHeight; });
    }
  }

  onMount(() => {
    if (!browser) return; // <-- CRITICAL: skip everything during SSR

    // Focus when mounted
    inputEl?.focus();

    // Focus lock
    const keepFocus = (ev?: Event) => {
      if (ev instanceof KeyboardEvent && (ev.key === 'Tab' || ev.key === 'Escape')) {
        ev.preventDefault(); ev.stopPropagation();
      }
      if (document.activeElement !== inputEl) inputEl?.focus();
    };
    window.addEventListener('mousedown', keepFocus, true);
    window.addEventListener('mouseup', keepFocus, true);
    window.addEventListener('click', keepFocus, true);
    window.addEventListener('touchstart', keepFocus, true);
    window.addEventListener('keydown', keepFocus, true);

    // Connect to AI room
    ws = connectWS('AIROOM', 'participant_ai');
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg?.type === 'message' && msg?.from === 'ai') {
        const targetDelaySec = 5 + Math.floor(Math.random() * 11); // 5–15s
        const elapsed = Date.now() - lastUserSentAt;
        const remaining = Math.max(0, targetDelaySec * 1000 - elapsed);
        setTimeout(() => push({ from: 'ai', text: msg.text }), remaining);
      }
    });

    // Cleanup on unmount (only runs in browser)
    return () => {
      window.removeEventListener('mousedown', keepFocus, true);
      window.removeEventListener('mouseup', keepFocus, true);
      window.removeEventListener('click', keepFocus, true);
      window.removeEventListener('touchstart', keepFocus, true);
      window.removeEventListener('keydown', keepFocus, true);
    };
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;
    lastUserSentAt = Date.now();
    ws.send(JSON.stringify({ type: 'chat', text }));
    push({ from: 'me', text });
    input = '';
  }
</script>

<div class="chat-window" bind:this={winEl}>
  {#each log as m}
    <div class="line {m.from}">
      <span class="speaker">{m.from === 'me' ? '<YOU' : 'STEVE>'}</span>
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
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
  />
</div>

<style>
  .chat-window{
    background:#000;color:#0f0;font-family:"Courier New",monospace;font-size:22px;
    border:1px solid #222;border-radius:10px;height:60vh;overflow-y:auto;padding:14px;
  }

  .line{
    display:flex; align-items:flex-start; gap:8px;
    width:100%; margin:12px 0; white-space:pre-wrap; word-break:break-word;
  }

  .line.ai   { justify-content:flex-start; }
  .line.ai .text { max-width:min(60ch, 46vw); text-align:left; color:#0f0; }
  .line.ai .speaker { color:#9f9; }

  .line.me { flex-direction:row-reverse; justify-content:flex-start; }
  .line.me .text { max-width:min(60ch, 46vw); text-align:right; color:#ffffff; }
  .line.me .speaker { margin-left:8px; margin-right:0; color:#ddd; }

  .row{ margin-top:12px; }
  input{
    width:100%; background:#000; color:#e8e8e8; border:1px solid #222; border-radius:10px;
    padding:12px; font-size:22px; font-family:"Courier New",monospace; caret-color:#e8e8e8;
  }
  input:focus{ outline:none; box-shadow:none; }
</style>

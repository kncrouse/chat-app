<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { connectWS, type WSConn } from '$lib/ws';

  type Line = { from: 'me' | 'ai'; text: string };

  let conn: WSConn | null = null;
  let status: 'connecting' | 'open' | 'closed' = 'connecting';

  let log: Line[] = [];
  let input = '';
  let winEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let lastUserSentAt = 0;

  function push(line: Line) {
    log = [...log, line];
    if (browser) queueMicrotask(() => { if (winEl) winEl.scrollTop = winEl.scrollHeight; });
  }

  function keepFocus(ev?: Event) {
    if (ev instanceof KeyboardEvent && (ev.key === 'Tab' || ev.key === 'Escape')) {
      ev.preventDefault(); ev.stopPropagation();
    }
    if (document.activeElement !== inputEl) inputEl?.focus();
  }

  onMount(() => {
    if (!browser) return;

    inputEl?.focus();
    window.addEventListener('mousedown', keepFocus, true);
    window.addEventListener('mouseup', keepFocus, true);
    window.addEventListener('click', keepFocus, true);
    window.addEventListener('touchstart', keepFocus, true);
    window.addEventListener('keydown', keepFocus, true);

    // connect + handlers
    conn = connectWS('AIROOM', 'participant_ai');
    conn.onstatus = (s) => { status = s; if (s === 'open') inputEl?.focus(); };
    conn.onmessage = (msg: any) => {
      if (msg?.type === 'message' && msg?.from === 'ai') {
        // show immediately if server tagged no_delay
        if (msg.no_delay) {
          push({ from: 'ai', text: msg.text });
          return;
        }
        // otherwise honor the participant-side display delay
        const targetDelaySec = 5 + Math.floor(Math.random() * 11); // 5–15s
        const elapsed = Date.now() - lastUserSentAt;
        const remaining = Math.max(0, targetDelaySec * 1000 - elapsed);
        setTimeout(() => push({ from: 'ai', text: msg.text }), remaining);
      }
    };

    return () => {
      window.removeEventListener('mousedown', keepFocus, true);
      window.removeEventListener('mouseup', keepFocus, true);
      window.removeEventListener('click', keepFocus, true);
      window.removeEventListener('touchstart', keepFocus, true);
      window.removeEventListener('keydown', keepFocus, true);
      conn?.close();
    };
  });

  function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    lastUserSentAt = Date.now();
    conn.ws.send(JSON.stringify({ type: 'chat', text }));
    push({ from: 'me', text });
    input = '';
    inputEl?.focus();
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

<div class="muted" style="margin:6px 0;">
  {status === 'open' ? 'CONNECTED' : status === 'connecting' ? 'CONNECTING…' : 'DISCONNECTED (retrying…)'}
</div>

<form class="row" on:submit|preventDefault={handleSubmit}>
  <input
    bind:this={inputEl}
    bind:value={input}
    placeholder="Type command…"
    enterkeyhint="send"
    inputmode="text"
    on:keyup={(e) => { if (e.key === 'Enter') handleSubmit(); }}
    autofocus
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
  />
</form>

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
  .line.me .text { max-width:min(60ch, 46vw); text-align:right; color:#e8e8e8; }
  .line.me .speaker { margin-left:8px; margin-right:0; color:#ddd; }
  .muted { opacity:0.6; font-size:0.8em; }
  .row{ margin-top:12px; }
  input{
    width:100%; background:#000; color:#e8e8e8; border:1px solid #222; border-radius:10px;
    padding:12px; font-size:22px; font-family:"Courier New",monospace; caret-color:#e8e8e8;
  }
  input:focus{ outline:none; box-shadow:none; }
</style>

<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { connectWS } from '$lib/ws';

  type Line = { from: 'me' | 'brain'; text: string };

  let ws: WebSocket | null = null;
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
    window.addEventListener('click', keepFocus, true);
    window.addEventListener('keydown', keepFocus, true);

    ws = connectWS('HUMANROOM', 'participant_human');

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data as string);

      if (msg?.type === 'message' && msg?.from === 'operator') {
        const targetDelaySec = 5 + Math.floor(Math.random() * 11);
        const elapsed = Date.now() - lastUserSentAt;
        const remaining = Math.max(0, targetDelaySec * 1000 - elapsed);
        setTimeout(() => push({ from: 'brain', text: msg.text }), remaining);
      }
    });
  });

  function send() {
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;
    lastUserSentAt = Date.now();
    ws.send(JSON.stringify({ type: 'chat', text }));
    push({ from: 'me', text });
    input = '';
    inputEl?.focus();
  }
</script>

<div class="chat-window" bind:this={winEl}>
  {#each log as m}
    <div class="line {m.from}">
      <span class="speaker">{m.from === 'me' ? '<YOU' : 'SCOTT>'}</span>
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
  .line.brain   { justify-content:flex-start; }
  .line.brain .text { max-width:min(60ch, 46vw); text-align:left; color:#0f0; }
  .line.brain .speaker { color:#9f9; }
  .line.me { flex-direction:row-reverse; justify-content:flex-start; }
  .line.me .text { max-width:min(60ch, 46vw); text-align:right; color:#e8e8e8; }
  .line.me .speaker { margin-left:8px; margin-right:0; color:#ddd; }
  .row{ margin-top:12px; }
  input{
    width:100%; background:#000; color:#e8e8e8; border:1px solid #222; border-radius:10px;
    padding:12px; font-size:22px; font-family:"Courier New",monospace; caret-color:#e8e8e8;
  }
  input:focus{ outline:none; box-shadow:none; }
</style>

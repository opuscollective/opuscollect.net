/**
 * The listening party room in the browser.
 *
 * The room (server) only says where the music is; this device plays its own copy of the file and
 * keeps itself in step: it measures the gap between its clock and the room's, works out where the
 * track should be right now, and nudges the playback speed by a few percent to close small drift
 * (or jumps when it is far off, e.g. on joining late).
 */
import { esc } from '@/lib/html';
import { LOBBY_OPENS_MS, clock, clockOffset, correction, positionAt, settle, type PartyState } from '@/lib/party';

interface Track { id: string; title: string; note: string; dur: number; visual: boolean }
interface Msg { id: string; body: string; at: number; host: boolean; a: { handle: string; name: string; photo: string | null; city: string | null } }

// A moment of silence. Playing it inside a tap lets the browser start the music later without another tap.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function initPartyRoom(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const id = root.dataset.id!;
  const isHost = !!root.dataset.host;
  const signedIn = !!root.dataset.signed;
  const startsAt = Number(root.dataset.starts);
  const tracks = JSON.parse(root.dataset.tracks || '[]') as Track[];
  const durations = tracks.map((t) => t.dur);
  let dbStatus = root.dataset.status!;

  const audio = $<HTMLAudioElement>('[data-audio]')!;
  const video = $<HTMLVideoElement>('[data-visual]');
  const statusEl = $('[data-status]');
  const say = (s: string) => { if (statusEl) statusEl.textContent = s; };

  // ---------- time shown in the visitor's own zone, and the countdown ----------
  const whenEl = $('[data-when]');
  if (whenEl) {
    whenEl.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(startsAt);
  }
  const countdownEl = $('[data-countdown]');
  function countdown() {
    if (!countdownEl) return;
    const d = startsAt - Date.now();
    if (state && state.status !== 'lobby') { countdownEl.textContent = ''; return; }
    if (d <= 0) { countdownEl.textContent = dbStatus === 'scheduled' ? 'Starting any minute' : ''; return; }
    const h = Math.floor(d / 3_600_000), m = Math.floor((d % 3_600_000) / 60_000), s = Math.floor((d % 60_000) / 1000);
    countdownEl.textContent = d > 48 * 3_600_000 ? `In ${Math.round(d / 86_400_000)} days` : h ? `In ${h}h ${m}m` : `In ${m}:${String(s).padStart(2, '0')}`;
  }

  // ---------- share and remind ----------
  $('[data-share]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLElement;
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; setTimeout(() => (btn.textContent = 'Share'), 2000); }
    } catch { /* closed the share sheet */ }
  });
  const remind = $<HTMLButtonElement>('[data-remind]');
  remind?.addEventListener('click', async () => {
    const on = remind.getAttribute('aria-pressed') !== 'true';
    remind.disabled = true;
    try {
      const r = await fetch(`/api/parties/${id}/remind`, { method: on ? 'POST' : 'DELETE' });
      if (r.ok) {
        remind.setAttribute('aria-pressed', String(on));
        remind.textContent = on ? 'Reminder set' : 'Remind me';
        say(on ? 'It’s in your Future. Come back when it starts.' : '');
      } else say(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Couldn’t save that.');
    } finally { remind.disabled = false; }
  });

  let state: PartyState | null = null;
  countdown();
  setInterval(countdown, 1000);
  if (!signedIn || dbStatus === 'ended' || dbStatus === 'canceled') return;

  // ---------- the room ----------
  let ws: WebSocket | null = null;
  let retry = 0, closedForGood = false, joined = false, me = { host: isHost, mod: false, blocker: null as string | null };
  let samples: { sent: number; server: number; received: number }[] = [];
  let offset = 0;
  const roomNow = () => Date.now() + offset;
  const send = (o: unknown) => { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); };

  function connect() {
    if (closedForGood) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/parties/socket?id=${encodeURIComponent(id)}`);
    ws.onopen = () => { retry = 0; samples = []; for (let i = 0; i < 5; i++) setTimeout(sync, i * 160); };
    ws.onmessage = (ev) => { if (ev.data !== 'pong') try { handle(JSON.parse(ev.data as string)); } catch (e) { console.error(e); } };
    ws.onclose = (ev) => {
      setChat(false);
      if (ev.code === 4003 || closedForGood) return;
      // Before the room opens the server refuses the socket; try again as the start time gets close.
      const wait = Math.min(30_000, 1500 * 2 ** retry++);
      setTimeout(connect, wait);
    };
  }
  const sync = () => send({ t: 'sync', c: Date.now() });
  setInterval(() => { if (ws?.readyState === 1) { ws.send('ping'); sync(); } }, 25_000);

  function handle(m: { t: string; [k: string]: unknown }) {
    switch (m.t) {
      case 'hello': {
        me = m.me as typeof me;
        offset = (m.now as number) - Date.now();
        log.querySelectorAll('.lp-msg').forEach((n) => n.remove());
        for (const x of m.msgs as Msg[]) addMsg(x);
        setChat(true);
        setCount(m.n as number, m.cities as string[]);
        setState(m.state as PartyState);
        if (isHost && !(m.ready as boolean) && (m.state as PartyState).status === 'lobby') say('Add audio to every track in Set up before you start.');
        break;
      }
      case 'sync': {
        samples.push({ sent: m.c as number, server: m.s as number, received: Date.now() });
        samples = samples.slice(-8);
        offset = clockOffset(samples);
        break;
      }
      case 'state': setState(m.state as PartyState); break;
      case 'count': setCount(m.n as number, m.cities as string[]); break;
      case 'msg': addMsg(m.m as Msg); break;
      case 'remove': for (const mid of m.ids as string[]) log.querySelector(`[data-mid="${CSS.escape(mid)}"]`)?.remove(); break;
      case 'react': float(m.e as string); break;
      case 'reported': say('Thanks. The host and Opus can see your report.'); break;
      case 'error': say(String(m.error)); break;
      case 'kicked': {
        closedForGood = true; joined = false; state = null;
        audio.pause(); audio.removeAttribute('src'); audio.load(); video?.pause();
        root.classList.remove('is-playing');
        nowBox.hidden = true; $('[data-reacts]')?.setAttribute('hidden', '');
        say('The host removed you from this party.'); setChat(false);
        break;
      }
    }
  }

  // ---------- playback ----------
  const listenBtn = $<HTMLButtonElement>('[data-listen]');
  const nowBox = $('[data-now]')!, nowTitle = $('[data-now-title]')!, nowTime = $('[data-now-time]')!, nowNote = $('[data-now-note]')!, bar = $('[data-bar]')!;
  const badge = $('[data-badge]')!;
  let loaded = -1;

  const mediaUrl = (i: number, kind: 'audio' | 'visual') => `/api/parties/${id}/media/${tracks[i]!.id}?kind=${kind}`;

  function unlock() {
    joined = true;
    if (loaded < 0) { audio.src = SILENCE; void audio.play().catch(() => undefined); }
    if (listenBtn) listenBtn.hidden = true;
    render();
    align(true);
  }
  listenBtn?.addEventListener('click', unlock);

  function setState(s: PartyState) {
    const prev = state;
    state = s;
    if (s.status !== 'lobby' && dbStatus === 'scheduled') dbStatus = 'live';
    if (s.status === 'ended') {
      closedForGood = true;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      video?.pause();
      // The page for an ended party (credits, no replay) is rendered by the server.
      if (prev && prev.status !== 'ended') setTimeout(() => location.reload(), 1200);
    }
    render();
    if (people) countEl.textContent = `${people} ${s.status !== 'lobby' ? 'listening' : 'here'}`;
    align(prev?.track !== s.track || prev?.status !== s.status);
  }

  function render() {
    if (!state) return;
    const s = state;
    const live = s.status === 'playing' || s.status === 'paused';
    root.classList.toggle('is-live', live);
    root.classList.toggle('is-playing', s.status === 'playing' && joined);
    badge.textContent = s.status === 'ended' ? 'Ended' : s.status === 'paused' ? 'Paused' : live ? 'Live now' : 'Lobby open';
    $('[data-when-wrap]')?.toggleAttribute('hidden', live);
    $('[data-reacts]')?.toggleAttribute('hidden', s.status === 'ended');
    if (listenBtn) {
      listenBtn.hidden = joined || s.status === 'ended';
      listenBtn.textContent = live ? 'Listen now' : 'Turn sound on for the start';
    }
    const show = (a: string, on: boolean) => root.querySelector<HTMLElement>(`[data-cmd="${a}"]`)?.toggleAttribute('hidden', !on);
    show('start', s.status === 'lobby'); show('pause', s.status === 'playing'); show('resume', s.status === 'paused');
    show('next', live && s.track + 1 < tracks.length); show('end', live);
    $('[data-manage]')?.toggleAttribute('hidden', s.status !== 'lobby');
    $('[data-remind]')?.toggleAttribute('hidden', s.status !== 'lobby');

    nowBox.hidden = !live;
    const tr = tracks[s.track];
    if (live && tr) {
      nowTitle.textContent = tracks.length > 1 ? `${s.track + 1}. ${tr.title}` : tr.title;
      nowNote.hidden = !tr.note;
      nowNote.textContent = tr.note;
    }
    root.querySelectorAll<HTMLElement>('[data-track]').forEach((li) => {
      const i = Number(li.dataset.track);
      li.classList.toggle('is-current', live && i === s.track);
      li.classList.toggle('is-done', live && i < s.track);
    });
    $('[data-credits]')?.toggleAttribute('hidden', !(live && s.track === tracks.length - 1));
  }

  /** Brings this device's playback in line with the room. `hard` = jump straight there. */
  function align(hard = false) {
    if (!state || !joined) return;
    const s = settle(state, durations, roomNow());
    if (s.status !== 'playing' && s.status !== 'paused') return;
    const tr = tracks[s.track];
    if (!tr) return;
    if (loaded !== s.track) {
      loaded = s.track;
      audio.src = mediaUrl(s.track, 'audio');
      audio.load();
      if (video) {
        video.hidden = !tr.visual;
        if (tr.visual) { video.src = mediaUrl(s.track, 'visual'); video.load(); } else { video.removeAttribute('src'); video.load(); }
      }
      hard = true;
    }
    const target = Math.min(positionAt(s, roomNow()), Math.max(0, tr.dur - 50)) / 1000;
    if (s.status === 'paused') {
      if (!audio.paused) audio.pause();
      video?.pause();
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
      return;
    }
    if (audio.readyState < 1) { audio.addEventListener('loadedmetadata', () => align(true), { once: true }); return; }
    const drift = (target - audio.currentTime) * 1000;
    const c = correction(drift);
    if (hard || c.seek || audio.paused) {
      if (hard || c.seek || Math.abs(drift) > 300) audio.currentTime = target;
      audio.playbackRate = 1;
      if (audio.paused) void audio.play().catch(() => { joined = false; render(); say('Tap “Listen now” to hear it.'); });
    } else audio.playbackRate = c.rate;
    if (video && tr.visual && video.readyState >= 1) {
      const vt = video.duration ? audio.currentTime % video.duration : audio.currentTime;
      if (Math.abs(video.currentTime - vt) > 0.4) video.currentTime = vt;
      if (video.paused) void video.play().catch(() => undefined);
    }
  }
  audio.addEventListener('error', () => { if (loaded >= 0 && audio.src !== SILENCE && state?.status === 'playing') say('This device couldn’t play the track. Check your connection and tap Listen again.'); });
  audio.addEventListener('waiting', () => root.classList.add('is-buffering'));
  audio.addEventListener('playing', () => root.classList.remove('is-buffering'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) align(); });

  setInterval(() => {
    if (!state) return;
    const s = settle(state, durations, roomNow());
    if (s.status === 'playing' || s.status === 'paused') {
      const tr = tracks[s.track];
      const pos = Math.min(positionAt(s, roomNow()), tr?.dur ?? 0);
      nowTime.textContent = tr ? `${clock(pos)} / ${clock(tr.dur)}` : '';
      const pct = tr?.dur ? Math.min(100, (pos / tr.dur) * 100) : 0;
      bar.style.width = `${pct}%`;
      bar.parentElement!.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    align();
  }, 500);

  // ---------- host controls ----------
  root.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.cmd!;
    if (a === 'end' && !confirm('End the party for everyone? It can’t be restarted.')) return;
    if (a === 'next' && state && state.track + 2 > tracks.length) return;
    if (a === 'start' && !joined) unlock();
    say('');
    send({ t: 'cmd', a });
  }));

  // ---------- people ----------
  const countEl = $('[data-count]')!, citiesEl = $('[data-cities]')!;
  let people = 0;
  function setCount(n: number, cities: string[]) {
    people = n;
    countEl.textContent = n > 0 ? `${n} ${state && state.status !== 'lobby' ? 'listening' : 'here'}` : '';
    citiesEl.hidden = !cities?.length;
    if (cities?.length) citiesEl.textContent = `In the room from ${cities.slice(0, 6).join(' · ')}${cities.length > 6 ? ` and ${cities.length - 6} more cities` : ''}`;
  }

  // ---------- reactions ----------
  const floats = $('[data-floats]')!;
  const calm = () => document.documentElement.dataset.motion !== 'fluid';
  function float(e: string) {
    if (calm() || floats.childElementCount > 24) return;
    const s = document.createElement('span');
    s.textContent = e;
    s.style.left = `${8 + Math.random() * 84}%`;
    s.style.animationDuration = `${2.2 + Math.random() * 1.4}s`;
    floats.append(s);
    s.addEventListener('animationend', () => s.remove());
  }
  root.querySelectorAll<HTMLButtonElement>('[data-react]').forEach((b) => b.addEventListener('click', () => send({ t: 'react', e: b.dataset.react })));

  // ---------- chat ----------
  const log = $('[data-log]')!, form = $<HTMLFormElement>('[data-chat-form]')!;
  const input = form.querySelector('input')!, sendBtn = form.querySelector('button')!;
  function setChat(on: boolean) {
    const can = on && !me.blocker;
    input.disabled = !can; sendBtn.disabled = !can;
    if (on && me.blocker) input.placeholder = me.blocker === 'verify' ? 'Confirm your email to chat' : 'Publish your profile to chat';
    else input.placeholder = on ? 'Say something' : 'Connecting…';
    if (on) $('[data-log-empty]')?.replaceChildren('Say hello. Everyone in the room sees it.');
  }
  function addMsg(m: Msg) {
    if (log.querySelector(`[data-mid="${CSS.escape(m.id)}"]`)) return;
    $('[data-log-empty]')?.setAttribute('hidden', '');
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const el = document.createElement('div');
    el.className = `lp-msg${m.host ? ' lp-msg--host' : ''}`;
    el.dataset.mid = m.id;
    const name = m.a.handle ? `<a href="/${esc(m.a.handle)}" target="_blank" rel="noopener">${esc(m.a.name)}</a>` : esc(m.a.name);
    const tools = m.host ? '' : (me.host || me.mod)
      ? `<span class="lp-msg__tools"><button type="button" data-act="remove">Remove</button><button type="button" data-act="kick">Remove person</button></span>`
      : `<span class="lp-msg__tools"><button type="button" data-act="report">Report</button></span>`;
    el.innerHTML = `<span class="lp-msg__ph"${m.a.photo ? ` style="background-image:url(${esc(m.a.photo)})"` : ''}></span>
      <p><b>${name}</b>${m.host ? '<i>Host</i>' : m.a.city ? `<small>${esc(m.a.city)}</small>` : ''}<span class="lp-msg__body">${esc(m.body)}</span></p>${tools}`;
    log.append(el);
    while (log.querySelectorAll('.lp-msg').length > 200) log.querySelector('.lp-msg')!.remove();
    if (near) log.scrollTop = log.scrollHeight;
  }
  log.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-act]');
    const row = (e.target as Element).closest<HTMLElement>('.lp-msg');
    if (!row) return;
    if (!b) { row.classList.toggle('is-open'); return; }
    const mid = row.dataset.mid;
    if (b.dataset.act === 'report') { send({ t: 'report', id: mid, reason: 'other' }); b.disabled = true; b.textContent = 'Reported'; }
    if (b.dataset.act === 'remove') send({ t: 'remove', id: mid });
    if (b.dataset.act === 'kick' && confirm('Remove this person from the party? They won’t be able to come back in.')) send({ t: 'kick', id: mid });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    say('');
    send({ t: 'send', body, cid: Math.random().toString(36).slice(2) });
    input.value = '';
  });

  // Join when the room is open; otherwise wait for it instead of knocking over and over.
  const opensIn = startsAt - LOBBY_OPENS_MS - Date.now();
  if (root.dataset.open || isHost || opensIn <= 0) connect();
  else if (opensIn < 2 ** 31 - 1) setTimeout(connect, opensIn + 2000);
}

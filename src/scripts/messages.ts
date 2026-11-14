/**
 * Messages panel: Global Chat and private messages.
 *
 * - Members hold one WebSocket to the Global Chat room for live messages, the cooldown and
 *   private nudges. Without a socket (visitors, or while reconnecting) the panel polls.
 * - The server decides everything that matters (cooldown, rules, who may message whom);
 *   this file only shows it. Nothing here invents a message, a count or someone online.
 * - Open state, tab and conversation survive navigation (sessionStorage); drafts survive
 *   reloads (localStorage).
 */

interface Author { handle: string; name: string; photo: string | null; city: string | null; verified: boolean }
interface GMsg { id: number; body: string; at: number; author: Author; pending?: boolean; cid?: string }
interface DMsg { id: number; body: string; at: number; mine: boolean; pending?: boolean; cid?: string }
interface Conv { id: string; with: Author; preview: string; at: number; fromMe: boolean; unread: boolean }
interface Note { id: string; kind: 'connection_request' | 'connection_accepted'; connectionId: string; at: number; unread: boolean; who: Author; state: string }
interface Me { signedIn: boolean; handle?: string | null; mod?: boolean; blocker?: null | 'verify' | 'profile'; restriction?: { kind: string; until: number | null } | null; blocked?: string[]; live?: boolean }

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const launch = $<HTMLButtonElement>('[data-om-launch]');
const panel = $('[data-om]');
if (launch && panel) init();

function init() {
  const phone = matchMedia('(max-width: 760px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const badge = $('[data-om-badge]'), dot = $('[data-om-dot]'), gdot = $('[data-om-gdot]'), pcount = $('[data-om-pcount]');
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[data-om-tab]')];
  const views = { global: $('[data-om-view="global"]', panel), private: $('[data-om-view="private"]', panel) };
  const g = {
    scroll: $('[data-g-scroll]', panel), list: $('[data-g-list]', panel), state: $('[data-g-state]', panel), top: $('[data-g-top]', panel),
    banner: $('[data-g-banner]', panel), newBtn: $<HTMLButtonElement>('[data-g-new]', panel), foot: $('[data-g-foot]', panel), note: $('[data-g-note]', panel),
    form: $<HTMLFormElement>('[data-g-form]', panel), input: $<HTMLTextAreaElement>('[data-g-input]', panel), send: $<HTMLButtonElement>('[data-g-send]', panel),
    tryBtn: $<HTMLButtonElement>('[data-g-try]', panel), join: $('[data-g-join]', panel), joinLink: $<HTMLAnchorElement>('[data-g-joinlink]', panel), signin: $<HTMLAnchorElement>('[data-g-signin]', panel),
  };
  const p = {
    home: $('[data-p-home]', panel), notes: $('[data-p-notes]', panel), convos: $('[data-p-convos]', panel), convo: $('[data-p-convo]', panel), with: $('[data-p-with]', panel),
    scroll: $('[data-p-scroll]', panel), list: $('[data-p-list]', panel), top: $('[data-p-top]', panel), note: $('[data-p-note]', panel),
    form: $<HTMLFormElement>('[data-p-form]', panel), input: $<HTMLTextAreaElement>('[data-p-input]', panel), send: $<HTMLButtonElement>('[data-p-send]', panel),
  };
  const menu = $('[data-om-menu]', panel);

  // ---------- state ----------
  const signedIn = () => document.cookie.split('; ').includes('opus_in=1');
  let me: Me = { signedIn: signedIn() };
  let blocked = new Set<string>();
  const gMsgs: GMsg[] = [];
  let gLoaded = false, gLoading = false, gMore = true, gUnseen = 0;
  let cooldownUntil = 0, gSending = false;
  let convs: Conv[] = [], notes: Note[] = [];
  let convoId: string | null = null, convoWith: Author | null = null, dMsgs: DMsg[] = [], dMore = false, dCanSend = true, theirReadAt = 0, pSending = false;
  let unread = { dm: 0, notifications: 0 };
  let ws: WebSocket | null = null, wsState: 'off' | 'connecting' | 'live' | 'down' = 'off', wsTries = 0, wsTimer = 0, everLive = false;
  let pollTimer = 0;

  const UI_KEY = 'opus.msg.ui.v1';
  type UI = { open?: boolean; tab?: 'global' | 'private'; convo?: string | null };
  const readUI = (): UI => { try { return JSON.parse(sessionStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
  const writeUI = (u: Partial<UI>) => { try { sessionStorage.setItem(UI_KEY, JSON.stringify({ ...readUI(), ...u })); } catch { /* private mode */ } };
  const draftKey = (k: string) => `opus.msg.draft.${k}`;
  const getDraft = (k: string) => { try { return localStorage.getItem(draftKey(k)) ?? ''; } catch { return ''; } };
  const setDraft = (k: string, v: string) => { try { v ? localStorage.setItem(draftKey(k), v) : localStorage.removeItem(draftKey(k)); } catch { /* ignore */ } };
  let tab: 'global' | 'private' = readUI().tab === 'private' ? 'private' : 'global';

  const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j as { error?: string }).error || 'Something went wrong.'), { status: r.status, data: j });
    return j as T;
  };
  const post = <T,>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
  const cid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ---------- helpers ----------
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const profileHref = (a: Author) => (a.handle ? `/m/${encodeURIComponent(a.handle)}` : '');
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'O';
  function avatar(a: Author) {
    const href = profileHref(a);
    const box = href ? el('a', 'om-m__av') : el('span', 'om-m__av');
    if (href) { (box as HTMLAnchorElement).href = href; box.setAttribute('aria-label', a.name); box.tabIndex = -1; }
    if (a.photo) { const img = el('img'); img.src = a.photo; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; box.append(img); }
    else box.textContent = initials(a.name);
    return box;
  }
  function nameEl(a: Author, cls = 'om-m__name') {
    const href = profileHref(a);
    const n = href ? el('a', cls, a.name) : el('span', cls, a.name);
    if (href) (n as HTMLAnchorElement).href = href;
    return n;
  }
  function seal() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'om-m__seal'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Opus Verified');
    s.innerHTML = '<path fill="var(--c-verified)" d="M14.54 2.53A4.2 4.2 0 0 1 18.93 5.07A4.2 4.2 0 0 1 21.47 9.46A4.2 4.2 0 0 1 21.47 14.54A4.2 4.2 0 0 1 18.93 18.93A4.2 4.2 0 0 1 14.54 21.47A4.2 4.2 0 0 1 9.46 21.47A4.2 4.2 0 0 1 5.07 18.93A4.2 4.2 0 0 1 2.53 14.54A4.2 4.2 0 0 1 2.53 9.46A4.2 4.2 0 0 1 5.07 5.07A4.2 4.2 0 0 1 9.46 2.53A4.2 4.2 0 0 1 14.54 2.53Z"/><path d="M8.4 12.3l2.4 2.4 4.9-5" fill="none" stroke="var(--c-verified-ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
    return s;
  }
  function ago(t: number) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'now';
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    const d = new Date(t);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  }
  const fullTime = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const nearBottom = (s: HTMLElement) => s.scrollHeight - s.scrollTop - s.clientHeight < 60;
  const toBottom = (s: HTMLElement) => { s.scrollTop = s.scrollHeight; };
  function autosize(t: HTMLTextAreaElement) { t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; }

  // ---------- launcher placement beside the Opus chip ----------
  function placeLauncher() {
    const oa = document.querySelector<HTMLElement>('.oa-launch');
    const root = document.documentElement.style;
    root.setProperty('--oa-w', oa ? `${oa.offsetWidth}px` : '0px');
    root.setProperty('--oa-gap', oa ? '8px' : '0px');
  }
  placeLauncher();
  addEventListener('resize', placeLauncher);
  document.fonts?.ready.then(placeLauncher);

  // ---------- badges ----------
  function renderBadges() {
    const n = unread.dm + unread.notifications;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    launch.setAttribute('aria-label', n ? `Messages, ${n} unread` : 'Messages');
    pcount.hidden = n === 0;
    pcount.textContent = badge.textContent;
    const gActive = gUnseen > 0 && !(isOpen() && tab === 'global');
    dot.hidden = !gActive || n > 0;
    gdot.hidden = !(gUnseen > 0 && tab !== 'global');
  }
  async function refreshUnread() {
    if (!signedIn()) return;
    try { const u = await api<{ dm: number; notifications: number }>('/api/messages/unread'); unread = { dm: u.dm, notifications: u.notifications }; renderBadges(); } catch { /* offline */ }
  }

  // ---------- open / close ----------
  const isOpen = () => !panel.hidden;
  let opener: HTMLElement | null = null;
  function open(opts: { anim?: boolean; focus?: boolean } = {}) {
    if (isOpen()) return;
    opener = document.activeElement as HTMLElement | null;
    document.dispatchEvent(new CustomEvent('opus:messages-open'));
    panel.classList.toggle('no-anim', opts.anim === false || reduce);
    panel.hidden = false;
    panel.setAttribute('aria-modal', String(phone.matches));
    launch.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('om-open');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    if (phone.matches) { fitViewport(); history.pushState({ ...(history.state ?? {}), om: 1 }, ''); }
    writeUI({ open: true });
    showTab(tab, { focus: opts.focus !== false });
  }
  function close(opts: { restore?: boolean; fromPop?: boolean } = {}) {
    if (!isOpen()) return;
    panel.classList.remove('is-open');
    launch.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('om-open');
    closeMenu();
    setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, reduce ? 0 : 200);
    writeUI({ open: false });
    if (phone.matches && !opts.fromPop && history.state?.om) history.back();
    if (opts.restore !== false) (opener && document.contains(opener) ? opener : launch).focus();
    renderBadges();
  }
  launch.addEventListener('click', () => open());
  $('[data-om-min]', panel).addEventListener('click', () => close());
  $('[data-om-back]', panel).addEventListener('click', () => {
    if (tab === 'private' && convoId) { closeConvo(); return; }
    close();
  });
  addEventListener('popstate', () => {
    if (!isOpen() || !phone.matches) return;
    if (tab === 'private' && convoId) { closeConvo(); history.pushState({ ...(history.state ?? {}), om: 1 }, ''); return; }
    close({ fromPop: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (!menu.hidden) { closeMenu(); return; }
    close();
  });
  // The Opus guide and Messages share the corner: opening one closes the other.
  document.addEventListener('opus:guide-open', () => close({ restore: false }));
  // Following a link out of the panel (a profile) minimizes it, so the profile's Connect and Message
  // buttons aren't covered. The tab, conversation and draft are remembered for the launcher.
  panel.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href]');
    if (a) writeUI({ open: false });
  });

  // Keep the phone panel the size of the visible screen, so the composer sits above the keyboard.
  function fitViewport() {
    const vv = window.visualViewport;
    if (!vv || !phone.matches) { panel.style.removeProperty('--om-vh'); panel.style.removeProperty('--om-top'); return; }
    panel.style.setProperty('--om-vh', `${vv.height}px`);
    panel.style.setProperty('--om-top', `${vv.offsetTop}px`);
  }
  window.visualViewport?.addEventListener('resize', () => { if (isOpen()) { const s = activeScroll(); const stick = s && nearBottom(s); fitViewport(); if (s && stick) toBottom(s); } });
  window.visualViewport?.addEventListener('scroll', () => isOpen() && fitViewport());
  const activeScroll = () => (tab === 'global' ? g.scroll : convoId ? p.scroll : null);

  // ---------- tabs ----------
  function showTab(t: 'global' | 'private', o: { focus?: boolean } = {}) {
    tab = t;
    writeUI({ tab: t });
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.omTab === t));
    views.global.hidden = t !== 'global';
    views.private.hidden = t !== 'private';
    panel.classList.toggle('in-convo', t === 'private' && !!convoId);
    if (t === 'global') {
      gUnseen = 0;
      if (!gLoaded) loadGlobal(); else if (g.newBtn.hidden) toBottom(g.scroll);
      renderComposer();
      if (o.focus && !phone.matches && !g.form.hidden) g.input.focus();
    } else {
      const remembered = readUI().convo;
      if (convoId) { /* already showing */ }
      else if (remembered && signedIn()) openConvo(remembered, null, { quiet: true });
      else loadPrivateHome();
    }
    renderBadges();
    measureFoot();
  }
  for (const b of tabs) b.addEventListener('click', () => showTab(b.dataset.omTab as 'global' | 'private', { focus: true }));
  function measureFoot() { requestAnimationFrame(() => panel.style.setProperty('--om-foot', `${g.foot.offsetHeight}px`)); }

  // ---------- Global: render ----------
  function gRow(m: GMsg, prev?: GMsg) {
    const row = el('article', 'om-m');
    row.dataset.id = String(m.id);
    if (m.pending) row.classList.add('is-pending');
    if (me.handle && m.author.handle === me.handle) row.classList.add('is-mine');
    const cont = prev && prev.author.handle && prev.author.handle === m.author.handle && m.at - prev.at < 5 * 60_000;
    if (cont) row.classList.add('is-cont');
    row.append(avatar(m.author));
    const head = el('header', 'om-m__head');
    head.append(nameEl(m.author));
    if (m.author.verified) head.append(seal());
    const meta = el('span', 'om-m__meta', [m.author.city, ago(m.at)].filter(Boolean).join(' · '));
    meta.title = fullTime(m.at);
    meta.dataset.at = String(m.at);
    meta.dataset.city = m.author.city ?? '';
    head.append(meta);
    row.append(head);
    const text = el('p', 'om-m__text', m.body);
    row.append(text);
    if (signedIn() && !m.pending) {
      const more = el('button', 'om-m__more', '⋯');
      more.type = 'button';
      more.setAttribute('aria-label', `More for ${m.author.name}’s message`);
      more.setAttribute('aria-haspopup', 'menu');
      more.addEventListener('click', (e) => { e.stopPropagation(); openGlobalMenu(m, more); });
      row.append(more);
    }
    return row;
  }
  const visible = (m: GMsg) => !m.author.handle || !blocked.has(m.author.handle);
  function renderGlobal(keep: 'bottom' | 'anchor' | 'none' = 'bottom') {
    const s = g.scroll;
    const anchor = keep === 'anchor' ? { h: s.scrollHeight, t: s.scrollTop } : null;
    const list = gMsgs.filter(visible);
    const frag = document.createDocumentFragment();
    list.forEach((m, i) => frag.append(gRow(m, list[i - 1])));
    g.list.replaceChildren(frag);
    g.state.replaceChildren();
    if (gLoaded && !list.length) {
      const st = el('div');
      st.append(el('strong', '', 'It’s quiet right now.'), document.createTextNode(signedIn() ? 'Say hello to the world.' : 'Join Opus to start the conversation.'));
      g.state.append(st);
    }
    g.top.hidden = !gLoaded || !list.length;
    if (!signedIn()) { g.top.replaceChildren(document.createTextNode('Showing the latest messages. '), joinLinkEl('Join Opus'), document.createTextNode(' to read further back.')); }
    else g.top.textContent = gMore ? '' : 'This is the start of Global Chat.';
    if (signedIn() && gMore) g.top.hidden = true;
    if (keep === 'bottom') toBottom(s);
    else if (anchor) s.scrollTop = s.scrollHeight - anchor.h + anchor.t;
  }
  function joinLinkEl(text: string) { const a = el('a', '', text); a.href = joinHref(); return a; }
  function joinHref() {
    const here = location.pathname + (location.search ? location.search + '&' : '?') + 'messages=global';
    return `/sign-up?next=${encodeURIComponent(here)}`;
  }
  function skeleton(n = 6) { const f = document.createDocumentFragment(); for (let i = 0; i < n; i++) { const s = el('div', 'om-skel'); s.append(el('i'), el('i')); f.append(s); } return f; }

  function addGlobal(m: GMsg) {
    if (gMsgs.some((x) => x.id === m.id)) return;
    const pend = gMsgs.findIndex((x) => x.pending && x.cid && m.author.handle === me.handle && x.body === m.body);
    if (pend >= 0) gMsgs.splice(pend, 1);
    const stick = nearBottom(g.scroll) || (me.handle && m.author.handle === me.handle);
    gMsgs.push(m);
    gMsgs.sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.id - b.id);
    if (gMsgs.length > 600) gMsgs.splice(0, gMsgs.length - 600);
    if (!gLoaded) return;
    renderGlobal(stick ? 'bottom' : 'none');
    if (!stick && visible(m)) g.newBtn.hidden = false;
    if (visible(m) && (!isOpen() || tab !== 'global') && m.author.handle !== me.handle) { gUnseen++; renderBadges(); }
  }
  g.newBtn.addEventListener('click', () => { g.newBtn.hidden = true; g.scroll.scrollTo({ top: g.scroll.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); });
  g.scroll.addEventListener('scroll', () => {
    if (nearBottom(g.scroll)) g.newBtn.hidden = true;
    if (g.scroll.scrollTop < 80 && signedIn() && gMore && gLoaded && !gLoading) loadOlder();
  });

  // ---------- Global: data ----------
  async function loadGlobal() {
    gLoading = true;
    if (!gMsgs.length) { g.list.replaceChildren(skeleton()); g.state.replaceChildren(); }
    try {
      const r = await api<{ messages: GMsg[]; more: boolean }>('/api/chat/history');
      for (const m of r.messages) if (!gMsgs.some((x) => x.id === m.id)) gMsgs.push(m);
      gMsgs.sort((a, b) => a.id - b.id);
      gMore = signedIn() ? r.more : false;
      gLoaded = true;
      renderGlobal('bottom');
    } catch {
      g.list.replaceChildren();
      const st = el('div');
      const retry = el('button', 'om__btn om__btn--small', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadGlobal);
      st.append(el('strong', '', 'Couldn’t load Global Chat.'), document.createTextNode('Check your connection.'), el('br'), retry);
      g.state.replaceChildren(st);
    } finally { gLoading = false; }
  }
  async function loadOlder() {
    const oldest = gMsgs.find((m) => !m.pending);
    if (!oldest) return;
    gLoading = true;
    try {
      const r = await api<{ messages: GMsg[]; more: boolean }>(`/api/chat/history?before=${oldest.id}`);
      gMsgs.unshift(...r.messages.filter((m) => !gMsgs.some((x) => x.id === m.id)));
      gMore = r.more;
      renderGlobal('anchor');
    } catch { /* try again on the next scroll */ } finally { gLoading = false; }
  }

  // ---------- Global: composer ----------
  function renderComposer() {
    const visitor = !signedIn();
    g.form.hidden = visitor || !!me.blocker || me.restriction?.kind === 'ban';
    g.tryBtn.hidden = !visitor || !g.join.hidden;
    if (visitor) { g.joinLink.href = joinHref(); g.signin.href = `/sign-in?next=${encodeURIComponent(location.pathname + (location.search ? location.search + '&' : '?') + 'messages=global')}`; }
    if (!visitor && me.blocker === 'verify') g.note.textContent = 'Confirm your email to join the conversation.';
    else if (!visitor && me.blocker === 'profile') { g.note.replaceChildren(document.createTextNode('Publish your profile to join the conversation. '), Object.assign(el('a', '', 'Finish profile'), { href: '/account/profile' })); }
    else if (me.restriction?.kind === 'ban') g.note.textContent = 'You can’t post in Global Chat.';
    else if (!g.note.dataset.sticky) g.note.textContent = '';
    tickCooldown();
    measureFoot();
  }
  g.tryBtn.addEventListener('click', () => { g.tryBtn.hidden = true; g.join.hidden = false; measureFoot(); g.joinLink.focus(); });
  g.input.value = getDraft('global');
  autosize(g.input);
  g.input.addEventListener('input', () => { setDraft('global', g.input.value); autosize(g.input); if (g.note.dataset.sticky) { g.note.textContent = ''; delete g.note.dataset.sticky; } measureFoot(); });
  g.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); g.form.requestSubmit(); }
  });
  g.form.addEventListener('submit', (e) => { e.preventDefault(); sendGlobal(); });

  let cdTimer = 0;
  function tickCooldown() {
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (left > 0) {
      g.send.textContent = left >= 60 ? `Wait ${Math.ceil(left / 60)}m` : `Wait ${left}s`;
      g.send.classList.add('is-wait');
      g.send.setAttribute('aria-disabled', 'true');
      clearTimeout(cdTimer);
      cdTimer = window.setTimeout(tickCooldown, 250);
    } else {
      g.send.textContent = gSending ? 'Sending' : 'Send';
      g.send.classList.toggle('is-wait', gSending);
      g.send.removeAttribute('aria-disabled');
    }
  }
  function startCooldown(seconds: number) { cooldownUntil = Date.now() + seconds * 1000; tickCooldown(); }
  function showGlobalError(msg: string) { g.note.textContent = msg; g.note.dataset.sticky = '1'; measureFoot(); }

  const pendingG = new Map<string, { body: string; timer: number }>();
  async function sendGlobal() {
    const body = g.input.value.trim();
    if (!body || gSending || Date.now() < cooldownUntil) return;
    gSending = true;
    tickCooldown();
    const id = cid();
    const finish = (ok: boolean, err?: string, retryAfter?: number) => {
      const pend = pendingG.get(id);
      if (!pend) return;
      clearTimeout(pend.timer);
      pendingG.delete(id);
      gSending = false;
      if (ok) {
        // Clear only if nothing new was typed meanwhile.
        if (g.input.value.trim() === body) { g.input.value = ''; setDraft('global', ''); autosize(g.input); }
        startCooldown(5);
      } else {
        if (err) showGlobalError(err === `Wait ${retryAfter}s` ? '' : err);
        if (retryAfter) startCooldown(retryAfter); else tickCooldown();
      }
    };
    pendingG.set(id, { body, timer: window.setTimeout(() => finish(false, 'Couldn’t send. Check your connection and try again.'), 10_000) });
    sendHooks.set(id, finish);
    if (ws && wsState === 'live') ws.send(JSON.stringify({ t: 'send', body, cid: id }));
    else {
      try { await post('/api/chat/messages', { body, cid: id }); finish(true); loadGlobalSince(); }
      catch (e) { const d = (e as { data?: { retryAfter?: number } }).data; finish(false, (e as Error).message, d?.retryAfter); }
    }
  }
  const sendHooks = new Map<string, (ok: boolean, err?: string, retryAfter?: number) => void>();

  async function loadGlobalSince() {
    try {
      const r = await api<{ messages: GMsg[] }>('/api/chat/history');
      for (const m of r.messages) addGlobal(m);
      if (!gLoaded) { gLoaded = true; renderGlobal('bottom'); }
    } catch { /* offline */ }
  }

  // ---------- menus: report, block, moderate ----------
  function closeMenu() { menu.hidden = true; menu.replaceChildren(); panel.querySelector('[aria-expanded="true"].om-m__more, [aria-expanded="true"][data-menu-btn]')?.setAttribute('aria-expanded', 'false'); }
  function placeMenu(btn: HTMLElement) {
    const pr = panel.getBoundingClientRect(), br = btn.getBoundingClientRect();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const h = menu.offsetHeight, w = menu.offsetWidth;
    let top = br.bottom - pr.top + 4;
    if (top + h > pr.height - 8) top = Math.max(8, br.top - pr.top - h - 4);
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.max(8, Math.min(pr.width - w - 8, br.right - pr.left - w))}px`;
    menu.querySelector<HTMLElement>('button')?.focus();
  }
  function item(label: string, fn: () => void, danger = false) {
    const b = el('button', danger ? 'is-danger' : '', label);
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target as Node)) closeMenu(); });

  function openGlobalMenu(m: GMsg, btn: HTMLElement) {
    closeMenu();
    const mine = me.handle && m.author.handle === me.handle;
    const items: HTMLElement[] = [];
    if (m.author.handle) items.push(item(`View ${m.author.name}`, () => { location.href = profileHref(m.author); }));
    if (!mine) {
      items.push(item('Report message', () => reportMenu(m, btn)));
      if (m.author.handle) items.push(item(`Block ${m.author.name}`, () => blockMember(m.author)));
    }
    if (me.mod) {
      items.push(el('hr'));
      items.push(item('Moderation queue', () => { location.href = '/account/moderation'; }));
      items.push(item('Remove message', () => modAction('remove', m), true));
      if (!mine) {
        items.push(item('Time out 10 minutes', () => modAction('timeout', m, 10), true));
        items.push(item('Time out 1 hour', () => modAction('timeout', m, 60), true));
        items.push(item('Time out 24 hours', () => modAction('timeout', m, 1440), true));
        items.push(item('Ban from Global Chat…', () => {
          menu.replaceChildren(el('p', '', `Ban ${m.author.name} from Global Chat and remove their messages from the last day?`), item('Ban', () => modAction('ban', m), true), item('Cancel', closeMenu));
          placeMenu(btn);
        }, true));
      }
    }
    menu.replaceChildren(...items);
    placeMenu(btn);
  }
  function reportMenu(m: GMsg, btn: HTMLElement) {
    const reasons: [string, string][] = [['spam', 'Spam'], ['promo', 'Promotion'], ['harassment', 'Harassment'], ['hate', 'Hate'], ['other', 'Something else']];
    menu.replaceChildren(el('p', '', 'Why are you reporting this?'), ...reasons.map(([k, l]) => item(l, async () => {
      closeMenu();
      try { await post('/api/chat/report', { messageId: m.id, reason: k }); flash('Thanks. A moderator will take a look.'); }
      catch (e) { flash((e as Error).message); }
    })));
    placeMenu(btn);
  }
  async function blockMember(a: Author) {
    closeMenu();
    try {
      await post('/api/connections/block', { handle: a.handle, on: true });
      blocked.add(a.handle);
      renderGlobal('none');
      flash(`Blocked. You won’t see ${a.name} in Global or Private.`);
      if (convoWith?.handle === a.handle) closeConvo();
    } catch (e) { flash((e as Error).message); }
  }
  async function modAction(action: string, m: GMsg, minutes?: number) {
    closeMenu();
    try {
      await post('/api/chat/moderate', { action, messageId: m.id, minutes });
      flash(action === 'remove' ? 'Message removed.' : action === 'ban' ? `${m.author.name} is banned from Global Chat.` : `${m.author.name} is timed out.`);
    } catch (e) { flash((e as Error).message); }
  }
  let flashTimer = 0;
  function flash(text: string) {
    const target = tab === 'global' ? g.note : p.note;
    target.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => { if (target.textContent === text) target.textContent = ''; measureFoot(); }, 4000);
    measureFoot();
  }

  // ---------- Private: home (requests + conversations) ----------
  async function loadPrivateHome() {
    p.home.hidden = false; p.convo.hidden = true;
    panel.classList.remove('in-convo');
    if (!signedIn()) {
      const st = el('div', 'om__state');
      st.append(el('strong', '', 'Private messages'), document.createTextNode('Join Opus to message the people you connect with.'), el('br'));
      const a = el('a', 'om__btn om__btn--solid', 'Join'); a.href = joinHref(); a.style.marginTop = '12px';
      st.append(a);
      p.notes.replaceChildren(); p.convos.replaceChildren(st);
      return;
    }
    if (!convs.length && !notes.length) p.convos.replaceChildren(skeleton(4));
    try {
      const [c, n] = await Promise.all([api<{ conversations: Conv[]; unread: typeof unread }>('/api/messages'), api<{ items: Note[] }>('/api/notifications')]);
      convs = c.conversations; notes = n.items; unread = c.unread;
      renderPrivateHome();
      renderBadges();
      if (notes.some((x) => x.unread)) {
        await post('/api/notifications', { action: 'read' }).catch(() => null);
        unread.notifications = 0; renderBadges();
      }
    } catch {
      const st = el('div', 'om__state');
      const retry = el('button', 'om__btn om__btn--small', 'Try again'); retry.type = 'button'; retry.addEventListener('click', loadPrivateHome);
      st.append(el('strong', '', 'Couldn’t load your messages.'), document.createTextNode('Check your connection.'), el('br'), retry);
      p.convos.replaceChildren(st);
    }
  }
  function renderPrivateHome() {
    const nf = document.createDocumentFragment();
    // Pending requests, and acceptances you haven't followed up yet (no conversation, last 14 days).
    const talking = new Set(convs.map((c) => c.with.handle));
    const live = notes.filter((x) => x.who.handle && (x.kind === 'connection_request'
      ? x.state === 'pending'
      : x.state === 'accepted' && !talking.has(x.who.handle) && Date.now() - x.at < 14 * 86_400_000)).slice(0, 8);
    if (live.length) {
      nf.append(el('h3', 'om__section', 'Connections'));
      for (const x of live) {
        const row = el('div', 'om-row');
        row.append(avatar(x.who));
        const main = el('div', 'om-row__main');
        const nm = nameEl(x.who, 'om-row__name'); main.append(nm);
        main.append(el('span', 'om-row__sub', x.kind === 'connection_request' ? 'Wants to connect' : 'Accepted your request'));
        row.append(main);
        const acts = el('div', 'om-row__acts');
        if (x.kind === 'connection_request') {
          const ok = el('button', 'om__btn om__btn--solid om__btn--small', 'Accept'); ok.type = 'button';
          const no = el('button', 'om__btn om__btn--small', 'Decline'); no.type = 'button';
          ok.addEventListener('click', () => answer(x, 'accept', acts));
          no.addEventListener('click', () => answer(x, 'decline', acts));
          acts.append(ok, no);
        } else {
          const m = el('button', 'om__btn om__btn--small', 'Message'); m.type = 'button';
          m.addEventListener('click', () => messageHandle(x.who.handle));
          acts.append(m);
        }
        row.append(acts);
        nf.append(row);
      }
    }
    p.notes.replaceChildren(nf);
    const cf = document.createDocumentFragment();
    if (convs.length) {
      cf.append(el('h3', 'om__section', 'Messages'));
      for (const c of convs) {
        const row = el('button', `om-row${c.unread ? ' is-unread' : ''}`);
        row.type = 'button';
        row.append(avatar(c.with));
        const main = el('span', 'om-row__main');
        main.append(el('span', 'om-row__name', c.with.name), el('span', 'om-row__sub', (c.fromMe ? 'You: ' : '') + c.preview));
        const side = el('span', 'om-row__side', ago(c.at));
        if (c.unread) { const u = el('span', 'om-row__unread'); u.setAttribute('aria-label', 'Unread'); side.append(u); }
        row.append(main, side);
        row.querySelector('a')?.removeAttribute('href');
        row.addEventListener('click', () => openConvo(c.id, c.with));
        cf.append(row);
      }
    } else {
      const st = el('div', 'om__state');
      st.append(el('strong', '', 'No conversations yet.'), document.createTextNode('Connect with people from Global Chat or World, then message them here.'));
      cf.append(st);
    }
    p.convos.replaceChildren(cf);
  }
  async function answer(x: Note, action: 'accept' | 'decline', acts: HTMLElement) {
    acts.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await post(`/api/connections/${encodeURIComponent(x.connectionId)}`, { action });
      x.state = action === 'accept' ? 'accepted' : 'declined';
      acts.replaceChildren(el('span', 'om-row__sub', action === 'accept' ? 'Connected' : 'Declined'));
      if (action === 'accept') {
        const m = el('button', 'om__btn om__btn--small', 'Message'); m.type = 'button';
        m.addEventListener('click', () => messageHandle(x.who.handle));
        acts.append(m);
      }
    } catch (e) { flash((e as Error).message); acts.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
  }

  // ---------- Private: one conversation ----------
  async function messageHandle(handle: string) {
    if (!signedIn()) { location.href = `/sign-in?next=${encodeURIComponent(location.pathname)}`; return; }
    try {
      const r = await post<{ id: string }>('/api/messages', { to: handle });
      if (!isOpen()) open({ focus: false });
      if (tab !== 'private') { tab = 'private'; for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.omTab === 'private')); views.global.hidden = true; views.private.hidden = false; writeUI({ tab: 'private' }); }
      openConvo(r.id, null);
    } catch (e) {
      if (!isOpen()) open({ focus: false });
      showTab('private');
      flash((e as Error).message);
    }
  }
  async function openConvo(id: string, who: Author | null, o: { quiet?: boolean } = {}) {
    convoId = id; convoWith = who;
    writeUI({ convo: id });
    p.home.hidden = true; p.convo.hidden = false;
    panel.classList.add('in-convo');
    p.note.textContent = '';
    if (who) renderWith(who);
    p.list.replaceChildren(); p.list.append(skeleton(3));
    p.input.value = getDraft(`c:${id}`);
    autosize(p.input);
    try {
      const r = await api<{ with: Author; canSend: boolean; theirReadAt: number; messages: DMsg[]; more: boolean }>(`/api/messages/${encodeURIComponent(id)}`);
      if (convoId !== id) return;
      convoWith = r.with; dCanSend = r.canSend; theirReadAt = r.theirReadAt; dMsgs = r.messages; dMore = r.more;
      renderWith(r.with);
      renderConvo('bottom');
      const c = convs.find((x) => x.id === id);
      if (c?.unread) { c.unread = false; }
      refreshUnread();
      if (!phone.matches && !o.quiet) p.input.focus();
    } catch (e) {
      if ((e as { status?: number }).status === 404) { writeUI({ convo: null }); closeConvo(); return; }
      p.list.replaceChildren(el('div', 'om__state', 'Couldn’t load this conversation.'));
    }
  }
  function renderWith(a: Author) {
    const box = document.createDocumentFragment();
    box.append(avatar(a), nameEl(a, 'om__with-name'));
    const more = el('button', 'om__icon', '⋯'); more.type = 'button'; more.dataset.menuBtn = '';
    more.setAttribute('aria-label', `More for ${a.name}`); more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', (e) => {
      e.stopPropagation(); closeMenu();
      const last = [...dMsgs].reverse().find((m) => !m.mine && !m.pending);
      const items = [] as HTMLElement[];
      if (a.handle) items.push(item(`View ${a.name}`, () => { location.href = profileHref(a); }));
      if (last) items.push(item('Report last message', () => {
        const reasons: [string, string][] = [['spam', 'Spam'], ['promo', 'Promotion'], ['harassment', 'Harassment'], ['hate', 'Hate'], ['other', 'Something else']];
        menu.replaceChildren(el('p', '', 'Why are you reporting this?'), ...reasons.map(([k, l]) => item(l, async () => {
          closeMenu();
          try { await post('/api/messages/report', { messageId: last.id, reason: k }); flash('Thanks. We’ll take a look.'); } catch (er) { flash((er as Error).message); }
        })));
        placeMenu(more);
      }));
      if (a.handle) items.push(item(`Block ${a.name}`, () => blockMember(a), true));
      menu.replaceChildren(...items);
      placeMenu(more);
    });
    box.append(more);
    p.with.replaceChildren(box);
  }
  function renderConvo(keep: 'bottom' | 'anchor' | 'none' = 'bottom') {
    const s = p.scroll;
    const anchor = keep === 'anchor' ? { h: s.scrollHeight, t: s.scrollTop } : null;
    const f = document.createDocumentFragment();
    let lastDay = '';
    dMsgs.forEach((m, i) => {
      const prev = dMsgs[i - 1];
      const day = new Date(m.at).toDateString();
      if (day !== lastDay || (prev && m.at - prev.at > 60 * 60_000)) {
        const t = el('span', 'om-d__time', new Date(m.at).toLocaleString(undefined, day === new Date().toDateString() ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }));
        f.append(t); lastDay = day;
      }
      const b = el('p', `om-d${m.mine ? ' is-mine' : ''}${m.pending ? ' is-pending' : ''}`, m.body);
      b.title = fullTime(m.at);
      f.append(b);
    });
    const lastMine = [...dMsgs].reverse().find((m) => !m.pending);
    if (lastMine?.mine && theirReadAt >= lastMine.at) f.append(el('span', 'om-d__seen', 'Seen'));
    if (!dMsgs.length) f.append(el('div', 'om__state', `Say hello to ${convoWith?.name ?? 'your connection'}.`));
    p.list.replaceChildren(f);
    p.top.hidden = !dMore;
    p.top.textContent = 'Scroll up for earlier messages';
    p.form.hidden = !dCanSend;
    if (!dCanSend) p.note.textContent = `You can message ${convoWith?.name ?? 'this member'} again once you’re connected.`;
    if (keep === 'bottom') toBottom(s);
    else if (anchor) s.scrollTop = s.scrollHeight - anchor.h + anchor.t;
  }
  p.scroll.addEventListener('scroll', async () => {
    if (p.scroll.scrollTop > 60 || !dMore || !convoId || !dMsgs.length) return;
    dMore = false;
    try {
      const r = await api<{ messages: DMsg[]; more: boolean }>(`/api/messages/${encodeURIComponent(convoId)}?before=${dMsgs[0].id}`);
      dMsgs.unshift(...r.messages); dMore = r.more; renderConvo('anchor');
    } catch { dMore = true; }
  });
  function closeConvo() {
    convoId = null; convoWith = null; dMsgs = [];
    writeUI({ convo: null });
    loadPrivateHome();
  }
  p.input.addEventListener('input', () => { if (convoId) setDraft(`c:${convoId}`, p.input.value); autosize(p.input); });
  p.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); p.form.requestSubmit(); } });
  p.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = p.input.value.trim();
    if (!body || !convoId || pSending) return;
    pSending = true; p.send.disabled = true;
    const id = cid(), conv = convoId;
    const temp: DMsg = { id: Number.MAX_SAFE_INTEGER, body, at: Date.now(), mine: true, pending: true, cid: id };
    dMsgs.push(temp); renderConvo('bottom');
    p.input.value = ''; autosize(p.input);
    try {
      const r = await post<{ message: DMsg }>(`/api/messages/${encodeURIComponent(conv)}`, { body, cid: id });
      setDraft(`c:${conv}`, '');
      if (convoId === conv) { dMsgs = dMsgs.filter((m) => m !== temp); if (!dMsgs.some((m) => m.id === r.message.id)) dMsgs.push(r.message); renderConvo('bottom'); }
    } catch (er) {
      dMsgs = dMsgs.filter((m) => m !== temp);
      if (convoId === conv) { renderConvo('bottom'); if (!p.input.value) { p.input.value = body; autosize(p.input); } flash((er as Error).message); }
    } finally { pSending = false; p.send.disabled = false; if (!phone.matches) p.input.focus(); }
  });
  async function refreshConvo() {
    if (!convoId) return;
    try {
      const r = await api<{ messages: DMsg[]; theirReadAt: number; canSend: boolean }>(`/api/messages/${encodeURIComponent(convoId)}`);
      const stick = nearBottom(p.scroll);
      const pending = dMsgs.filter((m) => m.pending);
      const known = new Set(dMsgs.map((m) => m.id));
      dMsgs = [...dMsgs.filter((m) => !m.pending), ...r.messages.filter((m) => !known.has(m.id))].sort((a, b) => a.id - b.id).concat(pending);
      theirReadAt = r.theirReadAt; dCanSend = r.canSend;
      renderConvo(stick ? 'bottom' : 'none');
      refreshUnread();
    } catch { /* offline */ }
  }

  // Anything on the page can start a private conversation: <button data-message-handle="kira">.
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-message-handle]');
    if (t) { e.preventDefault(); messageHandle(t.dataset.messageHandle!); }
    const o = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-open-messages]');
    if (o) { e.preventDefault(); tab = (o.dataset.openMessages === 'private' ? 'private' : 'global'); open(); }
  });

  // ---------- socket ----------
  function connect() {
    if (!signedIn() || wsState === 'connecting' || wsState === 'live' || me.live === false) return;
    wsState = 'connecting';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let sock: WebSocket;
    try { sock = new WebSocket(`${proto}//${location.host}/api/chat/socket`); } catch { wsState = 'down'; scheduleReconnect(); return; }
    ws = sock;
    let ping = 0;
    sock.addEventListener('open', () => {
      wsState = 'live'; wsTries = 0;
      if (everLive) loadGlobalSince(); // fill anything missed while away
      everLive = true;
      g.banner.hidden = true;
      ping = window.setInterval(() => { try { sock.send('ping'); } catch { /* closing */ } }, 30_000);
      stopPolling();
    });
    sock.addEventListener('message', (e) => {
      if (e.data === 'pong') return;
      let m: { t: string; [k: string]: unknown };
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'hello') {
        const h = m.me as Me;
        me = { ...me, handle: h.handle, mod: h.mod, blocker: h.blocker, restriction: h.restriction };
        if (typeof m.cooldown === 'number' && m.cooldown > 0) startCooldown(m.cooldown);
        renderComposer();
      } else if (m.t === 'msg') addGlobal(m.m as GMsg);
      else if (m.t === 'remove') {
        const ids = new Set(m.ids as number[]);
        const before = gMsgs.length;
        for (let i = gMsgs.length - 1; i >= 0; i--) if (ids.has(gMsgs[i].id)) gMsgs.splice(i, 1);
        if (gMsgs.length !== before && gLoaded) renderGlobal(nearBottom(g.scroll) ? 'bottom' : 'none');
      } else if (m.t === 'ack' || m.t === 'error') {
        const hook = sendHooks.get(m.cid as string);
        if (hook) { sendHooks.delete(m.cid as string); hook(m.t === 'ack', m.error as string | undefined, m.retryAfter as number | undefined); }
        if (m.t === 'error' && (m.code === 'timeout' || m.code === 'banned')) refreshMe();
      } else if (m.t === 'nudge') {
        if (m.kind === 'dm') { if (convoId && m.conversation === convoId && isOpen() && tab === 'private') refreshConvo(); else refreshUnread(); if (tab === 'private' && !convoId && isOpen()) loadPrivateHome(); }
        else { refreshUnread(); if (tab === 'private' && !convoId && isOpen()) loadPrivateHome(); }
      }
    });
    sock.addEventListener('close', (e) => {
      clearInterval(ping);
      if (ws === sock) ws = null;
      wsState = 'down';
      for (const [k, hook] of sendHooks) { hook(false, 'Couldn’t send. Check your connection and try again.'); sendHooks.delete(k); }
      if (everLive) { g.banner.textContent = 'Reconnecting…'; g.banner.hidden = false; }
      startPolling();
      if (e.code !== 4000) scheduleReconnect();
    });
  }
  function scheduleReconnect() {
    clearTimeout(wsTimer);
    const delay = Math.min(30_000, 1000 * 2 ** wsTries++) * (0.7 + Math.random() * 0.6);
    wsTimer = window.setTimeout(() => { if (document.visibilityState === 'visible') connect(); }, delay);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (signedIn() && wsState !== 'live' && wsState !== 'connecting') { wsTries = 0; connect(); }
    refreshUnread();
    if (!signedIn() && isOpen() && tab === 'global') loadGlobalSince();
  });

  // Fallback while there's no socket: visitors and members who are reconnecting.
  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (isOpen() && tab === 'global' && gLoaded) loadGlobalSince();
      if (signedIn()) { refreshUnread(); if (convoId && isOpen() && tab === 'private') refreshConvo(); }
    }, signedIn() ? 20_000 : 30_000);
  }
  function stopPolling() { clearInterval(pollTimer); pollTimer = 0; }

  async function refreshMe() {
    if (!signedIn()) { me = { signedIn: false }; renderComposer(); return; }
    try {
      const r = await api<Me>('/api/chat/me');
      me = { ...me, ...r };
      blocked = new Set(r.blocked ?? []);
      if (gLoaded) renderGlobal(nearBottom(g.scroll) ? 'bottom' : 'none');
      renderComposer();
    } catch { /* keep going */ }
  }

  // Relative times stay fresh.
  setInterval(() => {
    if (!isOpen()) return;
    panel.querySelectorAll<HTMLElement>('.om-m__meta[data-at]').forEach((m) => { m.textContent = [m.dataset.city, ago(Number(m.dataset.at))].filter(Boolean).join(' · '); });
  }, 60_000);

  // ---------- start ----------
  const params = new URLSearchParams(location.search);
  const ask = params.get('messages');
  if (ask) {
    params.delete('messages');
    history.replaceState(history.state, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    tab = ask === 'private' ? 'private' : 'global';
  }
  const ui = readUI();
  if (signedIn()) {
    refreshMe().then(() => { const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 600)); idle(connect); });
    refreshUnread();
  } else startPolling();
  renderComposer();
  // Reopen where the member left off (desktop), or when sent here after joining. Never on a first visit.
  if (ask || (ui.open && !phone.matches)) open({ anim: false, focus: !!ask });
}

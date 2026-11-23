/**
 * Group tab of the Messages panel: one private room per group, for its members.
 *
 * Talks to /api/group-chat. The panel (messages.ts) owns the tabs, the socket and the badge; it tells
 * this file when the tab is shown (opus:group-show), when a room changed (opus:group-nudge), when to
 * open a particular room (opus:group-open) and when Back is pressed (opus:group-back).
 * Nothing here invents a message or a count.
 */
interface Author { handle: string; name: string; photo: string | null; city: string | null; verified: boolean }
interface Card { title: string; detail: string; when: string; at: number; href: string | null }
interface Msg { id: number; kind: 'text' | 'session'; body: string; session: Card | null; at: number; mine: boolean; author: Author; going: number; myRsvp: 'going' | 'no' | null; pending?: boolean; cid?: string }
interface Room { id: string; handle: string; name: string; photo: string | null; typeLabel: string; preview: string; at: number | null; unread: boolean; members: number }
interface Shareable { id: string; title: string; detail: string; when: string; kind: string }

const panel = document.querySelector<HTMLElement>('[data-om]');
const home = panel?.querySelector<HTMLElement>('[data-q-home]');
if (panel && home) init(panel, home);

function init(panel: HTMLElement, home: HTMLElement) {
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const convoEl = q('[data-q-convo]'), withEl = q('[data-q-with]'), scroll = q('[data-q-scroll]'), list = q('[data-q-list]'), top = q('[data-q-top]');
  const note = q('[data-q-note]'), form = q<HTMLFormElement>('[data-q-form]'), input = q<HTMLTextAreaElement>('[data-q-input]'), sendBtn = q<HTMLButtonElement>('[data-q-send]');
  const sheet = q('[data-q-sheet]'), sheetList = q('[data-q-sheet-list]');
  const signedIn = () => document.cookie.split('; ').includes('opus_in=1');
  const UI_KEY = 'opus.msg.ui.v1';
  const readUI = (): Record<string, unknown> => { try { return JSON.parse(sessionStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } };
  const rememberRoom = (id: string | null) => { try { sessionStorage.setItem(UI_KEY, JSON.stringify({ ...readUI(), grp: id })); } catch { /* private mode */ } };
  const draftKey = (id: string) => `opus.msg.draft.grp.${id}`;
  const getDraft = (id: string) => { try { return localStorage.getItem(draftKey(id)) ?? ''; } catch { return ''; } };
  const setDraft = (id: string, v: string) => { try { v ? localStorage.setItem(draftKey(id), v) : localStorage.removeItem(draftKey(id)); } catch { /* ignore */ } };

  let rooms: Room[] = [], room: Room | null = null, msgs: Msg[] = [], more = false, sending = false, single = false;

  const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j as { error?: string }).error || 'Something went wrong.'), { status: r.status });
    return j as T;
  };
  const post = <T,>(url: string, body: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body) });
  const cid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'O';
  const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  const toBottom = () => { scroll.scrollTop = scroll.scrollHeight; };
  const isShown = () => !panel.hidden && !q('[data-om-view="group"]').hidden;
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };

  function ago(t: number) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function avatar(a: Author) {
    const e = a.handle ? el('a', 'om-m__av') : el('span', 'om-m__av');
    if (a.handle) (e as HTMLAnchorElement).href = `/${encodeURIComponent(a.handle)}`;
    if (a.photo) { const i = el('img'); i.src = a.photo; i.alt = ''; i.loading = 'lazy'; e.append(i); } else e.append(document.createTextNode(initials(a.name)));
    return e;
  }
  function roomBadge(r: Room) {
    const e = el('span', 'om-row__av');
    if (r.photo) e.style.backgroundImage = `url("${r.photo}")`; else e.textContent = initials(r.name);
    return e;
  }

  // ---------- home: my groups ----------
  function state(title: string, text: string, links: { href: string; label: string; solid?: boolean }[] = []) {
    const s = el('div', 'om__state');
    s.append(el('strong', '', title), document.createTextNode(text));
    if (links.length) { const a = el('div', 'om__join-actions'); a.style.marginTop = '12px'; for (const l of links) { const x = el('a', `om__btn${l.solid ? ' om__btn--solid' : ''}`, l.label); x.href = l.href; a.append(x); } s.append(a); }
    home.replaceChildren(s);
  }
  async function loadHome(o: { quiet?: boolean; auto?: string } = {}) {
    convoEl.hidden = true; home.hidden = false; panel.classList.remove('in-convo');
    if (!signedIn()) { state('Groups are for members', 'Join Opus to chat with your band, crew or collective.', [{ href: '/sign-up', label: 'Join', solid: true }, { href: '/sign-in', label: 'Sign in' }]); return; }
    if (!o.quiet) home.replaceChildren(el('div', 'om__state', 'Loading…'));
    try {
      rooms = (await api<{ rooms: Room[] }>('/api/group-chat')).rooms;
    } catch (e) {
      // Migration 0014 not applied yet, or offline.
      state('Group chat isn’t available yet', 'Try again in a moment.');
      console.error('group chat', e);
      return;
    }
    renderHome();
    // One group: no list to choose from, go straight in. Several: remembered room, else the list.
    const want = o.auto;
    if (want && rooms.some((r) => r.id === want) && !room) openRoom(want, { quiet: true });
  }
  function renderHome() {
    single = false;
    if (!rooms.length) {
      state('Your group’s chat lives here', 'Start a group, or accept an invite, and its members can talk and share sessions here.', [{ href: '/clans/new', label: 'Start a group', solid: true }, { href: '/clans/mine', label: 'My groups' }]);
      return;
    }
    const f = document.createDocumentFragment();
    f.append(el('p', 'om__section', 'Your groups'));
    for (const r of rooms) {
      const b = el('button', `om-row${r.unread ? ' is-unread' : ''}`);
      b.type = 'button';
      const main = el('span', 'om-row__main');
      main.append(el('span', 'om-row__name', r.name), el('span', 'om-row__sub', r.preview || `${r.members} member${r.members === 1 ? '' : 's'} · say hello`));
      const side = el('span', 'om-row__side');
      if (r.at) side.append(el('span', '', ago(r.at)));
      if (r.unread) side.append(el('i', 'om-row__unread'));
      b.append(roomBadge(r), main, side);
      b.addEventListener('click', () => openRoom(r.id));
      f.append(b);
    }
    home.replaceChildren(f);
  }

  // ---------- a room ----------
  async function openRoom(id: string, o: { quiet?: boolean } = {}) {
    const r = rooms.find((x) => x.id === id);
    if (!r) { if (!rooms.length) await loadHome({ auto: id }); return; }
    room = r; msgs = []; more = false;
    rememberRoom(id);
    home.hidden = true; convoEl.hidden = false; sheet.hidden = true; convoEl.classList.remove('has-sheet');
    panel.classList.toggle('in-convo', !single);
    renderWith(r);
    list.replaceChildren(el('div', 'om__state', 'Loading…'));
    top.hidden = true;
    input.value = getDraft(id); autosize();
    form.hidden = false; note.textContent = '';
    try {
      const d = await api<{ messages: Msg[]; more: boolean }>(`/api/group-chat/${encodeURIComponent(id)}`);
      if (room?.id !== id) return;
      msgs = d.messages; more = d.more;
      r.unread = false;
      renderMsgs('bottom');
      document.dispatchEvent(new CustomEvent('opus:group-read'));
    } catch (e) {
      list.replaceChildren(el('div', 'om__state', (e as Error).message));
    }
    if (!o.quiet && !matchMedia('(max-width: 760px)').matches) input.focus();
  }
  function renderWith(r: Room) {
    const a = el('a', 'om__with-name', r.name); a.href = `/c/${encodeURIComponent(r.handle)}`;
    const sub = el('small', '', `${r.members} member${r.members === 1 ? '' : 's'}`); sub.style.color = 'var(--text-3)'; sub.style.fontSize = '12px';
    withEl.replaceChildren(roomBadge(r), a, sub);
    (withEl.firstElementChild as HTMLElement).style.cssText += ';width:28px;height:28px;border-radius:8px;font-size:11px';
  }
  function row(m: Msg, prev?: Msg) {
    const cont = !!prev && prev.author.name === m.author.name && prev.mine === m.mine && m.at - prev.at < 5 * 60_000 && prev.kind === 'text' && m.kind === 'text';
    const e = el('div', `om-g${cont ? ' is-cont' : ''}${m.pending ? ' is-pending' : ''}`);
    e.dataset.id = String(m.id);
    e.append(avatar(m.author));
    const head = el('div', 'om-m__head');
    const nm = m.author.handle ? Object.assign(el('a', 'om-m__name', m.author.name), { href: `/${encodeURIComponent(m.author.handle)}` }) : el('span', 'om-m__name', m.author.name);
    head.append(nm, el('span', 'om-m__meta', ago(m.at)));
    e.append(head);
    if (m.session) {
      const c = m.session;
      const card = c.href ? Object.assign(el('a', 'om-card'), { href: c.href }) : el('div', 'om-card');
      card.append(el('span', 'om-card__k', 'Session'), el('span', 'om-card__t', c.title));
      if (c.detail) card.append(el('span', 'om-card__s', c.detail));
      card.append(el('span', 'om-card__w', c.when));
      if (m.body) e.append(el('p', 'om-m__text', m.body));
      e.append(card);
      if (m.id > 0 && c.at > Date.now() && !m.mine) e.append(rsvpRow(m));
      else if (m.going > 0) e.append(el('p', 'om-card__going', `${m.going} going`));
    } else e.append(el('p', 'om-m__text', m.body));
    if (m.mine && !m.pending) {
      const x = el('button', 'om-g__x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remove message');
      x.addEventListener('click', () => removeMsg(m));
      e.append(x);
    }
    return e;
  }
  function rsvpRow(m: Msg) {
    const wrap = el('div', 'om-rsvp');
    const mk = (label: string, status: 'going' | 'no') => {
      const b = el('button', `om__btn om__btn--small${m.myRsvp === status ? ' om__btn--solid' : ''}`, label); b.type = 'button'; b.setAttribute('aria-pressed', String(m.myRsvp === status));
      b.addEventListener('click', async () => {
        if (!room) return;
        try {
          const r = await post<{ going: number; myRsvp: 'going' | 'no' | null }>(`/api/group-chat/${encodeURIComponent(room.id)}`, { action: 'rsvp', messageId: m.id, status: m.myRsvp === status ? null : status });
          m.going = r.going; m.myRsvp = r.myRsvp; renderMsgs('none');
        } catch (e) { note.textContent = (e as Error).message; }
      });
      return b;
    };
    wrap.append(mk('Going', 'going'), mk('Can’t', 'no'));
    if (m.going > 0) wrap.append(el('span', 'om-card__going', `${m.going} going`));
    if (m.myRsvp === 'going') wrap.append(el('span', 'om-card__going', 'On your Future'));
    return wrap;
  }
  function renderMsgs(keep: 'bottom' | 'none' = 'bottom') {
    const f = document.createDocumentFragment();
    if (!msgs.length) {
      const s = el('div', 'om__state'); s.append(el('strong', '', 'No messages yet'), document.createTextNode('Say hello, or share a session you’re working on.'));
      list.replaceChildren(s);
    } else {
      msgs.forEach((m, i) => f.append(row(m, msgs[i - 1])));
      list.replaceChildren(f);
    }
    top.hidden = !more;
    if (more) { top.replaceChildren(); const b = el('button', 'om__btn om__btn--small', 'Earlier messages'); b.type = 'button'; b.addEventListener('click', loadOlder); top.append(b); }
    if (keep === 'bottom') toBottom();
  }
  async function loadOlder() {
    if (!room || !msgs.length) return;
    const first = msgs[0].id, h = scroll.scrollHeight;
    try {
      const d = await api<{ messages: Msg[]; more: boolean }>(`/api/group-chat/${encodeURIComponent(room.id)}?before=${first}`);
      msgs = [...d.messages, ...msgs]; more = d.more;
      renderMsgs('none'); scroll.scrollTop = scroll.scrollHeight - h;
    } catch { /* keep what we have */ }
  }
  async function catchUp() {
    if (!room) return;
    const id = room.id, last = [...msgs].reverse().find((m) => !m.pending)?.id ?? 0;
    try {
      const d = await api<{ messages: Msg[] }>(`/api/group-chat/${encodeURIComponent(id)}?after=${last}`);
      if (room?.id !== id) return;
      const known = new Set(msgs.map((m) => m.id));
      const fresh = d.messages.filter((m) => !known.has(m.id));
      // Messages I just sent are already shown as pending; drop their placeholders.
      if (fresh.length) {
        const stick = nearBottom();
        msgs = msgs.filter((m) => !m.pending || !fresh.some((f) => f.mine && f.body === m.body)).concat(fresh);
        renderMsgs(stick ? 'bottom' : 'none');
      }
    } catch { /* offline */ }
  }
  async function reload() {
    if (!room) return;
    try {
      const d = await api<{ messages: Msg[]; more: boolean }>(`/api/group-chat/${encodeURIComponent(room.id)}`);
      const stick = nearBottom(); msgs = d.messages; more = d.more; renderMsgs(stick ? 'bottom' : 'none');
    } catch { /* offline */ }
  }

  // ---------- send ----------
  async function send() {
    if (!room || sending) return;
    const body = input.value.trim();
    if (!body) return;
    sending = true; sendBtn.disabled = true; note.textContent = '';
    const c = cid();
    const mine: Msg = { id: -Date.now(), kind: 'text', body, session: null, at: Date.now(), mine: true, author: { handle: '', name: 'You', photo: null, city: null, verified: false }, going: 0, myRsvp: null, pending: true, cid: c };
    msgs.push(mine); renderMsgs('bottom');
    input.value = ''; setDraft(room.id, ''); autosize();
    try {
      const r = await post<{ message: Msg }>(`/api/group-chat/${encodeURIComponent(room.id)}`, { body, cid: c });
      const i = msgs.findIndex((m) => m.cid === c);
      if (i >= 0) msgs[i] = r.message;
      renderMsgs('bottom');
    } catch (e) {
      msgs = msgs.filter((m) => m.cid !== c); renderMsgs('bottom');
      input.value = body; autosize();
      note.textContent = (e as Error).message;
    } finally { sending = false; sendBtn.disabled = false; }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  input.addEventListener('input', () => { autosize(); if (room) setDraft(room.id, input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width: 760px)').matches) { e.preventDefault(); send(); }
  });

  async function removeMsg(m: Msg) {
    if (!room) return;
    try { await post(`/api/group-chat/${encodeURIComponent(room.id)}`, { action: 'remove', messageId: m.id }); msgs = msgs.filter((x) => x.id !== m.id); renderMsgs('none'); }
    catch (e) { note.textContent = (e as Error).message; }
  }

  // ---------- share a session ----------
  q('[data-q-share]').addEventListener('click', async () => {
    if (!room) return;
    sheet.hidden = false; convoEl.classList.add('has-sheet');
    sheetList.replaceChildren(el('p', 'om-share__empty', 'Loading your sessions…'));
    try {
      const d = await api<{ sessions: Shareable[] }>(`/api/group-chat/${encodeURIComponent(room.id)}?share=1`);
      if (!d.sessions.length) { sheetList.replaceChildren(el('p', 'om-share__empty', 'Nothing on your Future with a set time yet. Book a session or add an event, and it shows up here to share.')); return; }
      const f = document.createDocumentFragment();
      for (const s of d.sessions) {
        const b = el('button', 'om-row'); b.type = 'button';
        const main = el('span', 'om-row__main'); main.append(el('span', 'om-row__name', s.title), el('span', 'om-row__sub', `${s.when} · ${s.detail}`));
        b.append(el('span', 'om-row__av', s.kind === 'event' ? '◔' : '♪'), main, el('span'));
        b.addEventListener('click', () => shareSession(s.id));
        f.append(b);
      }
      sheetList.replaceChildren(f);
    } catch (e) { sheetList.replaceChildren(el('p', 'om-share__empty', (e as Error).message)); }
  });
  const closeSheet = () => { sheet.hidden = true; convoEl.classList.remove('has-sheet'); };
  q('[data-q-sheet-close]').addEventListener('click', closeSheet);
  async function shareSession(sessionId: string) {
    if (!room) return;
    try {
      const r = await post<{ message: Msg }>(`/api/group-chat/${encodeURIComponent(room.id)}`, { sessionId, body: input.value.trim(), cid: cid() });
      input.value = ''; setDraft(room.id, ''); autosize();
      msgs.push(r.message); closeSheet(); renderMsgs('bottom');
    } catch (e) { closeSheet(); note.textContent = (e as Error).message; }
  }

  // ---------- panel hooks ----------
  // Groups are listed inside the Messages tab, so leaving a room goes back there.
  function backToList() {
    room = null; rememberRoom(null); closeSheet();
    convoEl.hidden = true; panel.classList.remove('in-convo');
    document.dispatchEvent(new CustomEvent('opus:group-exit'));
  }
  document.addEventListener('opus:group-back', () => backToList());
  document.addEventListener('opus:group-show', () => { if (room) { convoEl.hidden = false; home.hidden = true; panel.classList.add('in-convo'); catchUp(); } });
  document.addEventListener('opus:group-open', (e) => {
    const id = (e as CustomEvent<{ id: string }>).detail?.id;
    if (!id) { if (!room) document.dispatchEvent(new CustomEvent('opus:group-exit')); return; }
    if (rooms.some((r) => r.id === id)) openRoom(id); else loadHome({ auto: id });
  });
  document.addEventListener('opus:group-nudge', () => {
    if (!isShown()) return;
    if (room) catchUp();
  });
  // A removed message can't be caught up by "after"; a fresh page keeps the room honest.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && isShown() && room) reload(); });
}

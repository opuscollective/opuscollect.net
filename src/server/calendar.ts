/**
 * Calendar subscription: a private, revocable link a member adds to Apple Calendar, Google Calendar, Outlook or
 * Notion Calendar. It carries an unguessable token, shows their Future (read-only), and works until they reset
 * or turn it off. Tokens live in KV (no database change): `cal:<token>` -> user id, `calu:<user id>` -> token.
 */
const bytes = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

export async function getCalendarToken(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(`calu:${userId}`);
}

/** Creates the member's link, or replaces it (the old one stops working immediately). */
export async function resetCalendarToken(kv: KVNamespace, userId: string): Promise<string> {
  const old = await kv.get(`calu:${userId}`);
  if (old) await kv.delete(`cal:${old}`);
  const t = bytes();
  await kv.put(`cal:${t}`, userId);
  await kv.put(`calu:${userId}`, t);
  return t;
}

export async function revokeCalendarToken(kv: KVNamespace, userId: string) {
  const old = await kv.get(`calu:${userId}`);
  if (old) await kv.delete(`cal:${old}`);
  await kv.delete(`calu:${userId}`);
}

export async function userForCalendarToken(kv: KVNamespace, token: string): Promise<string | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  return kv.get(`cal:${token}`);
}

// POST /api/waitlist (called from src/pages/api/waitlist.ts on the Worker)
// Saves each signup to the KV namespace bound as WAITLIST (backup),
// then adds the person to your Kit form so you can email the list.
const KIT_FORM_ID = '10621918';
const ROLES = ['Artist', 'Producer', 'Engineer', 'Designer', 'Filmmaker', 'Listener', 'Other'];
const INTERESTS = ['membership', 'summit', 'conferences'];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// Accepts "@name", "name" or an instagram.com link; returns "@name".
const igHandle = (v) => {
  let t = clean(v, 200).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '');
  t = t.split(/[/?#\s]/)[0].replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
  return t ? '@' + t.toLowerCase() : '';
};

// Kit tag IDs (optional). Set KIT_TAG_MEMBERSHIP / KIT_TAG_SUMMIT /
// KIT_TAG_CONFERENCES in Cloudflare to tag signups by where they joined.
async function sendToKit(env, record, interest) {
  const formId = env.KIT_FORM_ID || KIT_FORM_ID;
  const params = new URLSearchParams();
  params.set('email_address', record.email);
  params.set('fields[first_name]', record.name);
  // Saved only if you create custom fields with these exact keys in Kit.
  params.set('fields[role]', record.role);
  if (record.artist_name) params.set('fields[artist_name]', record.artist_name);
  if (record.instagram) params.set('fields[instagram]', record.instagram);
  if (record.other_socials) params.set('fields[other_socials]', record.other_socials);
  params.set('fields[interests]', record.interests.join(', '));
  const tag = env[`KIT_TAG_${interest.toUpperCase()}`];
  if (tag) params.append('tags[]', String(tag));
  try {
    const res = await fetch(`https://app.kit.com/forms/${formId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? 'ok' : `failed:${res.status}`;
  } catch (e) {
    return 'failed:network';
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.WAITLIST) return json({ error: 'The waitlist isn’t connected yet.' }, 500);

  let body;
  try {
    const type = request.headers.get('Content-Type') || '';
    body = type.includes('application/json')
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ error: 'Something went wrong reading the form.' }, 400);
  }

  // Bots fill the hidden "website" field; quietly accept and drop them.
  if (clean(body.website, 200)) return json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const role = ROLES.includes(body.role) ? body.role : 'Other';
  const artist_name = clean(body.artist_name, 120);
  const instagram = igHandle(body.instagram);
  const other_socials = clean(body.other_socials, 300);
  const interest = INTERESTS.includes(body.interest) ? body.interest : 'membership';
  const consent = body.consent === 'on' || body.consent === true || body.consent === 'true';

  if (!name) return json({ error: 'Please add your name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please use a valid email.' }, 400);
  if (!consent) return json({ error: 'Please tick the box so we can email you.' }, 400);

  const key = `signup:${email}`;
  const existing = await env.WAITLIST.get(key, 'json');
  const now = new Date().toISOString();
  const interests = Array.from(new Set([...(existing?.interests || []), interest]));
  const record = {
    name: name || existing?.name || '',
    email,
    role: body.role ? role : existing?.role || role,
    artist_name: artist_name || existing?.artist_name || '',
    instagram: instagram || existing?.instagram || '',
    other_socials: other_socials || existing?.other_socials || '',
    interests,
    joined: existing?.joined || now,
    updated: now,
    country: (request.cf || {}).country || '',
  };
  // Backup first, so nobody is lost even if Kit is down.
  await env.WAITLIST.put(key, JSON.stringify(record));
  record.kit = await sendToKit(env, record, interest);
  await env.WAITLIST.put(key, JSON.stringify(record));
  return json({ ok: true, returning: Boolean(existing) });
}


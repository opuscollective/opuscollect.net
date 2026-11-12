/**
 * Opus, the guide: a structured intent system (V1, no generative AI).
 *
 * A request becomes a Reply: a short message plus, at most, one Action. Actions are a closed
 * set of typed, whitelisted destinations built here from known routes and filters, never free
 * URLs. The UI only ever performs an Action through `actionHref`, so a future AI engine can
 * replace `respond` (same input, same Reply type) without being able to send people anywhere
 * the product does not already go.
 */
import { CITIES, citySlug, type City } from '../data/cities.ts';
import { SPECIALTIES, type Specialty } from '../data/specialties.ts';

export interface AssistantContext {
  /** Current pathname, e.g. "/world/atlanta". */
  path: string;
  signedIn: boolean;
}

export type Action =
  | { type: 'directory'; kind?: 'musician' | 'studio' | 'organization'; specialty?: Specialty; city?: string; verified?: boolean; collab?: boolean; studio?: 'commercial' | 'home' | 'remote'; q?: string }
  | { type: 'page'; page: PageKey }
  | { type: 'signin'; next: PageKey };

/** Every page the guide can open. Paths live here and nowhere else. */
export const PAGES = {
  home: '/',
  world: '/world',
  profile: '/account/profile',
  account: '/account',
  connections: '/account/connections',
  bookings: '/account/bookings',
  music: '/music',
  start: '/start',
  releases: '/releases',
  verified: '/verified',
  charts: '/charts',
  collective: '/collective',
  network: '/network',
  business: '/business',
  signin: '/sign-in',
  signup: '/sign-up',
  about: '/about',
  events: '/events',
} as const;
export type PageKey = keyof typeof PAGES;

export interface Reply {
  text: string;
  /** Performed for the person (navigation) unless `offer` is set, then shown as a button. */
  action?: Action;
  /** Label for the button when the action is offered rather than performed. */
  offer?: string;
  /** Follow-up suggestions to show under the reply. */
  suggestions?: string[];
}

const KIND_PATH = { musician: '/musicians', studio: '/studios', organization: '/organizations' } as const;

/** The only way an Action becomes an address. */
export function actionHref(a: Action): string {
  if (a.type === 'page') return PAGES[a.page];
  if (a.type === 'signin') return `${PAGES.signin}?next=${encodeURIComponent(PAGES[a.next])}`;
  const u = new URLSearchParams();
  // A city on its own is a clean address: /world/<city>.
  const onlyCity = a.city && !a.kind && !a.specialty && !a.verified && !a.collab && !a.studio && !a.q;
  if (onlyCity) return `/world/${citySlug(a.city!)}`;
  if (a.q) u.set('q', a.q);
  if (a.specialty) u.set('specialty', a.specialty);
  if (a.studio) u.set('studio', a.studio);
  if (a.verified) u.set('verified', '1');
  if (a.collab) u.set('collab', '1');
  if (a.city) u.set('city', a.city);
  const kind = a.kind ?? (a.specialty ? 'musician' : undefined);
  const path = kind ? KIND_PATH[kind] : '/world';
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}

// ---------- Understanding a request ----------

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();
const has = (t: string, ...words: string[]) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(t));

/** Words people use for each specialty, most specific first. */
const SPECIALTY_WORDS: [Specialty, string[]][] = [
  ['mixing-engineer', ['mixing engineers?', 'mix engineers?', 'mixers?', 'mixing']],
  ['mastering-engineer', ['mastering engineers?', 'mastering']],
  ['audio-engineer', ['audio engineers?', 'recording engineers?', 'engineers?', 'sound engineers?']],
  ['producer', ['music producers?', 'producers?', 'beatmakers?', 'beat makers?', 'beats']],
  ['songwriter', ['songwriters?', 'song writers?', 'writers?', 'toplin(?:er|ers)']],
  ['vocalist', ['vocalists?', 'singers?', 'background vocals?']],
  ['dj', ['djs?', 'deejays?']],
  ['composer', ['composers?', 'scor(?:e|ing)']],
  ['arranger', ['arrangers?']],
  ['instrumentalist', ['instrumentalists?', 'session players?', 'musicians? who play', 'guitarists?', 'bassists?', 'drummers?', 'pianists?', 'keys players?', 'keyboardists?', 'violinists?', 'saxophonists?']],
  ['recording-artist', ['recording artists?', 'artists?', 'rappers?', 'mcs?', 'performers?']],
];

function findSpecialty(t: string): Specialty | undefined {
  for (const [key, words] of SPECIALTY_WORDS) if (words.some((w) => has(t, w))) return key;
  return undefined;
}

/** A known city mentioned anywhere in the request (longest names first, so "New York" beats "York"). */
const CITY_TERMS: [string, City][] = CITIES.flatMap((c) => [[norm(c.name), c] as [string, City], ...(c.aliases ?? []).map((a) => [norm(a), c] as [string, City])])
  .sort((a, b) => b[0].length - a[0].length);
export function findCityIn(t: string): City | undefined {
  for (const [term, c] of CITY_TERMS) if (term && has(t, term.replace(/ /g, ' '))) return c;
  return undefined;
}

/** The place words after "in"/"near"/"around", for a city Opus does not know yet. */
function unknownPlace(t: string): string | undefined {
  const m = t.match(/(?:^| )(?:in|near|around|from) ([a-z][a-z ]{1,30})$/);
  if (!m) return undefined;
  const p = m[1].replace(/ (please|area|today|now)$/, '').trim();
  return p && !['me', 'my area', 'the world', 'opus', 'world'].includes(p) ? p : undefined;
}

const title = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

const GREETING = 'Welcome to Opus. I can help you discover people, find studios, and navigate the platform. Where should we start?';

export function welcome(): string { return GREETING; }

/** Suggestions for the page the person is on. Each one is a request `respond` understands. */
export function suggestionsFor(path: string): string[] {
  if (/^\/(world|musicians|organizations)(\/|$)/.test(path)) return ['Producers in Atlanta', 'Only Opus Verified members', 'People open to collaborate', 'How does World work?'];
  if (/^\/studios(\/|$)/.test(path)) return ['Recording studios in Nashville', 'Home studios', 'List my studio', 'How does booking work?'];
  if (/^\/(music|releases|start|r)(\/|$)/.test(path)) return ['Start a release', 'Show my releases', 'How do credits work?', 'Find a mixing engineer'];
  if (/^\/verified(\/|$)/.test(path)) return ['How do I get verified?', 'Show verified members', 'Find producers in Birmingham'];
  if (/^\/account(\/|$)/.test(path)) return ['Take me to my profile', 'My connections', 'My bookings', 'Show my releases'];
  return ['Find producers in Birmingham', 'Explore recording studios', 'Discover musicians', 'How does Opus work?'];
}

/** Turn a request into a Reply. Pure and synchronous: easy to test, easy to swap for a model later. */
export function respond(input: string, ctx: AssistantContext): Reply {
  const t = norm(input);
  if (!t) return { text: 'Tell me what you are looking for, like “producers in Atlanta” or “recording studios”.', suggestions: suggestionsFor(ctx.path) };

  const city = findCityIn(t);
  const specialty = findSpecialty(t);
  const verified = has(t, 'verified', 'verified members?') && !has(t, 'get verified', 'become verified', 'verification', 'how');
  const collab = has(t, 'collab', 'collaborate', 'collaborators?', 'open to collaborate');
  const mine = has(t, 'my', 'mine', 'me');

  // ----- Help and explanations (answered here, with the page offered, not opened) -----
  if (has(t, 'get verified', 'become verified', 'verification', 'verified work', 'how does verification work', 'what is opus verified') || (has(t, 'verified') && has(t, 'how', 'what', 'why'))) {
    return {
      text: 'Opus Verified is earned through real, reviewed work: credits and releases that check out, a complete profile, and conduct in the community. It is never sold, and paying for Opus never earns or changes it.',
      action: { type: 'page', page: 'verified' }, offer: 'Read the criteria',
    };
  }
  if (has(t, 'how does opus work', 'what is opus', 'how do i use opus', 'what can you do', 'what can i do', 'how does this work', 'how does it work') || (t === 'help' || t === 'help me')) {
    return {
      text: 'Opus is where the independent music world finds each other. World is the directory of people and studios, Music holds your releases and credits, Network keeps your connections and bookings, and Opus Verified marks reviewed work. Ask me for a person, a studio or a page and I will take you there.',
      suggestions: ['Find producers in Birmingham', 'Explore recording studios', 'Show my releases', 'How do I get verified?'],
    };
  }
  if (has(t, 'how does world work', 'what is world')) {
    return { text: 'World is the map and directory of Opus members. Search a city, a name or a specialty, then open a profile to see their work and connect.', suggestions: ['Producers in Atlanta', 'Studios in London', 'Only Opus Verified members'] };
  }
  if (has(t, 'how does booking work', 'how do bookings work', 'book a session', 'book a studio')) {
    return { text: 'Open a studio’s page and send a request to book with the date, time and service. The studio confirms it. Payments are not on Opus yet.', action: { type: 'directory', kind: 'studio', city: city?.name }, offer: city ? `Studios in ${city.name}` : 'Browse studios' };
  }
  if (has(t, 'how do credits work', 'credits')) {
    return { text: 'Add everyone who worked on a release. When they are on Opus, they confirm their credit and it shows on both profiles.', action: { type: 'page', page: 'music' }, offer: 'Open Music' };
  }
  if (has(t, 'charts?', 'rankings?', 'top artists?')) {
    return { text: 'Charts is still in development: city-by-city charts with no pay-to-rank. There are no live rankings yet.', action: { type: 'page', page: 'charts' }, offer: 'See what’s coming' };
  }

  // ----- Not available yet: say so, never pretend -----
  if (has(t, 'messages?', 'message', 'dm', 'inbox', 'chat with')) {
    return { text: 'Messaging is not on Opus yet. For now you can connect with someone from their profile, and see your connections in Network.', action: { type: 'page', page: 'connections' }, offer: 'Open my connections' };
  }
  if (has(t, 'pay', 'payment', 'payments', 'invoice', 'distribute', 'distribution', 'upload to spotify', 'royalt(?:y|ies)')) {
    return { text: 'Opus does not handle payments or distribution yet. Music keeps your releases and credits in one place.', action: { type: 'page', page: 'music' }, offer: 'Open Music' };
  }

  // ----- Your own things (sign-in aware) -----
  const ownPage = (page: PageKey, label: string): Reply => ctx.signedIn
    ? { text: `Opening ${label}.`, action: { type: 'page', page } }
    : { text: `Sign in first and I will take you to ${label}.`, action: { type: 'signin', next: page }, offer: 'Sign in' };
  if (mine && has(t, 'profile', 'page')) return ownPage('profile', 'your profile');
  if (mine && has(t, 'releases?', 'music', 'songs?', 'tracks?', 'discography')) return ownPage('music', 'your releases');
  if (mine && has(t, 'connections?', 'network')) return ownPage('connections', 'your connections');
  if (mine && has(t, 'bookings?', 'sessions?', 'requests?')) return ownPage('bookings', 'your bookings');
  if (mine && has(t, 'account', 'settings')) return ownPage('account', 'your account');
  if (has(t, 'start a release', 'new release', 'add a release', 'release my', 'create a release', 'add my music')) return { text: 'Opening the release builder.', action: { type: 'page', page: 'start' } };
  if (has(t, 'list my studio', 'add my studio', 'my studio', 'register my studio')) return { text: 'Opening Opus for studios.', action: { type: 'page', page: 'business' } };
  if (has(t, 'sign in', 'log in', 'login', 'signin')) return { text: 'Opening sign in.', action: { type: 'page', page: 'signin' } };
  if (has(t, 'sign up', 'join', 'create an account', 'register', 'signup')) return { text: 'Opening sign up.', action: { type: 'page', page: 'signup' } };

  // ----- Places and pages -----
  if (has(t, 'collective', 'community')) return { text: 'Opening the Collective.', action: { type: 'page', page: 'collective' } };
  if (has(t, 'events?')) return { text: 'Opening events.', action: { type: 'page', page: 'events' } };
  if (has(t, 'releases', 'listen', 'new music')) return { text: 'Opening releases on Opus.', action: { type: 'page', page: 'releases' } };
  if (has(t, 'network')) return { text: 'Opening Network.', action: { type: 'page', page: 'network' } };
  if (has(t, 'about opus', 'about page', 'who made opus')) return { text: 'Opening About.', action: { type: 'page', page: 'about' } };

  // ----- Discovery: the directory with real filters -----
  // A place Opus has no coordinates for is still searched, by name, rather than dropped.
  const other = city ? undefined : unknownPlace(t);
  const where = city ? ` in ${city.name}` : other ? ` matching “${title(other)}”` : '';
  const studioWord = has(t, 'studios?', 'recording rooms?', 'rooms?', 'booths?');
  if (studioWord) {
    const studio = has(t, 'home studios?') ? 'home' : has(t, 'remote', 'online') ? 'remote' : has(t, 'recording studios?', 'commercial') ? 'commercial' : undefined;
    const label = studio === 'home' ? 'Home studios' : studio === 'remote' ? 'Remote services' : studio === 'commercial' ? 'Recording studios' : 'Studios';
    return { text: `${label}${where}. Opening World.`, action: { type: 'directory', kind: 'studio', studio, city: city?.name, q: other, verified: verified || undefined } };
  }
  if (has(t, 'organizations?', 'orgs?', 'labels?', 'record labels?', 'publishers?', 'collectives')) {
    return { text: `Organizations${where}. Opening World.`, action: { type: 'directory', kind: 'organization', city: city?.name, q: other, verified: verified || undefined } };
  }
  const peopleWord = has(t, 'people', 'musicians?', 'members?', 'talent', 'creatives?', 'collaborators?', 'someone', 'anyone');
  if (specialty || peopleWord || verified || collab) {
    const label = specialty ? SPECIALTIES[specialty].plural : verified && !peopleWord ? 'Opus Verified members' : 'Musicians';
    return {
      text: `${label}${collab ? ' open to collaborate' : ''}${where}. Opening World.`,
      action: { type: 'directory', kind: 'musician', specialty, city: city?.name, q: other, verified: verified || undefined, collab: collab || undefined },
    };
  }
  if (city) return { text: `Opening World in ${city.name}.`, action: { type: 'directory', city: city.name } };
  if (has(t, 'world', 'map', 'globe', 'directory', 'explore', 'discover')) return { text: 'Opening World.', action: { type: 'page', page: 'world' } };
  if (has(t, 'music')) return { text: 'Opening Music.', action: { type: 'page', page: 'music' } };
  if (has(t, 'home', 'homepage', 'start page')) return { text: 'Opening the homepage.', action: { type: 'page', page: 'home' } };

  // ----- A place Opus does not know -----
  const place = unknownPlace(t);
  if (place) {
    return { text: `I don’t have ${title(place)} on the map yet. I can search World for it by name instead.`, action: { type: 'directory', q: place }, offer: `Search World for “${title(place)}”` };
  }

  // ----- Not understood: be honest, offer a plain search -----
  return {
    text: 'I can’t do that yet. I can find people and studios, open your releases, profile and connections, and explain how Opus works.',
    action: { type: 'directory', q: input.trim().slice(0, 80) }, offer: `Search World for “${input.trim().slice(0, 40)}”`,
    suggestions: suggestionsFor(ctx.path).slice(0, 3),
  };
}

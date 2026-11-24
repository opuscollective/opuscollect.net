/**
 * Contextual product navigation for each Opus destination (2026-11-18).
 * Only routes that exist and work are listed. `members` items show only to signed-in members.
 * The global header stays the way into every product; this bar is the way around inside one.
 */
export interface ProductNavItem { key: string; label: string; href: string; members?: boolean; /** Shown to visitors only (members land on their own works instead). */ guest?: boolean }
export interface ProductCta { label: string; href: string; /** Where a signed-out visitor goes instead (the intended action is kept in ?next=). */ signedOut?: string; /** Data attribute set on the CTA so an in-page script can take over (e.g. the Add Work sheet). */ action?: [string, string] }
export interface ProductDef { key: string; name: string; href: string; soon?: boolean; items: ProductNavItem[]; cta?: ProductCta }

const signIn = (next: string) => `/sign-in?next=${encodeURIComponent(next)}`;

export const PRODUCTS: Record<string, ProductDef> = {
  world: {
    key: 'world', name: 'World', href: '/world',
    items: [
      { key: 'map', label: 'Map', href: '/world' },
      { key: 'people', label: 'People', href: '/musicians' },
      { key: 'clans', label: 'Groups', href: '/clans' },
      { key: 'cities', label: 'My Cities', href: '/world/cities' },
      { key: 'studios', label: 'Studios', href: '/studios' },
      { key: 'list-studio', label: 'List your studio', href: '/business' },
    ],
    cta: { label: 'Explore World', href: '/world' },
  },
  works: {
    key: 'works', name: 'Works', href: '/works',
    items: [
      { key: 'overview', label: 'Overview', href: '/works', guest: true },
      { key: 'explore', label: 'Explore', href: '/works/explore' },
      { key: 'mine', label: 'My Works', href: '/works/mine', members: true },
    ],
    cta: { label: 'Add Work', href: '/works?add=1', signedOut: signIn('/works?add=1'), action: ['data-add-work', ''] },
  },
  studios: {
    key: 'studios', name: 'Studios', href: '/studios',
    items: [
      { key: 'discover', label: 'Discover', href: '/studios' },
      { key: 'sessions', label: 'My Sessions', href: '/account/bookings', members: true },
      { key: 'owners', label: 'For Studios', href: '/business' },
    ],
    cta: { label: 'List your studio', href: '/business' },
  },
  venues: {
    key: 'venues', name: 'Venues', href: '/venues', soon: true, items: [],
    cta: { label: 'Create an event', href: '/events/new', signedOut: signIn('/events/new') },
  },
  events: {
    key: 'events', name: 'Events', href: '/events',
    items: [
      { key: 'overview', label: 'Discover', href: '/events' },
      { key: 'mine', label: 'My Events', href: '/events/mine', members: true },
      { key: 'summit', label: 'The Summit', href: '/summit' },
    ],
    cta: { label: 'Create Event', href: '/events/new', signedOut: signIn('/events/new') },
  },
  airplay: {
    key: 'airplay', name: 'Airplay', href: '/airplay', soon: true, items: [],
    cta: { label: 'Get your works ready', href: '/works' },
  },
  future: {
    key: 'future', name: 'Future', href: '/future',
    items: [
      { key: 'mine', label: 'My Future', href: '/future?tab=mine' },
      { key: 'our', label: 'Our Future', href: '/future?tab=our' },
    ],
    cta: { label: 'Create Event', href: '/events/new', signedOut: signIn('/events/new') },
  },
  charts: {
    key: 'charts', name: 'Charts', href: '/charts', soon: true, items: [],
  },
  network: {
    key: 'network', name: 'Network', href: '/network',
    items: [
      { key: 'connections', label: 'My Network', href: '/network', members: true },
      { key: 'discover', label: 'Discover People', href: '/musicians' },
    ],
    cta: { label: 'Messages', href: '/network?messages=1', signedOut: signIn('/network'), action: ['data-open-messages', 'private'] },
  },
  collective: {
    key: 'collective', name: 'Collective', href: '/collective',
    items: [
      { key: 'about', label: 'About', href: '/collective' },
      { key: 'community', label: 'Community', href: '/community' },
      { key: 'summit', label: 'The Summit', href: '/summit' },
    ],
    cta: { label: 'Join Opus', href: '/sign-up' },
  },
};

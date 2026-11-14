export const SITE = {
  name: 'Opus Collective',
  /** The platform's product name, used in page titles and the app. The organization name stays in the footer, About and legal pages. */
  product: 'Opus',
  url: 'https://opuscollect.net',
  motto: 'The Future. The Legacy. The Sound.',
  /** Broader brand statement (the homepage headline until 2026-11-14). Kept for other contexts. */
  statement: 'The future of music is independent.',
  /** Homepage headline. */
  headline: 'Your world of music.',
  /** Homepage hero (Bogo, 2026-11-14 later): the product name, its promise, and one supporting line. */
  promise: 'The world is within reach.',
  supporting: 'Create connections that create opportunity.',
  description:
    'Opus Collective is the professional network for independent music. Discover artists, producers, engineers and songwriters, and earn Opus Verified recognition.',
  location: 'Birmingham, AL',
};

export interface NavLink { label: string; href: string; soon?: boolean; external?: boolean }
/** A product that lives inside a nav area (Studios and Venues in World, Airplay in Works, Events in Future). */
export interface NavProduct { label: string; href: string; line: string; soon?: boolean }
export interface NavItem { label: string; href: string; lead: string; products?: NavProduct[]; groups: { title: string; links: NavLink[] }[]; soon?: boolean }

/**
 * Main navigation (Milestone 1, 2026-11-14): ten products in six areas, so the header never crowds.
 *   World (Studios, Venues) · Works (Airplay) · Future (Events) · Charts · Network · Collective
 * Desktop: six words, each opening a panel that leads with its products. Phones: all ten products, the ones
 * inside an area listed under it. Products still in development say "Coming soon" and open a page that says so.
 */
export const NAV: NavItem[] = [
  {
    label: 'World', href: '/world', lead: 'The people, studios and stages behind the music, on one map.',
    products: [
      { label: 'Studios', href: '/studios', line: 'Find your next session.' },
      { label: 'Venues', href: '/venues', line: 'Find your stage.', soon: true },
    ],
    groups: [
      { title: 'Explore', links: [
        { label: 'Open the map', href: '/world' },
        { label: 'People', href: '/musicians' },
        { label: 'Organizations', href: '/organizations' },
      ] },
      { title: 'Cities', links: [
        { label: 'Birmingham', href: '/world/birmingham' },
        { label: 'Atlanta', href: '/world/atlanta' },
        { label: 'Los Angeles', href: '/world/los-angeles' },
        { label: 'London', href: '/world/london' },
      ] },
      { title: 'Trust', links: [
        { label: 'Opus Verified', href: '/verified' },
        { label: 'Verified members', href: '/world?verified=1' },
        { label: 'List your studio', href: '/business' },
      ] },
    ],
  },
  {
    label: 'Works', href: '/works', lead: 'Your work speaks for itself: releases, credits, portfolio and achievements.',
    products: [
      { label: 'Airplay', href: '/airplay', line: 'Get your music heard.', soon: true },
    ],
    groups: [
      { title: 'Your work', links: [
        { label: 'My works', href: '/works' },
        { label: 'Start a release', href: '/start' },
        { label: 'Portfolio and achievements', href: '/account/profile' },
      ] },
      { title: 'Discover', links: [
        { label: 'Releases', href: '/releases' },
      ] },
    ],
  },
  {
    label: 'Future', href: '/future', lead: 'What’s ahead for you, and for all of us.',
    products: [
      { label: 'Events', href: '/events', line: 'Make something happen.' },
    ],
    groups: [
      { title: 'Future', links: [
        { label: 'My Future', href: '/future' },
        { label: 'Our Future', href: '/future?tab=our' },
      ] },
      { title: 'Events', links: [
        { label: 'Create an event', href: '/events/new' },
        { label: 'The Opus Summit', href: '/summit' },
      ] },
    ],
  },
  {
    label: 'Charts', href: '/charts', lead: 'Rising artists, city by city. No pay-to-rank.', soon: true,
    groups: [
      { title: 'Opus Charts', links: [
        { label: 'About Charts', href: '/charts', soon: true },
      ] },
    ],
  },
  {
    label: 'Network', href: '/network', lead: 'Your connections, inquiries and collaborations.', soon: true,
    groups: [
      { title: 'Network', links: [
        { label: 'Connections', href: '/account/connections' },
        { label: 'Bookings', href: '/account/bookings' },
        { label: 'Messages and inquiries', href: '/network', soon: true },
      ] },
    ],
  },
  {
    label: 'Collective', href: '/collective', lead: 'The people and the culture around Opus.',
    groups: [
      { title: 'Opus Collective', links: [
        { label: 'About the Collective', href: '/collective' },
        { label: 'Community programs', href: '/community' },
        { label: 'The Opus Summit', href: '/summit' },
      ] },
    ],
  },
];

/** Signed-in account menu. Business and settings live here, not in the main nav. */
export const ACCOUNT_MENU = [
  { label: 'Your profile', href: '/account/profile' },
  { label: 'Your works', href: '/works' },
  { label: 'My Future', href: '/future' },
  { label: 'Connections', href: '/account/connections' },
  { label: 'Bookings', href: '/account/bookings' },
  { label: 'Business dashboard', href: '/business' },
  { label: 'Account settings', href: '/account' },
];

export const ACCOUNT = {
  signIn: { label: 'Sign In', href: '/sign-in' },
  join: { label: 'Join Opus', href: '/sign-up' },
};

export const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/opuscollect_/' },
  { label: 'YouTube', href: 'https://www.youtube.com/@TheOpusCollective' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@opuscollective' },
  { label: 'SoundCloud', href: 'https://soundcloud.com/opuscollective' },
  { label: 'Discord', href: 'https://discord.gg/QudUMNB5yP' },
];

/** Footer: one short row. Everything else is reachable from the header or from these pages. */
export const FOOTER_NAV = [
  { label: 'World', href: '/world' },
  { label: 'Opus Verified', href: '/verified' },
  { label: 'Opus Collective', href: '/collective' },
  { label: 'Events', href: '/events' },
  { label: 'About', href: '/about' },
];

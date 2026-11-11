export const SITE = {
  name: 'Opus Collective',
  /** The platform's product name, used in page titles and the app. The organization name stays in the footer, About and legal pages. */
  product: 'Opus',
  url: 'https://opuscollect.net',
  motto: 'The Future. The Legacy. The Sound.',
  description:
    'Opus Collective is the professional network for independent music. Discover artists, producers, engineers and songwriters, and earn Opus Verified recognition.',
  location: 'Birmingham, AL',
};

export interface NavLink { label: string; href: string; soon?: boolean; external?: boolean }
export interface NavItem { label: string; href: string; lead: string; groups: { title: string; links: NavLink[] }[]; soon?: boolean }

/**
 * Main navigation: every product area, Apple-style. Hovering an item on desktop opens a panel with its parts.
 * Areas still in development say "Coming soon" in their panel and open a page that says so.
 */
export const NAV: NavItem[] = [
  {
    label: 'Opus World', href: '/world', lead: 'The people and places behind the music, on one map.',
    groups: [
      { title: 'Explore', links: [
        { label: 'Musicians', href: '/world?type=musician' },
        { label: 'Studios', href: '/world?type=studio' },
        { label: 'Organizations', href: '/world?type=organization' },
        { label: 'Open the map', href: '/world' },
      ] },
      { title: 'Cities', links: [
        { label: 'Birmingham', href: '/world?city=Birmingham' },
        { label: 'Atlanta', href: '/world?city=Atlanta' },
        { label: 'Los Angeles', href: '/world?city=Los%20Angeles' },
        { label: 'London', href: '/world?city=London' },
      ] },
    ],
  },
  {
    label: 'Studios', href: '/world?type=studio', lead: 'Find a room and request a session.',
    groups: [
      { title: 'Book', links: [
        { label: 'All studios', href: '/world?type=studio' },
        { label: 'Commercial studios', href: '/world?type=studio&studio=commercial' },
        { label: 'Home studios', href: '/world?type=studio&studio=home' },
        { label: 'Remote sessions', href: '/world?type=studio&studio=remote' },
      ] },
      { title: 'Studio owners', links: [
        { label: 'List your studio', href: '/business' },
      ] },
    ],
  },
  {
    label: 'Verified', href: '/verified', lead: 'Recognition that is earned, never bought.',
    groups: [
      { title: 'Opus Verified', links: [
        { label: 'How it works', href: '/verified' },
        { label: 'Verified members', href: '/world?verified=1' },
      ] },
    ],
  },
  {
    label: 'Charts', href: '/charts', lead: 'Rising artists, city by city. No pay-to-rank.', soon: true,
    groups: [
      { title: 'Opus Charts', links: [
        { label: 'About Opus Charts', href: '/charts', soon: true },
      ] },
    ],
  },
  {
    label: 'Releases', href: '/releases', lead: 'Hear the catalog. Plan your next release.',
    groups: [
      { title: 'Listen', links: [
        { label: 'The Opus Collective catalog', href: '/releases' },
      ] },
      { title: 'Make', links: [
        { label: 'Plan a release', href: '/music', soon: true },
      ] },
    ],
  },
  {
    label: 'Collective', href: '/collective', lead: 'The people and the culture around Opus.',
    groups: [
      { title: 'Opus Collective', links: [
        { label: 'About the Collective', href: '/collective' },
        { label: 'Community programs', href: '/community' },
        { label: 'Events', href: '/events' },
      ] },
    ],
  },
];

/** Signed-in account menu. Business and settings live here, not in the main nav. */
export const ACCOUNT_MENU = [
  { label: 'Your profile', href: '/account/profile' },
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
  { label: 'Opus World', href: '/world' },
  { label: 'Opus Verified', href: '/verified' },
  { label: 'Opus Collective', href: '/collective' },
  { label: 'Events', href: '/events' },
  { label: 'About', href: '/about' },
];

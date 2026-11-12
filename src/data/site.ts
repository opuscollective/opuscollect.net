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
 * Main navigation: five product areas, Apple-style. Hovering an item on desktop opens a panel with its parts.
 * Studios live under World, releases under Music, and Opus Verified is a trust feature inside World.
 * Areas still in development say "Coming soon" in their panel and open a page that says so.
 */
export const NAV: NavItem[] = [
  {
    label: 'World', href: '/world', lead: 'The people, studios and places behind the music, on one map.',
    groups: [
      { title: 'Explore', links: [
        { label: 'People', href: '/musicians' },
        { label: 'Studios', href: '/studios' },
        { label: 'Organizations', href: '/organizations' },
        { label: 'Open the map', href: '/world' },
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
    label: 'Music', href: '/music', lead: 'Start a release, credit the people you made it with, and hear the catalog.',
    groups: [
      { title: 'Your music', links: [
        { label: 'My releases', href: '/music' },
        { label: 'Start a release', href: '/music' },
        { label: 'Add past releases', href: '/music' },
      ] },
      { title: 'Listen', links: [
        { label: 'Releases', href: '/releases' },
      ] },
    ],
  },
  {
    label: 'Future', href: '/future', lead: 'What’s coming: your sessions, planned releases and Collective events.',
    groups: [
      { title: 'Your timeline', links: [
        { label: 'Everything coming up', href: '/future' },
        { label: 'Studio sessions', href: '/future?show=session' },
        { label: 'Planned releases', href: '/future?show=release' },
      ] },
      { title: 'Collective', links: [
        { label: 'Events', href: '/future?show=event' },
        { label: 'The Opus Summit', href: '/events#summit' },
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
        { label: 'Events', href: '/events' },
      ] },
    ],
  },
];

/** Signed-in account menu. Business and settings live here, not in the main nav. */
export const ACCOUNT_MENU = [
  { label: 'Your profile', href: '/account/profile' },
  { label: 'Your music', href: '/music' },
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

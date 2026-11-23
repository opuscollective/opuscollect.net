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
  /** Homepage hero, launch pass (brief 2026-11-21): the value of World on the first screen. */
  heroHeadline: 'Discover the people behind the music.',
  heroLine: 'Find artists, producers and engineers in your city. See their work. Connect.',
  description:
    'Opus Collective is the professional network for independent music. Discover artists, producers, engineers and songwriters, and earn Opus Verified recognition.',
  location: 'Birmingham, AL',
};

export interface NavLink { label: string; href: string; soon?: boolean; external?: boolean; /** Opens the Messages panel instead of navigating (when it is available). */ messages?: boolean; /** Shows the live count of pending connection requests. */ count?: 'requests' }
export interface NavItem { label: string; href: string; line: string; soon?: boolean; groups: { title?: string; links: NavLink[] }[] }

/**
 * Main navigation (Chunk 1.5, 2026-11-14): all ten Opus products, each directly in the header.
 * Desktop: one row; each word opens a compact panel sized to its links. Narrower screens move the
 * last few into "More" rather than squeezing the type. Phones: every product in the menu, nothing hover-only.
 * Products still in development say "Coming soon" and open a page that says so.
 */
export const NAV: NavItem[] = [
  {
    label: 'World', href: '/world', line: 'The people, studios and stages behind the music, on one map.',
    groups: [
      { title: 'Explore', links: [
        { label: 'Open the map', href: '/world' },
        { label: 'People', href: '/musicians' },
        { label: 'Groups', href: '/clans' },
        { label: 'Verified members', href: '/world?verified=1' },
      ] },
      { title: 'Cities', links: [
        { label: 'Birmingham', href: '/world/birmingham' },
        { label: 'Atlanta', href: '/world/atlanta' },
        { label: 'Los Angeles', href: '/world/los-angeles' },
        { label: 'London', href: '/world/london' },
        { label: 'My Cities', href: '/world/cities' },
      ] },
    ],
  },
  {
    label: 'Works', href: '/works', line: 'Everything you’ve created. One place.',
    groups: [{ links: [
      { label: 'Overview', href: '/works' },
      { label: 'Explore Works', href: '/works/explore' },
      { label: 'My Works', href: '/works/mine' },
      { label: 'Add Work', href: '/works?add=1' },
      { label: 'Opus Collective catalog', href: '/releases' },
    ] }],
  },
  {
    label: 'Studios', href: '/studios', line: 'Find your next session.',
    groups: [{ links: [
      { label: 'Find a studio', href: '/studios' },
      { label: 'Your bookings', href: '/account/bookings' },
      { label: 'List your studio', href: '/business' },
    ] }],
  },
  {
    label: 'Venues', href: '/venues', line: 'Find your stage.', soon: true,
    groups: [{ links: [
      { label: 'What’s coming', href: '/venues' },
      { label: 'Create an event at a venue', href: '/events/new' },
    ] }],
  },
  {
    label: 'Events', href: '/events', line: 'Make something happen.',
    groups: [{ links: [
      { label: 'Upcoming events', href: '/events' },
      { label: 'Create an event', href: '/events/new' },
      { label: 'The Opus Summit', href: '/summit' },
    ] }],
  },
  {
    label: 'Airplay', href: '/airplay', line: 'Get your music heard.', soon: true,
    groups: [{ links: [
      { label: 'What’s coming', href: '/airplay' },
      { label: 'Get your works ready', href: '/works' },
    ] }],
  },
  {
    label: 'Future', href: '/future', line: 'What’s ahead for you, and for all of us.',
    groups: [{ links: [
      { label: 'My Future', href: '/future?tab=mine' },
      { label: 'Our Future', href: '/future?tab=our' },
      { label: 'Create an event', href: '/events/new' },
    ] }],
  },
  {
    label: 'Charts', href: '/charts', line: 'Every city has a sound. No pay-to-rank.', soon: true,
    groups: [{ links: [
      { label: 'About Charts', href: '/charts' },
    ] }],
  },
  {
    label: 'Network', href: '/network', line: 'Turn discovery into working relationships.',
    groups: [{ links: [
      { label: 'Discover people', href: '/musicians' },
      { label: 'My connections', href: '/network' },
      { label: 'Received requests', href: '/network?tab=received', count: 'requests' },
      { label: 'Sent requests', href: '/network?tab=sent' },
      { label: 'Messages', href: '/network?messages=1', messages: true },
    ] }],
  },
  {
    label: 'Collective', href: '/collective', line: 'Beyond the platform.',
    groups: [{ links: [
      { label: 'About the Collective', href: '/collective' },
      { label: 'Community programs', href: '/community' },
      { label: 'The Opus Summit', href: '/summit' },
    ] }],
  },
];

/** Signed-in account menu. Business and settings live here, not in the main nav. */
/** The Create menu (signed in): start something new. First in the account menu on desktop and phones. */
/** The header shows World and Network (Bogo 2026-11-23: Works is out of the header for launch; its pages stay reachable by URL and the footer). */
export const HEADER_NAV = (): NavItem[] => NAV.filter((n) => n.label === 'World' || n.label === 'Network');

export const CREATE_MENU = [
  { label: 'Create a group', href: '/clans/new' },
  { label: 'Create an event', href: '/events/new' },
  { label: 'Add Work', href: '/works?add=1' },
];

export const ACCOUNT_MENU = [
  { label: 'Your profile', href: '/account/profile' },
  { label: 'My groups', href: '/clans/mine' },
  { label: 'Your works', href: '/works/mine' },
  { label: 'My Future', href: '/future' },
  { label: 'My Network', href: '/network' },
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
  { label: 'Works', href: '/works' },
  { label: 'Studios', href: '/studios' },
  { label: 'Venues', href: '/venues' },
  { label: 'Events', href: '/events' },
  { label: 'Airplay', href: '/airplay' },
  { label: 'Future', href: '/future' },
  { label: 'Charts', href: '/charts' },
  { label: 'Network', href: '/network' },
  { label: 'Opus Collective', href: '/collective' },
  { label: 'Opus Verified', href: '/verified' },
  { label: 'About', href: '/about' },
];

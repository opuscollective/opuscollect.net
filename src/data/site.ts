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

/**
 * Main navigation: only what works today, so nothing in the header is a dead end.
 * Charts, Network and Music join the header as each one ships (their pages already exist and say so).
 */
export const NAV = [
  { label: 'Discover', href: '/world', icon: 'globe', blurb: 'People by specialty and city, on the map or as a list' },
  { label: 'Studios', href: '/world?type=studio', icon: 'mic', blurb: 'Commercial and home studios you can book' },
  { label: 'Verified', href: '/verified', icon: 'shield', blurb: 'What Opus Verified means and how to earn it' },
  { label: 'Community', href: '/community', icon: 'users', blurb: 'Opus Collective, events and the Discord' },
] as const;

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

export const FOOTER_NAV = [
  {
    title: 'Opus',
    links: [
      { label: 'Opus World', href: '/world' },
      { label: 'Studios', href: '/world?type=studio' },
      { label: 'Opus Charts', href: '/charts' },
      { label: 'Opus Verified', href: '/verified' },
      { label: 'Trusted services', href: '/services' },
    ],
  },
  {
    title: 'Opus Collective',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Events', href: '/events' },
      { label: 'Releases', href: '/releases' },
      { label: 'Community', href: '/community' },
    ],
  },
  {
    title: 'Membership',
    links: [
      { label: 'Join Opus', href: '/sign-up' },
      { label: 'Sign in', href: '/sign-in' },
      { label: 'Business dashboard', href: '/business' },
    ],
  },
];

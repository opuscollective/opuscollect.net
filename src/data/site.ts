export const SITE = {
  name: 'Opus Collective',
  url: 'https://opuscollect.net',
  motto: 'The Future. The Legacy. The Sound.',
  description:
    'Opus Collective is the professional network for independent music. Discover artists, producers, engineers and songwriters, and earn Opus Verified recognition.',
  location: 'Birmingham, AL',
};

/** Routes that are not built yet point at an "in development" page, never a 404. */
export const NAV = [
  { label: 'Opus World', href: '/world' },
  { label: 'Verified', href: '/verified' },
  { label: 'Services', href: '/services' },
  { label: 'Events', href: '/events.html' },
  { label: 'About', href: '/about.html' },
];

export const ACCOUNT = {
  signIn: { label: 'Sign In', href: '/sign-in' },
  join: { label: 'Join Opus', href: '/join.html' },
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
    title: 'Directory',
    links: [
      { label: 'Opus World', href: '/world' },
      { label: 'Studios', href: '/world?type=studio' },
      { label: 'Opus Verified', href: '/verified' },
      { label: 'Trusted services', href: '/services' },
    ],
  },
  {
    title: 'Opus',
    links: [
      { label: 'About', href: '/about.html' },
      { label: 'Events', href: '/events.html' },
      { label: 'Releases', href: '/releases.html' },
      { label: 'Community', href: '/community.html' },
    ],
  },
  {
    title: 'Membership',
    links: [
      { label: 'Join Opus', href: '/join.html' },
      { label: 'Sign in', href: '/sign-in' },
    ],
  },
];

/**
 * Opus Music vocabulary: release types, credit roles and moods.
 * Keys are stored in the database. Never rename a key; change the label instead.
 */
import type { Specialty } from './specialties';

export const RELEASE_KINDS = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape' } as const;
export type ReleaseKind = keyof typeof RELEASE_KINDS;

/**
 * Credit roles. `finds` is the specialty to search World for when a release needs this role,
 * so "I need a mixing engineer" searches Mixing Engineers.
 */
export const CREDIT_ROLES = {
  'primary-artist': { label: 'Primary Artist', finds: ['recording-artist', 'vocalist'] },
  'featured-artist': { label: 'Featured Artist', finds: ['recording-artist', 'vocalist'] },
  producer: { label: 'Producer', finds: ['producer'] },
  'co-producer': { label: 'Co-Producer', finds: ['producer'] },
  songwriter: { label: 'Songwriter', finds: ['songwriter'] },
  vocalist: { label: 'Vocalist', finds: ['vocalist'] },
  instrumentalist: { label: 'Instrumentalist', finds: ['instrumentalist'] },
  arranger: { label: 'Arranger', finds: ['arranger', 'composer'] },
  'recording-engineer': { label: 'Recording Engineer', finds: ['audio-engineer'] },
  'mixing-engineer': { label: 'Mixing Engineer', finds: ['mixing-engineer'] },
  'mastering-engineer': { label: 'Mastering Engineer', finds: ['mastering-engineer'] },
  'executive-producer': { label: 'Executive Producer', finds: [] },
  artwork: { label: 'Artwork & Design', finds: [] },
  'video-director': { label: 'Video Director', finds: [] },
} as const satisfies Record<string, { label: string; finds: readonly Specialty[] }>;
export type CreditRole = keyof typeof CREDIT_ROLES;
export const CREDIT_ROLE_KEYS = Object.keys(CREDIT_ROLES) as CreditRole[];
export const isCreditRole = (v: unknown): v is CreditRole => typeof v === 'string' && v in CREDIT_ROLES;
export const roleLabel = (r: string) => (isCreditRole(r) ? CREDIT_ROLES[r].label : r);

/** The vibe of a release. Members pick up the moods of the releases they're confirmed on. */
export const MOODS = [
  'Atmospheric', 'Dark', 'Dreamy', 'Energetic', 'Experimental', 'Gritty', 'Hype', 'Introspective', 'Laid-back',
  'Melodic', 'Moody', 'Nostalgic', 'Romantic', 'Smooth', 'Soulful', 'Spiritual', 'Triumphant', 'Uplifting',
] as const;
export type Mood = (typeof MOODS)[number];

export const RELEASE_LINK_KEYS = ['spotify', 'appleMusic', 'youtube', 'soundcloud', 'other'] as const;
export type ReleaseLinkKey = (typeof RELEASE_LINK_KEYS)[number];
export const RELEASE_LINK_LABEL: Record<ReleaseLinkKey, string> = {
  spotify: 'Spotify', appleMusic: 'Apple Music', youtube: 'YouTube', soundcloud: 'SoundCloud', other: 'Other link',
};

export const LIMITS = { genres: 3, moods: 5, tracks: 40, credits: 120, releases: 200 } as const;

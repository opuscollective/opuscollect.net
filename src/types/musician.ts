/**
 * Musician profile model.
 * Shaped to map 1:1 onto a future Cloudflare D1 `profiles` table (Phase 3).
 * Verification lives in its own record so it can be granted, reviewed and revoked
 * independently of membership tier. Premium never implies verified.
 */
export type Discipline =
  | 'recording-artist'
  | 'producer'
  | 'audio-engineer'
  | 'songwriter'
  | 'multi-disciplinary';

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'revoked';

export type MembershipTier = 'free' | 'premium';

export interface Location {
  city: string;
  region?: string; // state / province
  country: string; // ISO 3166-1 alpha-2
}

export interface ExternalLinks {
  spotify?: string;
  appleMusic?: string;
  soundcloud?: string;
  youtube?: string;
  instagram?: string;
  website?: string;
}

export interface Musician {
  id: string;
  username: string; // unique, URL-safe: /m/{username}
  displayName: string;
  photo?: { src: string; alt: string };
  location: Location;
  disciplines: Discipline[];
  genres: string[];
  bio?: string;
  verification: VerificationStatus;
  tier: MembershipTier;
  openToCollab: boolean;
  links?: ExternalLinks;
  /** True for development sample data. Rendered with a visible label. Never ship to production as real. */
  isPlaceholder?: boolean;
}

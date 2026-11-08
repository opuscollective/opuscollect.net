/**
 * Opus World data model.
 * Every listing on the map is one of three kinds. The shapes are designed to map
 * onto Cloudflare D1 tables (profiles, studios, organizations) in Phase 3.
 *
 * Rules baked into the model:
 * - Verification is its own field and is never derived from a paid plan.
 * - Home studio coordinates are stored at "approximate" precision for public display.
 *   The exact address lives in a private table and is only disclosed in a confirmed booking.
 */
import type { Specialty } from '@/data/specialties';

export type ListingKind = 'musician' | 'studio' | 'organization';

export interface GeoPoint {
  city: string;
  region?: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  /** 'approximate' means the point is offset to protect a private address. */
  precision: 'exact' | 'approximate';
}

/** Musician: earned recognition. Studio: two-step verification. */
export type MusicianVerification = 'none' | 'pending' | 'verified' | 'revoked';
export type StudioVerification = 'none' | 'identity' | 'studio';

interface ListingBase {
  id: string;
  kind: ListingKind;
  slug: string;
  name: string;
  location: GeoPoint;
  /** Development sample data. Always rendered with a visible "Sample" label. */
  isSample?: boolean;
}

export interface MusicianListing extends ListingBase {
  kind: 'musician';
  primarySpecialty: Specialty;
  /** Additional specialties, not including the primary one. */
  specialties: Specialty[];
  genres: string[];
  verification: MusicianVerification;
  openToCollab: boolean;
  highlight?: string; // short achievement line, shown on the card
}

export type StudioType = 'commercial' | 'home';
/** Future paid plans. Plan never affects verification. No billing is implemented. */
export type StudioPlan = 'none' | 'listing' | 'pro';

export interface StudioListing extends ListingBase {
  kind: 'studio';
  studioType: StudioType;
  services: string[];
  equipment: string[];
  hourlyRate?: { amount: number; currency: string };
  verification: StudioVerification;
  plan: StudioPlan;
  acceptsBookingRequests: boolean;
}

export type OrganizationCategory = 'label' | 'management' | 'collective' | 'marketing' | 'other';

export interface OrganizationListing extends ListingBase {
  kind: 'organization';
  category: OrganizationCategory;
  services: string[];
  verified: boolean;
}

export type Listing = MusicianListing | StudioListing | OrganizationListing;

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
  country: string; // ISO 3166-1 alpha-2 ('' when hidden)
  countryName?: string;
  /** Public centre point. 0,0 when precision is 'region' or 'hidden' (never placed on the map). */
  lat: number;
  lng: number;
  /**
   * 'approximate': a public city or metro centre, never an address.
   * 'region': the member shows only their state or country.
   * 'hidden': the member shows no location at all.
   */
  precision: 'exact' | 'approximate' | 'region' | 'hidden';
}

/** How precisely a member's location is shown. Enforced by the API. */
export type LocationVisibility = 'city' | 'metro' | 'region' | 'hidden';
/** True when the listing has a public point that may be drawn on the map. */
export const hasPoint = (l: { location: GeoPoint }) => l.location.precision === 'approximate' || l.location.precision === 'exact';

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
  /** Public profile URL and photo for real members. */
  href?: string;
  photo?: string;
  /**
   * The metro-area point this listing counts toward when the globe is zoomed out
   * (e.g. Hoover → Birmingham). Absent when the listing is already at metro level.
   */
  metro?: { name: string; lat: number; lng: number };
  /** False when the member chose not to appear on the map. They still appear in list results. */
  onMap?: boolean;
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

/** Reviews are not built yet. Present only when real reviews exist; never invented. */
export interface Rating { value: number; count: number }

export type StudioType = 'commercial' | 'home' | 'remote';
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
  /** Real studios: the lowest active service price, already formatted (e.g. "$85"). */
  priceFrom?: string;
  /** Wide cover photo, when the studio uploaded one. */
  cover?: string;
  rating?: Rating;
}

export type OrganizationCategory = 'label' | 'management' | 'collective' | 'marketing' | 'other';

export interface OrganizationListing extends ListingBase {
  kind: 'organization';
  category: OrganizationCategory;
  services: string[];
  verified: boolean;
  /** One or two sentences for the card. */
  summary?: string;
  cover?: string;
}

export type Listing = MusicianListing | StudioListing | OrganizationListing;

/** Display labels for organization categories. */
export const ORG_CATEGORY_LABEL: Record<OrganizationCategory, string> = {
  label: 'Label', management: 'Management', collective: 'Collective', marketing: 'Agency', other: 'Organization',
};

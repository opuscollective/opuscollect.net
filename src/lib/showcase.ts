/**
 * The curated showcase on a profile: several works leading the page, each with the member's own line.
 * It is reserved for Verified members (the Founder is verified). Everyone else leads with one
 * Featured work. Picks saved before verification stay in storage and return once the member is verified.
 *
 * Named "Signatures" by Bogo (2026-11-24; it was "Essentials", Apple Music's word). The name lives here only.
 * Storage keys still say `essentials` so saved picks carry over. No minimum number of works: one Signature must look deliberate.
 */
export const SHOWCASE = { name: 'Signatures', one: 'Signature', featured: 'Featured work' } as const;

export const canShowcase = (verification: string | null | undefined) => verification === 'verified';

/** What leads the page: the full list for Verified members, otherwise the one work they chose (none chosen means their latest). */
export function showcasePicks(page: { essentials: string[]; featured: string | null }, verified: boolean): { full: string[]; featured: string | null } {
  return verified ? { full: page.essentials, featured: page.essentials[0] ?? page.featured } : { full: [], featured: page.featured };
}

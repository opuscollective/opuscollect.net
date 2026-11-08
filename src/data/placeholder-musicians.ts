import type { Musician } from '@/types/musician';

/**
 * PLACEHOLDER DATA — development only.
 * These are not real people and not Opus members. Every card built from this
 * data shows a visible "Placeholder" label. Replace with real, consenting
 * members (or D1 queries) before launch. No photos are used on purpose:
 * the cards render a neutral photo slot instead of fake faces.
 */
export const PLACEHOLDER_MUSICIANS: Musician[] = [
  {
    id: 'ph-01', username: 'sample-artist-01', displayName: 'Sample Artist 01',
    location: { city: 'Birmingham', region: 'AL', country: 'US' },
    disciplines: ['recording-artist', 'songwriter'], genres: ['R&B', 'Alternative'],
    verification: 'verified', tier: 'free', openToCollab: true, isPlaceholder: true,
  },
  {
    id: 'ph-02', username: 'sample-producer-02', displayName: 'Sample Producer 02',
    location: { city: 'Atlanta', region: 'GA', country: 'US' },
    disciplines: ['producer'], genres: ['Hip-Hop', 'Trap'],
    verification: 'none', tier: 'free', openToCollab: true, isPlaceholder: true,
  },
  {
    id: 'ph-03', username: 'sample-engineer-03', displayName: 'Sample Engineer 03',
    location: { city: 'London', country: 'GB' },
    disciplines: ['audio-engineer'], genres: ['Afrobeats', 'Pop'],
    verification: 'verified', tier: 'free', openToCollab: false, isPlaceholder: true,
  },
  {
    id: 'ph-04', username: 'sample-writer-04', displayName: 'Sample Writer 04',
    location: { city: 'Nashville', region: 'TN', country: 'US' },
    disciplines: ['songwriter', 'multi-disciplinary'], genres: ['Country', 'Indie'],
    verification: 'none', tier: 'free', openToCollab: true, isPlaceholder: true,
  },
];

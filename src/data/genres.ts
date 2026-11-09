/** Genre list for profiles and filters. Kept separate from Specialty. Members can pick several. */
export const GENRES = [
  'Afro-fusion', 'Afro-house', 'Afrobeats', 'Alternative', 'Amapiano', 'Americana', 'Blues', 'Classical', 'Country',
  'Dance', 'Dancehall', 'Drill', 'Electronic', 'Folk', 'Funk', 'Gospel', 'Grime', 'Highlife', 'Hip-Hop', 'House',
  'Indie', 'Jazz', 'K-Pop', 'Latin', 'Lo-fi', 'Metal', 'MPB', 'Neo-Soul', 'Pop', 'Punk', 'R&B', 'Reggae', 'Reggaeton',
  'Rock', 'Soul', 'Soundtrack', 'Techno', 'Trap', 'UK Rap', 'World',
] as const;
export type Genre = (typeof GENRES)[number];

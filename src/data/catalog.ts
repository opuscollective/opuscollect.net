/**
 * The Opus Collective catalog: releases by Collective artists, shown on the v23 site and the homepage.
 * Artwork is the artists' own, published by Opus Collective. Use these only to present the Collective's catalog,
 * always with the title and artist, never as a member's Opus record (those come from the database).
 */
export interface CatalogItem { title: string; artist: string; cover: string; href: string }
export const CATALOG: CatalogItem[] = [
  { title: 'Scenic', artist: 'Bogo', cover: '/images/releases/card/scenic-900.jpg', href: '/releases' },
  { title: 'Amazing', artist: 'Bogo', cover: '/images/releases/card/amazing-900.jpg', href: '/releases' },
  { title: 'luciaism', artist: 'NUGGET!', cover: '/images/releases/card/luciaism-900.jpg', href: '/releases' },
  { title: 'But I want you to know me', artist: 'Estephanie', cover: '/images/releases/but-i-want-you-to-know-me.jpg', href: '/releases' },
  { title: 'Eternal Dream', artist: 'Natalie Chludz', cover: '/images/releases/eternal-dream.jpg', href: '/releases' },
  { title: 'Old Me', artist: 'Exlines', cover: '/images/releases/old-me.jpg', href: '/releases' },
  { title: '4x3', artist: 'jayx3 & 403gon', cover: '/images/releases/4x3.jpg', href: '/releases' },
  { title: 'saving grace', artist: 'chrme.shwty & Natalie Chludz', cover: '/images/releases/saving-grace.jpg', href: '/releases' },
];

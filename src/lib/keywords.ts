/**
 * Keyword search for World: every meaningful word must appear somewhere in a listing.
 * Filler and goal words ("find", "for my next single") are ignored, so a sentence typed into
 * the homepage box still searches on its real terms ("producer atlanta").
 * Plain string matching only. The Opus guide (structured intents) replaces this for sentences later.
 */
const IGNORE = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'near', 'around', 'based',
  'i', "i'm", 'im', 'me', 'my', 'we', 'our', 'us', 'you', 'your', 'who', 'that', 'can', 'some', 'someone', 'somebody', 'anyone',
  'find', 'finding', 'looking', 'look', 'search', 'searching', 'need', 'needs', 'want', 'hire', 'hiring', 'book', 'get', 'help', 'work',
  'new', 'next', 'first', 'single', 'song', 'songs', 'track', 'tracks', 'album', 'ep', 'record', 'project', 'release',
]);

/** Lowercased words worth matching, with punctuation removed. */
export function keywordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^\p{L}\p{N}'&-]+/u)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 0 && !IGNORE.has(w));
}

/** True when every token appears in the haystack; a plural matches its singular ("producers"). */
export function matchesKeywords(haystack: string, tokens: string[]): boolean {
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t) || (t.length > 3 && t.endsWith('s') && hay.includes(t.slice(0, -1))));
}

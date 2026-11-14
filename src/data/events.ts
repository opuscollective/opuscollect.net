/**
 * Opus Collective events, as data, so they can appear in Future as well as on /events.
 * Only facts already announced on the Events page. No invented dates: an event without a
 * date says so, and a season ("Summer 2027") is shown as a season.
 */
export interface OpusEvent {
  id: string;
  title: string;
  place: string;
  /** What people see: an exact date, a season, or "Dates to be announced". */
  when: string;
  /** For ordering only (YYYY-MM-DD); null when no date has been announced. */
  sortDay: string | null;
  href: string;
}

export const EVENTS: OpusEvent[] = [
  { id: 'opus-summit-2027', title: 'The Opus Summit', place: '200 creatives, one retreat', when: 'Summer 2027', sortDay: '2027-06-21', href: '/events#summit' },
  { id: 'birmingham-conferences', title: 'Opus conferences', place: 'Birmingham, AL', when: 'Dates to be announced', sortDay: null, href: '/events' },
];

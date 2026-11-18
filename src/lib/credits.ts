/**
 * How much a credit can be trusted, in words people understand. Opus never calls a credit "verified":
 * - confirmed: someone else credited a member, and that member confirmed it on Opus.
 * - self: a member credited themselves (for example the role they chose when adding a work).
 * - pending: a member was credited and hasn't answered yet.
 * - listed: a name typed by the work's owner for someone who isn't on Opus.
 * Declined credits are never shown.
 */
export type CreditTrust = 'confirmed' | 'self' | 'pending' | 'listed';

export function creditTrust(c: { status: string; userId: string | null; createdBy: string | null }): CreditTrust {
  if (c.status === 'pending') return 'pending';
  if (c.status === 'unlinked' || !c.userId) return 'listed';
  return c.userId === c.createdBy ? 'self' : 'confirmed';
}

export const TRUST_LABEL: Record<CreditTrust, string> = {
  confirmed: 'Confirmed',
  self: 'Self-reported',
  pending: 'Awaiting confirmation',
  listed: 'Not on Opus',
};

export const TRUST_HELP: Record<CreditTrust, string> = {
  confirmed: 'Confirmed on Opus by the person credited.',
  self: 'Added by the member themselves.',
  pending: 'Sent to the member, who hasn’t answered yet.',
  listed: 'Named by the work’s owner. This person isn’t on Opus.',
};

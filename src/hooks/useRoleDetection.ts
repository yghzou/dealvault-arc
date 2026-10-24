/**
 * Given a connected wallet address and a loaded deal, returns which role(s)
 * the address holds in that deal. A single address can be multiple roles
 * (e.g. buyer and agent on a self-deal), so we return all matches.
 */

import { DealData } from './useDeal';

export type DetectedRole = 'buyer' | 'seller' | 'agent' | 'arbiter';

export interface RoleDetectionResult {
  roles: DetectedRole[];
  /** The "best" single role — first match in priority order: buyer > seller > arbiter > agent */
  primaryRole: DetectedRole | null;
}

export function detectRoles(
  address: string | undefined,
  deal: DealData | undefined,
): RoleDetectionResult {
  if (!address || !deal) return { roles: [], primaryRole: null };

  const addr = address.toLowerCase();
  const roles: DetectedRole[] = [];

  if (deal.buyer.toLowerCase() === addr) roles.push('buyer');
  if (deal.seller.toLowerCase() === addr) roles.push('seller');
  if (deal.arbiter.toLowerCase() === addr) roles.push('arbiter');
  if (deal.agent.toLowerCase() === addr) roles.push('agent');

  const priority: DetectedRole[] = ['buyer', 'seller', 'arbiter', 'agent'];
  const primaryRole = priority.find(r => roles.includes(r)) ?? null;

  return { roles, primaryRole };
}

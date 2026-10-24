/**
 * URL-based deal sharing: ?dealId=N&role=buyer|seller|agent|arbiter
 * Uses the current page origin so the link works on any host (preview, Netlify, etc.)
 */

export type ShareRole = 'buyer' | 'seller' | 'agent' | 'arbiter';

export interface ShareParams {
  dealId?: bigint;
  role?: ShareRole;
}

/** Read dealId and role from the current URL search params. */
export function readShareParams(): ShareParams {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  const rawId = sp.get('dealId');
  const rawRole = sp.get('role');
  return {
    dealId: rawId && /^\d+$/.test(rawId) ? BigInt(rawId) : undefined,
    role: (rawRole as ShareRole | null) ?? undefined,
  };
}

/** Build a shareable URL for a given deal + role. */
export function buildShareUrl(dealId: bigint, role: ShareRole): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?dealId=${dealId.toString()}&role=${role}`;
}

/** Replace the current URL search params without a page reload. */
export function setShareParams(params: ShareParams) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams();
  if (params.dealId !== undefined) sp.set('dealId', params.dealId.toString());
  if (params.role) sp.set('role', params.role);
  const qs = sp.toString();
  const next = window.location.pathname + (qs ? '?' + qs : '');
  window.history.replaceState({}, '', next);
}

/** Clear all share params from the URL (e.g. after navigation). */
export function clearShareParams() {
  window.history.replaceState({}, '', window.location.pathname);
}

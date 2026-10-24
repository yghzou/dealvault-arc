import { useState, useEffect, useCallback } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { ShoppingCart, Package, Scale, ExternalLink } from 'lucide-react';
import { BuyerPage } from './pages/BuyerPage';
import { SellerPage } from './pages/SellerPage';
import { ArbiterPage } from './pages/ArbiterPage';
import { ARC_CHAIN_ID, EQUIPMENT_ESCROW } from './contract';
import { buildAddressExplorerUrl } from './onchain-facts';
import { formatAddress } from './utils/format';
import { useDeal } from './hooks/useDeal';
import { detectRoles } from './hooks/useRoleDetection';
import { readShareParams, setShareParams, clearShareParams, ShareRole } from './hooks/useShareLink';
import { RoleDetectionBanner } from './components/RoleDetectionBanner';

type AppRole = 'buyer' | 'seller' | 'arbiter';

const ROLES: { id: AppRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'buyer',   label: 'Buyer',   icon: <ShoppingCart className="size-4" />, desc: 'Create deals, fund escrow, approve milestones' },
  { id: 'seller',  label: 'Seller',  icon: <Package      className="size-4" />, desc: 'Mark milestones complete, claim on timeout' },
  { id: 'arbiter', label: 'Arbiter', icon: <Scale        className="size-4" />, desc: 'Resolve disputes, distribute funds' },
];

/** Map a share-link role (which includes 'agent') to an app tab. Agent → seller. */
function shareRoleToAppRole(r: ShareRole): AppRole {
  if (r === 'agent') return 'seller';
  return r;
}

export default function App() {
  // ── Read URL params once on mount ────────────────────────────
  const initial = readShareParams();
  const [role, setRole] = useState<AppRole>(
    initial.role ? shareRoleToAppRole(initial.role) : 'buyer',
  );
  const [deepDealId, setDeepDealId] = useState<bigint | undefined>(initial.dealId);
  const [bannerDismissedForAddress, setBannerDismissedForAddress] = useState<string | undefined>(undefined);

  const { address, isConnected } = useAccount();

  // ── Load the deep-linked deal for role detection ─────────────
  const { deal: deepDeal } = useDeal(deepDealId);

  // ── Detect which roles the connected wallet holds ────────────
  const { roles: detectedRoles, primaryRole } = detectRoles(address, deepDeal);

  // ── Update URL when role or deepDealId changes ───────────────
  useEffect(() => {
    if (deepDealId) {
      setShareParams({ dealId: deepDealId, role: role });
    } else {
      clearShareParams();
    }
  }, [role, deepDealId]);

  // Derive: banner is dismissed if the user explicitly dismissed it FOR this address
  // OR if no address is connected yet (nothing to dismiss).

  const handleRoleSwitch = useCallback((r: AppRole) => {
    setRole(r);
    setBannerDismissedForAddress(address);
  }, [address]);

  // The banner shows when: wallet is connected, deal is loaded, wallet is in a
  // different role than the current tab, and the user hasn't dismissed it.
  // Banner dismissed when user clicked dismiss/switch FOR the current address
  const bannerDismissed = bannerDismissedForAddress === address;

  const showBanner =
    isConnected &&
    deepDeal !== undefined &&
    !bannerDismissed &&
    detectedRoles.length > 0 &&
    primaryRole !== null &&
    (primaryRole === 'agent' ? 'seller' : primaryRole) !== role;

  // Expose deepDealId setter so child pages can tell App which deal is open
  // (used when user navigates to a deal from within a role page)
  const handleDealOpen = useCallback((id: bigint | undefined) => {
    setDeepDealId(id);
  }, []);

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="display text-base font-bold" style={{ color: 'var(--ink)' }}>TradeEscrow</div>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>B2B Equipment Deals · Arc</div>
          </div>
          <ConnectKitButton />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Contract info */}
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <div>
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Contract</div>
            <div className="mono text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{formatAddress(EQUIPMENT_ESCROW.address)}</div>
          </div>
          <a
            href={buildAddressExplorerUrl(ARC_CHAIN_ID, EQUIPMENT_ESCROW.address)}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: 'var(--accent-hover)' }}
          >
            ArcScan <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Role auto-detection banner */}
        {showBanner && (
          <RoleDetectionBanner
            detectedRoles={detectedRoles}
            currentRole={role}
            onSwitch={handleRoleSwitch}
            onDismiss={() => setBannerDismissedForAddress(address)}
          />
        )}

        {/* Role tabs */}
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className="rounded-xl py-3 px-2 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: role === r.id ? 'var(--accent)' : 'var(--surface-strong)',
                border: `1px solid ${role === r.id ? 'transparent' : 'var(--border)'}`,
                color: role === r.id ? '#fff' : 'var(--ink)',
              }}
            >
              <div className="flex justify-center mb-1"
                style={{ color: role === r.id ? 'rgba(255,255,255,0.9)' : 'var(--muted)' }}>
                {r.icon}
              </div>
              <div className="text-xs font-semibold">{r.label}</div>
            </button>
          ))}
        </div>

        {/* Role description */}
        <p className="text-xs px-1" style={{ color: 'var(--muted)' }}>
          {ROLES.find(r => r.id === role)?.desc}
        </p>

        {/* Role pages — pass deep-linked dealId and open/close callback */}
        {role === 'buyer'   && <BuyerPage   initialDealId={deepDealId} onDealChange={handleDealOpen} />}
        {role === 'seller'  && <SellerPage  initialDealId={deepDealId} onDealChange={handleDealOpen} />}
        {role === 'arbiter' && <ArbiterPage initialDealId={deepDealId} onDealChange={handleDealOpen} />}

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Built on <a href="https://arc.io" target="_blank" rel="noreferrer" className="underline">Arc</a> · USDC escrow
          </p>
        </div>
      </main>
    </div>
  );
}

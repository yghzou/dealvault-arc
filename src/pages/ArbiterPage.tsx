import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { toast } from 'sonner';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { EQUIPMENT_ESCROW, ARC_CHAIN_ID } from '@/contract';
import { useDeal, useDealCount } from '@/hooks/useDeal';
import { formatUsdc, txUrl } from '@/utils/format';
import { DealTimeline, DealCard } from '@/components/DealTimeline';
import { TxButton } from '@/components/TxButton';
import { WithdrawButton } from '@/components/WithdrawButton';
import { ShareDealButton } from '@/components/ShareDealButton';

interface ArbiterPageProps {
  initialDealId?: bigint;
  onDealChange?: (id: bigint | undefined) => void;
}

function DealLoader({ dealId, arbiter, onSelect }: { dealId: bigint; arbiter: string; onSelect: (id: bigint) => void }) {
  const { deal } = useDeal(dealId);
  if (!deal || deal.arbiter.toLowerCase() !== arbiter.toLowerCase()) return null;
  return <DealCard dealId={dealId} deal={deal} onClick={() => onSelect(dealId)} />;
}

export function ArbiterPage({ initialDealId, onDealChange }: ArbiterPageProps) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID;
  const [dealIdInput, setDealIdInput] = useState('');
  const [view, setView] = useState<'list' | 'deal'>(() => initialDealId ? 'deal' : 'list');
  const [selectedDealId, setSelectedDealId] = useState<bigint | undefined>(initialDealId);

  // Notify parent when selected deal changes
  useEffect(() => {
    onDealChange?.(view === 'deal' ? selectedDealId : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDealId, view]);
  const [sellerShareInput, setSellerShareInput] = useState('5000');
  const { deal, refetch: refetchDeal } = useDeal(selectedDealId);
  const { data: totalDeals } = useDealCount();

  const { writeContract: doResolve, data: resolveHash, isPending: resolvePending } = useWriteContract();
  const { isLoading: resolveConfirming, isSuccess: resolveSuccess } = useWaitForTransactionReceipt({ hash: resolveHash });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (resolveSuccess && resolveHash) {
      toast.success(
        <span className="flex items-center gap-2">
          Dispute resolved!
          <a href={txUrl(resolveHash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline text-xs">
            View <ExternalLink className="size-3" />
          </a>
        </span>
      );
      void refetchDeal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveSuccess, resolveHash]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to manage disputes as an arbiter.</p>
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="rounded-2xl p-6 text-center space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Please switch to Arc.</p>
        <TxButton label="Switch to Arc" onClick={() => switchChain({ chainId: ARC_CHAIN_ID })} />
      </div>
    );
  }

  const dealIds = totalDeals
    ? Array.from({ length: Math.min(Number(totalDeals), 20) }, (_, i) => BigInt(Number(totalDeals) - i))
    : [];

  const sellerShareBps = Math.max(0, Math.min(10000, Number(sellerShareInput)));


  // Preview split amounts
  const remaining = deal
    ? deal.milestones.reduce((sum, m) => sum + (m.released ? 0n : m.amount), 0n)
    : 0n;
  const sellerGross = remaining * BigInt(sellerShareBps) / 10000n;
  const agentCut = deal ? sellerGross * deal.agentBps / 10000n : 0n;
  const sellerNet = sellerGross - agentCut;
  const buyerRefund = remaining - sellerGross;

  if (view === 'deal' && selectedDealId && deal) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setView('list'); onDealChange?.(undefined); }} className="flex items-center gap-1 text-sm" style={{ color: 'var(--accent-hover)' }}>
            <ChevronLeft className="size-4" /> Back to deals
          </button>
          <ShareDealButton dealId={selectedDealId} roles={['buyer', 'seller', 'arbiter']} />
        </div>
        <WithdrawButton onSuccess={() => { void refetchDeal(); }} />
        <DealTimeline dealId={selectedDealId} deal={deal} />

        {deal.arbiter.toLowerCase() === address?.toLowerCase() && deal.disputeOpen && (
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Resolve Dispute</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Set the seller's share of the remaining {formatUsdc(remaining)} USDC escrowed.
              </p>
            </div>

            {/* Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Seller Share</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {(sellerShareBps / 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={sellerShareBps}
                onChange={e => setSellerShareInput(e.target.value)}
                className="w-full"
              />
              <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                <span>0% (full refund)</span>
                <span>100% (full release)</span>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex gap-2">
              {[0, 3333, 5000, 6667, 10000].map(v => (
                <button
                  key={v}
                  onClick={() => setSellerShareInput(v.toString())}
                  className="flex-1 rounded-lg py-1 text-xs font-semibold transition-all"
                  style={{
                    background: sellerShareBps === v ? 'var(--accent)' : 'var(--surface-muted)',
                    color: sellerShareBps === v ? '#fff' : 'var(--ink-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {v === 0 ? 'Refund' : v === 5000 ? '50/50' : v === 10000 ? 'Seller' : `${(v / 100).toFixed(0)}%`}
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Settlement Preview</div>
              {[
                { label: 'Seller receives', val: sellerNet },
                { label: 'Agent receives', val: agentCut },
                { label: 'Buyer refunded', val: buyerRefund },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formatUsdc(val)} USDC
                  </span>
                </div>
              ))}
            </div>

            <TxButton
              label="Resolve Dispute"
              loadingLabel="Resolving..."
              isPending={resolvePending}
              isConfirming={resolveConfirming}
              className="w-full"
              onClick={() => doResolve({
                address: EQUIPMENT_ESCROW.address,
                abi: EQUIPMENT_ESCROW.abi,
                functionName: 'resolveDispute',
                args: [selectedDealId, BigInt(sellerShareBps)],
                chainId: ARC_CHAIN_ID,
              })}
            />
          </div>
        )}

        {deal.arbiter.toLowerCase() === address?.toLowerCase() && !deal.disputeOpen && (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No active dispute on this deal.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WithdrawButton />

      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--muted)' }}>Look up a deal by ID</label>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            value={dealIdInput}
            onChange={e => setDealIdInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Deal ID..."
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--ink)' }}
          />
          <TxButton
            label="View"
            disabled={!dealIdInput}
            onClick={() => {
              setSelectedDealId(BigInt(dealIdInput));
              setView('deal');
            }}
          />
        </div>
      </div>

      <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>Active Disputes</h2>
      {dealIds.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No deals found where you are the arbiter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dealIds.map(id => (
            <DealLoader key={id.toString()} dealId={id} arbiter={address ?? ''} onSelect={id => { setSelectedDealId(id); setView('deal'); }} />
          ))}
        </div>
      )}
    </div>
  );
}

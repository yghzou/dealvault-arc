import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { toast } from 'sonner';
import { ChevronLeft, CheckCircle2, Clock } from 'lucide-react';
import { EQUIPMENT_ESCROW, ARC_CHAIN_ID } from '@/contract';
import { useDeal, useDealCount, DEAL_STATUS } from '@/hooks/useDeal';
import { formatUsdc, formatCountdown } from '@/utils/format';
import { DealTimeline, DealCard } from '@/components/DealTimeline';
import { TxButton } from '@/components/TxButton';
import { WithdrawButton } from '@/components/WithdrawButton';
import { ShareDealButton } from '@/components/ShareDealButton';
import { MILESTONE_LABELS } from '@/contract';

const SESSION_NOW_S = BigInt(Math.floor(Date.now() / 1000));

interface SellerPageProps {
  initialDealId?: bigint;
  onDealChange?: (id: bigint | undefined) => void;
}

function DealLoader({ dealId, seller, onSelect }: { dealId: bigint; seller: string; onSelect: (id: bigint) => void }) {
  const { deal } = useDeal(dealId);
  if (!deal || deal.seller.toLowerCase() !== seller.toLowerCase()) return null;
  return <DealCard dealId={dealId} deal={deal} onClick={() => onSelect(dealId)} />;
}

export function SellerPage({ initialDealId, onDealChange }: SellerPageProps) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID;
  const [dealIdInput, setDealIdInput] = useState('');
  const [view, setView] = useState<'list' | 'deal'>(() => initialDealId ? 'deal' : 'list');
  const [selectedDealId, setSelectedDealId] = useState<bigint | undefined>(initialDealId);
  const { deal, refetch: refetchDeal } = useDeal(selectedDealId);
  const { data: totalDeals } = useDealCount();

  // Notify parent when selected deal changes
  useEffect(() => {
    onDealChange?.(view === 'deal' ? selectedDealId : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDealId, view]);

  // Accept deal
  const { writeContract: doAccept, data: acceptHash, isPending: accepting } = useWriteContract();
  const { isLoading: acceptConfirming, isSuccess: acceptSuccess } = useWaitForTransactionReceipt({ hash: acceptHash });

  // Complete milestone
  const { writeContract: doComplete0, data: h0, isPending: p0 } = useWriteContract();
  const { isLoading: c0, isSuccess: s0 } = useWaitForTransactionReceipt({ hash: h0 });
  const { writeContract: doComplete1, data: h1, isPending: p1 } = useWriteContract();
  const { isLoading: c1, isSuccess: s1 } = useWaitForTransactionReceipt({ hash: h1 });
  const { writeContract: doComplete2, data: h2, isPending: p2 } = useWriteContract();
  const { isLoading: c2, isSuccess: s2 } = useWaitForTransactionReceipt({ hash: h2 });

  // Claim milestone
  const { writeContract: doClaim0, data: ch0, isPending: cp0 } = useWriteContract();
  const { isLoading: cc0, isSuccess: cs0 } = useWaitForTransactionReceipt({ hash: ch0 });
  const { writeContract: doClaim1, data: ch1, isPending: cp1 } = useWriteContract();
  const { isLoading: cc1, isSuccess: cs1 } = useWaitForTransactionReceipt({ hash: ch1 });
  const { writeContract: doClaim2, data: ch2, isPending: cp2 } = useWriteContract();
  const { isLoading: cc2, isSuccess: cs2 } = useWaitForTransactionReceipt({ hash: ch2 });

  // Open dispute
  const { writeContract: doDispute, data: dh, isPending: dp } = useWriteContract();
  const { isLoading: dc, isSuccess: ds } = useWaitForTransactionReceipt({ hash: dh });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (acceptSuccess) { void refetchDeal(); toast.success('Deal accepted! Waiting for buyer to fund.'); }
    if (s0 || s1 || s2 || cs0 || cs1 || cs2 || ds) { void refetchDeal(); toast.success('Transaction confirmed!'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptSuccess, s0, s1, s2, cs0, cs1, cs2, ds]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to manage deals as a seller.</p>
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

  const now = SESSION_NOW_S;
  const dealIds = totalDeals
    ? Array.from({ length: Math.min(Number(totalDeals), 20) }, (_, i) => BigInt(Number(totalDeals) - i))
    : [];

  if (view === 'deal' && selectedDealId && deal) {
    const completeFns = [doComplete0, doComplete1, doComplete2];
    const completePending = [p0, p1, p2];
    const completeConfirming = [c0, c1, c2];
    const claimFns = [doClaim0, doClaim1, doClaim2];
    const claimPending = [cp0, cp1, cp2];
    const claimConfirming = [cc0, cc1, cc2];
    const isSeller = deal.seller.toLowerCase() === address?.toLowerCase();
    const isProposed = deal.status === DEAL_STATUS.Proposed;
    const isAccepted = deal.status === DEAL_STATUS.Accepted;
    const isActive = deal.status === DEAL_STATUS.Active;

    // Acceptance timeout: proposedAt + 3 days
    const acceptDeadline = deal.proposedAt + BigInt(3 * 24 * 3600);
    const acceptWindowOpen = now < acceptDeadline && now < deal.deadline;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setView('list'); onDealChange?.(undefined); }}
            className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--accent-hover)' }}
          >
            <ChevronLeft className="size-4" /> Back to deals
          </button>
          <ShareDealButton dealId={selectedDealId} />
        </div>

        <WithdrawButton onSuccess={() => { void refetchDeal(); }} />
        <DealTimeline dealId={selectedDealId} deal={deal} />

        {isSeller && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Seller Actions</h3>

            {/* ── Accept deal ─────────────────────────── */}
            {isProposed && (
              <div className="space-y-2">
                <div className="rounded-xl px-3 py-2.5 text-xs space-y-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                  <div className="font-semibold" style={{ color: 'var(--ink)' }}>Deal proposed — review before accepting</div>
                  <div style={{ color: 'var(--muted)' }}>
                    Total: <span className="tabular-nums font-semibold">{formatUsdc(deal.totalAmount)} USDC</span>
                    {' · '}Agent commission: {Number(deal.agentBps) / 100}%
                  </div>
                  <div style={{ color: 'var(--muted)' }}>
                    {acceptWindowOpen
                      ? <>Acceptance window closes in {formatCountdown(acceptDeadline)}</>
                      : <span style={{ color: 'var(--danger)' }}>Acceptance window expired — deal can be cancelled</span>
                    }
                  </div>
                </div>

                {/* Milestone breakdown */}
                <div className="space-y-1.5">
                  {deal.milestones.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-1">
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>{MILESTONE_LABELS[i]}</span>
                      <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{formatUsdc(m.amount)} USDC</span>
                    </div>
                  ))}
                </div>

                {acceptWindowOpen && (
                  <TxButton
                    label="Accept Deal Terms"
                    loadingLabel="Accepting..."
                    isPending={accepting}
                    isConfirming={acceptConfirming}
                    onClick={() => doAccept({
                      address: EQUIPMENT_ESCROW.address,
                      abi: EQUIPMENT_ESCROW.abi,
                      functionName: 'acceptDeal',
                      args: [selectedDealId],
                      chainId: ARC_CHAIN_ID,
                    })}
                  />
                )}
              </div>
            )}

            {/* ── Accepted: waiting for funding ──────── */}
            {isAccepted && (
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: '#1a804710', border: '1px solid #1a804730' }}>
                <Clock className="size-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                <span className="text-xs" style={{ color: 'var(--success)' }}>
                  You accepted — waiting for the buyer to fund the escrow
                </span>
              </div>
            )}

            {/* ── Active: milestones ──────────────────── */}
            {isActive && deal.milestones.map((m, i) => {
              const prevReleased = i === 0 || deal.milestones[i - 1].released;
              const canComplete = !m.released && m.completedAt === 0n && prevReleased && !deal.disputeOpen;
              const canClaim = !m.released && m.completedAt > 0n && !deal.disputeOpen && now >= m.completedAt + BigInt(7 * 24 * 3600);
              const awaitingApproval = !m.released && m.completedAt > 0n && !deal.disputeOpen;
              const claimIn = m.completedAt > 0n && !m.released ? m.completedAt + BigInt(7 * 24 * 3600) - now : 0n;

              return (
                <div key={i} className="space-y-1">
                  {canComplete && (
                    <TxButton
                      label={`Mark Complete: ${MILESTONE_LABELS[i]}`}
                      loadingLabel="Confirming..."
                      isPending={completePending[i]}
                      isConfirming={completeConfirming[i]}
                      className="w-full"
                      onClick={() => completeFns[i]({
                        address: EQUIPMENT_ESCROW.address,
                        abi: EQUIPMENT_ESCROW.abi,
                        functionName: 'completeMilestone',
                        args: [selectedDealId, i],
                        chainId: ARC_CHAIN_ID,
                      })}
                    />
                  )}
                  {canClaim && (
                    <TxButton
                      label={`Claim ${MILESTONE_LABELS[i]} (Timeout Elapsed)`}
                      loadingLabel="Claiming..."
                      isPending={claimPending[i]}
                      isConfirming={claimConfirming[i]}
                      variant="ghost"
                      className="w-full"
                      onClick={() => claimFns[i]({
                        address: EQUIPMENT_ESCROW.address,
                        abi: EQUIPMENT_ESCROW.abi,
                        functionName: 'claimMilestone',
                        args: [selectedDealId, i],
                        chainId: ARC_CHAIN_ID,
                      })}
                    />
                  )}
                  {awaitingApproval && !canClaim && claimIn > 0n && (
                    <div className="text-xs px-1" style={{ color: 'var(--muted)' }}>
                      Waiting for buyer approval · Auto-claim in {formatCountdown(now + claimIn)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Open dispute */}
            {isActive && !deal.disputeOpen && deal.milestones.some(m => !m.released && m.completedAt > 0n) && (
              <TxButton
                label="Open Dispute"
                variant="danger"
                isPending={dp}
                isConfirming={dc}
                onClick={() => doDispute({
                  address: EQUIPMENT_ESCROW.address,
                  abi: EQUIPMENT_ESCROW.abi,
                  functionName: 'openDispute',
                  args: [selectedDealId],
                  chainId: ARC_CHAIN_ID,
                })}
              />
            )}

            {/* Accepted confirmation */}
            {acceptSuccess && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
                <CheckCircle2 className="size-3.5" />
                Accepted — tell the buyer to fund the escrow
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <WithdrawButton />

      {/* Look up a deal by ID */}
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
            onClick={() => { setSelectedDealId(BigInt(dealIdInput)); setView('deal'); }}
          />
        </div>
      </div>

      <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>Your Deals</h2>
      {dealIds.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No deals found where you are the seller.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dealIds.map(id => (
            <DealLoader key={id.toString()} dealId={id} seller={address ?? ''} onSelect={id => { setSelectedDealId(id); setView('deal'); }} />
          ))}
        </div>
      )}
      <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Seller flow:</span> Review proposed terms → Accept within 3 days → Buyer funds escrow → Mark milestones complete → Funds release on approval
      </div>
    </div>
  );
}

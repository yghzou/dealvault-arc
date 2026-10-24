import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { toast } from 'sonner';
import { ChevronLeft, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { EQUIPMENT_ESCROW, USDC_ADDRESS, ARC_CHAIN_ID } from '@/contract';
import { useDeal, useDealCount, DEAL_STATUS } from '@/hooks/useDeal';
import { formatUsdc, parseUsdc, txUrl } from '@/utils/format';
import { DealTimeline, DealCard } from '@/components/DealTimeline';
import { TxButton } from '@/components/TxButton';
import { WithdrawButton } from '@/components/WithdrawButton';
import { ShareDealButton } from '@/components/ShareDealButton';
import { MILESTONE_LABELS } from '@/contract';

const SESSION_NOW_S = BigInt(Math.floor(Date.now() / 1000));

interface BuyerPageProps {
  initialDealId?: bigint;
  onDealChange?: (id: bigint | undefined) => void;
}

function DealLoader({ dealId, buyer, onSelect }: { dealId: bigint; buyer: string; onSelect: (id: bigint) => void }) {
  const { deal } = useDeal(dealId);
  if (!deal || deal.buyer.toLowerCase() !== buyer.toLowerCase()) return null;
  return <DealCard dealId={dealId} deal={deal} onClick={() => onSelect(dealId)} />;
}

export function BuyerPage({ initialDealId, onDealChange }: BuyerPageProps) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID;

  const { data: totalDeals, refetch: refetchCount } = useDealCount();
  const [view, setView] = useState<'list' | 'create' | 'deal'>(() => initialDealId ? 'deal' : 'list');
  const [selectedDealId, setSelectedDealId] = useState<bigint | undefined>(initialDealId);
  const { deal, refetch: refetchDeal } = useDeal(selectedDealId);

  // Notify parent when selected deal changes
  useEffect(() => {
    onDealChange?.(view === 'deal' ? selectedDealId : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDealId, view]);

  // milestone splits and agent commission stored as % strings (e.g. "33.34")
  const [form, setForm] = useState({
    seller: '', agent: '', arbiter: '',
    amount: '', agentPct: '5',
    m0: '33.34', m1: '33.33', m2: '33.33',
    deadlineDays: '30',
  });

  // ── (allowance no longer needed for createDeal — kept for fundDeal below) ──

  // ── createDeal ───────────────────────────────────────────────
  const { writeContract: doCreate, data: createTxHash, isPending: creating } = useWriteContract();
  const { isLoading: waitingCreate, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createTxHash });

  // ── fundDeal ─────────────────────────────────────────────────
  const { writeContract: doFund, data: fundHash, isPending: fundPending } = useWriteContract();
  const { isLoading: fundConfirming, isSuccess: fundSuccess } = useWaitForTransactionReceipt({ hash: fundHash });

  // ── fundDeal USDC approve ────────────────────────────────────
  const { writeContract: doFundApprove, data: fundApproveHash, isPending: fundApproving } = useWriteContract();
  const { isLoading: fundApproveWaiting, isSuccess: fundApproveSuccess } = useWaitForTransactionReceipt({ hash: fundApproveHash });
  const { data: fundAllowance, refetch: refetchFundAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && deal ? [address, EQUIPMENT_ESCROW.address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && !!deal },
  });

  // ── approveMilestone ────────────────────────────────────────
  const { writeContract: doApprove0, data: approve0Hash, isPending: approving0 } = useWriteContract();
  const { isLoading: confirming0, isSuccess: success0 } = useWaitForTransactionReceipt({ hash: approve0Hash });
  const { writeContract: doApprove1, data: approve1Hash, isPending: approving1 } = useWriteContract();
  const { isLoading: confirming1, isSuccess: success1 } = useWaitForTransactionReceipt({ hash: approve1Hash });
  const { writeContract: doApprove2, data: approve2Hash, isPending: approving2 } = useWriteContract();
  const { isLoading: confirming2, isSuccess: success2 } = useWaitForTransactionReceipt({ hash: approve2Hash });

  // ── dispute / default / refund ──────────────────────────────
  const { writeContract: doDispute, data: disputeHash, isPending: disputingPending } = useWriteContract();
  const { isLoading: disputeConfirming, isSuccess: disputeSuccess } = useWaitForTransactionReceipt({ hash: disputeHash });
  const { writeContract: doDefault, data: defaultHash, isPending: defaultPending } = useWriteContract();
  const { isLoading: defaultConfirming, isSuccess: defaultSuccess } = useWaitForTransactionReceipt({ hash: defaultHash });
  const { writeContract: doRefund, data: refundHash, isPending: refundPending } = useWriteContract();
  const { isLoading: refundConfirming, isSuccess: refundSuccess } = useWaitForTransactionReceipt({ hash: refundHash });

  // ── cancelDeal ──────────────────────────────────────────────
  const { writeContract: doCancel, data: cancelHash, isPending: cancelPending } = useWriteContract();
  const { isLoading: cancelConfirming, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });

  // ── Effects ─────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fundApproveSuccess) { toast.success('USDC approved for funding'); void refetchFundAllowance(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundApproveSuccess]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (createSuccess && createTxHash) {
      toast.success(
        <span className="flex items-center gap-2">
          Deal proposed!
          <a href={txUrl(createTxHash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline text-xs">
            View <ExternalLink className="size-3" />
          </a>
        </span>
      );
      void refetchCount();
      setView('list');
      setForm({ seller: '', agent: '', arbiter: '', amount: '', agentPct: '5', m0: '33.34', m1: '33.33', m2: '33.33', deadlineDays: '30' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSuccess, createTxHash]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fundSuccess || success0 || success1 || success2 || disputeSuccess || defaultSuccess || refundSuccess || cancelSuccess) {
      void refetchDeal();
      void refetchCount();
      if (fundSuccess) { toast.success('Deal funded — milestones are now active!'); void refetchFundAllowance(); }
      if (cancelSuccess) toast.success('Deal cancelled.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundSuccess, success0, success1, success2, disputeSuccess, defaultSuccess, refundSuccess, cancelSuccess]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to manage deals as a buyer.</p>
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

  // ── Create form ──────────────────────────────────────────────
  if (view === 'create') {
    const parsedAmount = form.amount ? parseUsdc(form.amount) : 0n;
    // Convert % → bps for validation (round to nearest integer bps)
    const pctToBps = (s: string) => Math.round(parseFloat(s || '0') * 100);
    const m0bps = pctToBps(form.m0);
    const m1bps = pctToBps(form.m1);
    const m2bps = pctToBps(form.m2);
    const bpsSum = m0bps + m1bps + m2bps;
    const bpsOk = bpsSum === 10000;
    const pctSum = (parseFloat(form.m0 || '0') + parseFloat(form.m1 || '0') + parseFloat(form.m2 || '0'));
    const agentBps = pctToBps(form.agentPct);
    const formOk = form.seller && form.agent && form.arbiter && parsedAmount > 0n && bpsOk && Number(form.deadlineDays) > 0 && agentBps <= 10000;

    return (
      <div className="space-y-4">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm" style={{ color: 'var(--accent-hover)' }}>
          <ChevronLeft className="size-4" /> Back
        </button>

        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>Propose Deal Terms</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            The seller will review and accept these terms before you fund the escrow. No funds move until you call Fund Deal after acceptance.
          </p>

          {/* Roles */}
          {(['seller', 'agent', 'arbiter'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs font-semibold mb-1 capitalize" style={{ color: 'var(--ink-2)' }}>{field} address</label>
              <input
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                placeholder="0x..."
                className="w-full rounded-xl px-3 py-2 text-sm mono outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </div>
          ))}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Total USDC amount</label>
            <input
              inputMode="decimal"
              value={form.amount}
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setForm(f => ({ ...f, amount: v })); }}
              placeholder="0.00"
              className="w-full rounded-xl px-3 py-2 text-sm tabular-nums outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>

          {/* Agent commission % */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Agent commission</label>
            <div className="relative">
              <input
                inputMode="decimal"
                value={form.agentPct}
                onChange={e => setForm(f => ({ ...f, agentPct: e.target.value.replace(/[^0-9.]/g, '') }))}
                placeholder="5"
                className="w-full rounded-xl px-3 py-2 pr-8 text-sm tabular-nums outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--muted)' }}>%</span>
            </div>
          </div>

          {/* Milestone splits */}
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>
              Milestone splits — must sum to 100%
              {form.m0 && form.m1 && form.m2 && !bpsOk && (
                <span className="ml-2 font-normal" style={{ color: 'var(--danger)' }}>
                  {pctSum.toFixed(2)}% (need exactly 100%)
                </span>
              )}
              {bpsOk && <span className="ml-2 font-normal" style={{ color: 'var(--success)' }}>✓ 100%</span>}
            </label>
            <div className="space-y-2">
              {(['m0', 'm1', 'm2'] as const).map((k, i) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-xs w-28 flex-shrink-0" style={{ color: 'var(--subtle)' }}>{MILESTONE_LABELS[i]}</span>
                  <div className="relative flex-1">
                    <input
                      inputMode="decimal"
                      value={form[k]}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value.replace(/[^0-9.]/g, '') }))}
                      className="w-full rounded-xl px-3 py-1.5 pr-8 text-sm tabular-nums outline-none"
                      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--muted)' }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Deadline (days from now)</label>
            <input
              inputMode="numeric"
              value={form.deadlineDays}
              onChange={e => setForm(f => ({ ...f, deadlineDays: e.target.value.replace(/[^0-9]/g, '') }))}
              placeholder="30"
              className="w-full rounded-xl px-3 py-2 text-sm tabular-nums outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          </div>

          {/* Info note */}
          <div className="rounded-xl px-3 py-2 text-xs flex items-start gap-2" style={{ background: '#1a804710', border: '1px solid #1a804730' }}>
            <CheckCircle2 className="size-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
            <span style={{ color: 'var(--success)' }}>
              No USDC needed yet. Terms are proposed to the seller first.
              You'll fund the escrow after they accept (within 3 days).
            </span>
          </div>

          <TxButton
            label="Propose Deal"
            loadingLabel="Proposing..."
            disabled={!formOk}
            isPending={creating}
            isConfirming={waitingCreate}
            onClick={() => {
              const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(form.deadlineDays) * 86400);
              doCreate({
                address: EQUIPMENT_ESCROW.address,
                abi: EQUIPMENT_ESCROW.abi,
                functionName: 'createDeal',
                args: [
                  form.seller as `0x${string}`,
                  form.agent as `0x${string}`,
                  form.arbiter as `0x${string}`,
                  parseUsdc(form.amount),
                  BigInt(agentBps),
                  [BigInt(m0bps), BigInt(m1bps), BigInt(m2bps)],
                  deadline,
                ],
                chainId: ARC_CHAIN_ID,
              });
            }}
          />
        </div>
      </div>
    );
  }

  // ── Deal detail view ─────────────────────────────────────────
  if (view === 'deal' && selectedDealId && deal) {
    const now = SESSION_NOW_S;
    const disputeTimeoutElapsed = deal.disputeOpen && now >= deal.disputeOpenedAt + BigInt(14 * 24 * 3600);
    const isExpired = now > deal.deadline;
    const isBuyer = deal.buyer.toLowerCase() === address?.toLowerCase();
    const isProposed = deal.status === DEAL_STATUS.Proposed;
    const isAccepted = deal.status === DEAL_STATUS.Accepted;
    const isActive = deal.status === DEAL_STATUS.Active;
    const isCancelled = deal.status === DEAL_STATUS.Cancelled;

    // Fund deal: check allowance vs totalAmount
    const fundAllowanceOk = fundAllowance !== undefined && (fundAllowance) >= deal.totalAmount;
    const approveFns = [doApprove0, doApprove1, doApprove2];
    const approveHashes = [approve0Hash, approve1Hash, approve2Hash];
    const approvingArr = [approving0, approving1, approving2];
    const confirmingArr = [confirming0, confirming1, confirming2];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setView('list'); onDealChange?.(undefined); }} className="flex items-center gap-1 text-sm" style={{ color: 'var(--accent-hover)' }}>
            <ChevronLeft className="size-4" /> Back to deals
          </button>
          <ShareDealButton dealId={selectedDealId} />
        </div>
        <WithdrawButton />
        <DealTimeline dealId={selectedDealId} deal={deal} />

        {/* ── Accepted: fund the deal ─────────────────── */}
        {isBuyer && isAccepted && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Seller accepted — ready to fund</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Approve {formatUsdc(deal.totalAmount)} USDC, then fund the escrow to activate milestones.
            </p>
            {!fundAllowanceOk ? (
              <TxButton
                label={`Approve ${formatUsdc(deal.totalAmount)} USDC`}
                loadingLabel="Approving..."
                isPending={fundApproving}
                isConfirming={fundApproveWaiting}
                onClick={() => doFundApprove({
                  address: USDC_ADDRESS,
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [EQUIPMENT_ESCROW.address, deal.totalAmount],
                  chainId: ARC_CHAIN_ID,
                })}
              />
            ) : (
              <TxButton
                label={`Fund Escrow — ${formatUsdc(deal.totalAmount)} USDC`}
                loadingLabel="Funding..."
                isPending={fundPending}
                isConfirming={fundConfirming}
                onClick={() => doFund({
                  address: EQUIPMENT_ESCROW.address,
                  abi: EQUIPMENT_ESCROW.abi,
                  functionName: 'fundDeal',
                  args: [selectedDealId],
                  chainId: ARC_CHAIN_ID,
                })}
              />
            )}
          </div>
        )}

        {/* ── Proposed: awaiting seller ───────────────── */}
        {isBuyer && isProposed && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Clock className="size-4" style={{ color: 'var(--accent-hover)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Awaiting seller acceptance</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>The seller has 3 days to accept these terms. You can cancel anytime while proposed.</p>
            <TxButton
              label="Cancel Deal"
              loadingLabel="Cancelling..."
              variant="ghost"
              isPending={cancelPending}
              isConfirming={cancelConfirming}
              onClick={() => doCancel({
                address: EQUIPMENT_ESCROW.address,
                abi: EQUIPMENT_ESCROW.abi,
                functionName: 'cancelDeal',
                args: [selectedDealId],
                chainId: ARC_CHAIN_ID,
              })}
            />
          </div>
        )}

        {/* ── Active: approve milestones ──────────────── */}
        {isActive && isBuyer && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Approve milestones</p>
            {deal.milestones.map((m, i) => {
              if (m.released || m.completedAt === 0n) return null;
              return (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{MILESTONE_LABELS[i]}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{formatUsdc(m.amount)} USDC</div>
                  </div>
                  <TxButton
                    label="Approve"
                    loadingLabel="Approving..."
                    isPending={approvingArr[i]}
                    isConfirming={confirmingArr[i]}
                    onClick={() => approveFns[i]({
                      address: EQUIPMENT_ESCROW.address,
                      abi: EQUIPMENT_ESCROW.abi,
                      functionName: 'approveMilestone',
                      args: [selectedDealId, i],
                      chainId: ARC_CHAIN_ID,
                    })}
                    className="flex-shrink-0"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ── Dispute controls ────────────────────────── */}
        {isActive && isBuyer && !deal.disputeOpen && (
          <TxButton
            label="Open Dispute"
            loadingLabel="Opening..."
            variant="danger"
            isPending={disputingPending}
            isConfirming={disputeConfirming}
            onClick={() => doDispute({
              address: EQUIPMENT_ESCROW.address,
              abi: EQUIPMENT_ESCROW.abi,
              functionName: 'openDispute',
              args: [selectedDealId],
              chainId: ARC_CHAIN_ID,
            })}
          />
        )}
        {isActive && isBuyer && deal.disputeOpen && disputeTimeoutElapsed && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: '#ba2b4c0d', border: '1px solid #ba2b4c30' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>Arbiter inactive for 14 days — you can reclaim funds</p>
            <TxButton
              label="Reclaim Funds (Default)"
              loadingLabel="Reclaiming..."
              variant="danger"
              isPending={defaultPending}
              isConfirming={defaultConfirming}
              onClick={() => doDefault({
                address: EQUIPMENT_ESCROW.address,
                abi: EQUIPMENT_ESCROW.abi,
                functionName: 'resolveDisputeDefault',
                args: [selectedDealId],
                chainId: ARC_CHAIN_ID,
              })}
            />
          </div>
        )}
        {isExpired && isActive && !deal.disputeOpen && (
          <TxButton
            label="Refund Expired Deal"
            loadingLabel="Refunding..."
            variant="ghost"
            isPending={refundPending}
            isConfirming={refundConfirming}
            onClick={() => doRefund({
              address: EQUIPMENT_ESCROW.address,
              abi: EQUIPMENT_ESCROW.abi,
              functionName: 'refundExpired',
              args: [selectedDealId],
              chainId: ARC_CHAIN_ID,
            })}
          />
        )}
        {isCancelled && (
          <div className="rounded-xl px-4 py-3 text-xs text-center" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
            This deal was cancelled. No funds were locked.
          </div>
        )}
        {approveHashes.filter(Boolean).map(h => h && (
          <div key={h} className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
            <CheckCircle2 className="size-3" style={{ color: 'var(--success)' }} />
            Milestone release confirmed —
            <a href={txUrl(h)} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 underline" style={{ color: 'var(--accent-hover)' }}>
              View <ExternalLink className="size-3" />
            </a>
          </div>
        ))}
      </div>
    );
  }

  // ── Deal list ────────────────────────────────────────────────
  const dealIds = totalDeals
    ? Array.from({ length: Math.min(Number(totalDeals), 20) }, (_, i) => BigInt(Number(totalDeals) - i))
    : [];

  return (
    <div className="space-y-4">
      <WithdrawButton />
      <div className="flex items-center justify-between">
        <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>Your Deals</h2>
        <TxButton label="+ New Deal" onClick={() => setView('create')} />
      </div>
      {dealIds.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No deals yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dealIds.map(id => (
            <DealLoader key={id.toString()} dealId={id} buyer={address ?? ''} onSelect={id => { setSelectedDealId(id); setView('deal'); }} />
          ))}
        </div>
      )}
      {/* Instruction hint */}
      <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
        <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Deal flow:</span> Propose terms → Seller accepts (3 days) → You fund escrow → Milestones release automatically on approval
      </div>
    </div>
  );
}

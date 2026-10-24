import { ExternalLink, CheckCircle2, Clock, AlertCircle, Circle, Ban } from 'lucide-react';
import { DealData, MilestoneData, DEAL_STATUS, DEAL_STATUS_LABEL } from '@/hooks/useDeal';
import { formatUsdc, formatDate, formatAddress, addrUrl } from '@/utils/format';
import { MILESTONE_LABELS } from '@/contract';

// Module-level timestamp: stable within a session, avoids React Compiler impure-function rule
const SESSION_NOW_S = BigInt(Math.floor(Date.now() / 1000));

interface Props {
  dealId: bigint;
  deal: DealData;
}

function statusColors(deal: DealData, sessionNow: bigint) {
  const isExpired = sessionNow > deal.deadline;
  if (deal.status === DEAL_STATUS.Cancelled) return { label: 'Cancelled', color: 'var(--muted)' };
  if (deal.status === DEAL_STATUS.Proposed) return { label: 'Awaiting Acceptance', color: 'var(--accent-hover)' };
  if (deal.status === DEAL_STATUS.Accepted) return { label: 'Awaiting Funding', color: '#d97706' };
  if (deal.disputeOpen) return { label: 'Disputed', color: 'var(--danger)' };
  const allReleased = deal.milestones.every(m => m.released);
  if (allReleased) return { label: 'Completed', color: 'var(--success)' };
  if (isExpired) return { label: 'Expired', color: 'var(--muted)' };
  return { label: DEAL_STATUS_LABEL[deal.status], color: 'var(--accent-hover)' };
}

function MilestoneRow({ m, index, agentBps, inactive }: { m: MilestoneData; index: number; agentBps: bigint; inactive: boolean }) {
  const sellerAmt = m.amount - (m.amount * agentBps / 10000n);
  const agentAmt = m.amount * agentBps / 10000n;

  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="mt-0.5">
        {m.released ? (
          <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
        ) : m.completedAt > 0n ? (
          <Clock className="size-5" style={{ color: 'var(--accent-hover)' }} />
        ) : (
          <Circle className="size-5" style={{ color: inactive ? 'var(--border)' : 'var(--subtle)' }} />
        )}
      </div>
      <div className="flex-1 min-w-0" style={{ opacity: inactive ? 0.45 : 1 }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {MILESTONE_LABELS[index]}
          </span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(m.amount)} USDC
          </span>
        </div>
        {m.released && (
          <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            Seller: {formatUsdc(sellerAmt)} · Agent: {formatUsdc(agentAmt)}
          </div>
        )}
        {m.completedAt > 0n && !m.released && (
          <div className="mt-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            Completed {formatDate(m.completedAt)} — awaiting approval
          </div>
        )}
        {!m.released && m.completedAt === 0n && (
          <div className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
            {inactive ? 'Locked until funded' : 'Pending'}
          </div>
        )}
      </div>
    </div>
  );
}

export function DealTimeline({ dealId, deal }: Props) {
  const now = SESSION_NOW_S;
  const { label: statusLabel, color: statusColor } = statusColors(deal, now);
  const isExpired = now > deal.deadline;
  const released = deal.milestones.filter(m => m.released).length;
  const inactive = deal.status !== DEAL_STATUS.Active;

  // Lifecycle steps bar
  const steps: { label: string; done: boolean; active: boolean }[] = [
    { label: 'Terms set', done: true, active: deal.status === DEAL_STATUS.Proposed },
    { label: 'Accepted', done: deal.status !== DEAL_STATUS.Proposed && deal.status !== DEAL_STATUS.Cancelled, active: deal.status === DEAL_STATUS.Accepted },
    { label: 'Funded', done: deal.status === DEAL_STATUS.Active || (deal.status === DEAL_STATUS.Cancelled && released > 0), active: deal.status === DEAL_STATUS.Active },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-strong)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        <div>
          <span className="display text-sm font-semibold" style={{ color: 'var(--ink)' }}>Deal #{dealId.toString()}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: statusColor + '18', color: statusColor }}>
              {statusLabel}
            </span>
            {deal.status === DEAL_STATUS.Active && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{released}/3 milestones</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(deal.totalAmount)}
            <span className="text-xs font-medium ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {Number(deal.agentBps) / 100}% agent commission
          </div>
        </div>
      </div>

      {/* Lifecycle steps */}
      <div className="px-4 py-2.5 flex items-center gap-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className="size-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: step.done ? (step.active ? 'var(--accent-hover)' : 'var(--success)') : 'var(--border)',
                  color: step.done ? '#fff' : 'var(--subtle)',
                }}>
                {i + 1}
              </div>
              <span className="text-xs font-medium" style={{ color: step.active ? 'var(--accent-hover)' : step.done ? 'var(--success)' : 'var(--subtle)' }}>
                {step.label}
              </span>
            </div>
            {i < 2 && <div className="mx-2 h-px w-6 flex-shrink-0" style={{ background: step.done && steps[i + 1]?.done ? 'var(--success)' : 'var(--border)' }} />}
          </div>
        ))}
      </div>

      {/* Cancelled banner */}
      {deal.status === DEAL_STATUS.Cancelled && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#6b658014', borderBottom: '1px solid var(--border)' }}>
          <Ban className="size-4" style={{ color: 'var(--muted)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Deal cancelled — no funds were transferred</span>
        </div>
      )}

      {/* Dispute banner */}
      {deal.disputeOpen && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#ba2b4c14', borderBottom: '1px solid var(--border)' }}>
          <AlertCircle className="size-4" style={{ color: 'var(--danger)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
            Dispute open — opened by {formatAddress(deal.disputeOpener)}
          </span>
        </div>
      )}

      {/* Milestones */}
      <div className="px-4">
        {deal.milestones.map((m, i) => (
          <MilestoneRow key={i} m={m} index={i} agentBps={deal.agentBps} inactive={inactive} />
        ))}
      </div>

      {/* Roles */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: 'Buyer', addr: deal.buyer },
            { label: 'Seller', addr: deal.seller },
            { label: 'Agent', addr: deal.agent },
            { label: 'Arbiter', addr: deal.arbiter },
          ].map(({ label, addr }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>{label}:</span>
              <a
                href={addrUrl(addr)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium mono flex items-center gap-0.5 hover:underline"
                style={{ color: 'var(--accent-hover)' }}
              >
                {formatAddress(addr)}
                <ExternalLink className="size-2.5" />
              </a>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>Deadline:</span>
          <span className="text-xs" style={{ color: isExpired ? 'var(--danger)' : 'var(--muted)' }}>
            {formatDate(deal.deadline)} {isExpired ? '(expired)' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

// Compact card version for lists
export function DealCard({ dealId, deal, onClick }: Props & { onClick: () => void }) {
  const now = SESSION_NOW_S;
  const { label: statusLabel, color: statusColor } = statusColors(deal, now);
  const released = deal.milestones.filter(m => m.released).length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-strong)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Deal #{dealId.toString()}</span>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: statusColor + '18', color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <span className="display text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {formatUsdc(deal.totalAmount)} <span className="text-xs font-normal" style={{ color: 'var(--subtle)' }}>USDC</span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        {deal.status === 2 && <span className="text-xs" style={{ color: 'var(--muted)' }}>{released}/3 milestones</span>}
        {deal.status === 2 && <span className="text-xs" style={{ color: 'var(--subtle)' }}>·</span>}
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>Seller: {formatAddress(deal.seller)}</span>
      </div>
    </button>
  );
}

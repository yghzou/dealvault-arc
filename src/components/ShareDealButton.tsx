import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { buildShareUrl, ShareRole } from '@/hooks/useShareLink';

interface Props {
  dealId: bigint;
  /** Show copy buttons for these roles. Defaults to all four. */
  roles?: ShareRole[];
}

const ROLE_LABELS: Record<ShareRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  agent: 'Agent',
  arbiter: 'Arbiter',
};

export function ShareDealButton({ dealId, roles = ['buyer', 'seller', 'agent', 'arbiter'] }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<ShareRole | null>(null);

  function copy(role: ShareRole) {
    const url = buildShareUrl(dealId, role);
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(role);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-80"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
      >
        <Link2 className="size-3.5" />
        Share
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-9 z-50 rounded-2xl p-3 space-y-1 w-52 shadow-lg"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-semibold px-1 pb-1" style={{ color: 'var(--ink-2)' }}>
              Copy link for…
            </p>
            {roles.map(role => (
              <button
                key={role}
                onClick={() => copy(role)}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-all hover:opacity-80"
                style={{ background: copied === role ? '#1a804715' : 'var(--surface-muted)', color: 'var(--ink)' }}
              >
                <span>{ROLE_LABELS[role]}</span>
                {copied === role
                  ? <Check className="size-3.5" style={{ color: 'var(--success)' }} />
                  : <Link2 className="size-3.5" style={{ color: 'var(--subtle)' }} />
                }
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

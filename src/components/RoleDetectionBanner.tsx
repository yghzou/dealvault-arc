import { Zap } from 'lucide-react';
import { DetectedRole } from '@/hooks/useRoleDetection';

type AppRole = 'buyer' | 'seller' | 'arbiter';

const ROLE_LABELS: Record<DetectedRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  agent: 'Agent',
  arbiter: 'Arbiter',
};

/** Map a detected deal role to the nearest app tab role.
 *  Agent has no dedicated tab yet, map to seller (both are "deal participants"). */
function toAppRole(r: DetectedRole): AppRole {
  if (r === 'agent') return 'seller';
  return r;
}

interface Props {
  detectedRoles: DetectedRole[];
  currentRole: AppRole;
  onSwitch: (role: AppRole) => void;
  onDismiss: () => void;
}

export function RoleDetectionBanner({ detectedRoles, currentRole, onSwitch, onDismiss }: Props) {
  const switchable = detectedRoles.filter(r => toAppRole(r) !== currentRole);
  if (switchable.length === 0) return null;

  const primary = switchable[0];
  const appRole = toAppRole(primary);

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: 'var(--accent)' + '12', border: '1px solid ' + 'var(--accent)' + '30' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Zap className="size-4 flex-shrink-0" style={{ color: 'var(--accent-hover)' }} />
        <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
          Your wallet is the <span className="font-semibold">{ROLE_LABELS[primary]}</span> on this deal.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onSwitch(appRole)}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Switch to {ROLE_LABELS[appRole]}
        </button>
        <button
          onClick={onDismiss}
          className="text-xs px-2 py-1.5 rounded-xl"
          style={{ color: 'var(--muted)' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

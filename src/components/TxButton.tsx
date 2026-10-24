import { Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ARC_CHAIN_ID } from '@/contract';

interface Props {
  label: string;
  loadingLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
  isConfirming?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  className?: string;
}

export function TxButton({
  label, loadingLabel, onClick, disabled, isPending, isConfirming, variant = 'primary', className = '',
}: Props) {
  const { chainId, isConnected } = useAccount();
  const wrongChain = isConnected && chainId !== ARC_CHAIN_ID;
  const busy = isPending || isConfirming;

  const bg =
    variant === 'danger'
      ? 'var(--danger)'
      : variant === 'ghost'
        ? 'transparent'
        : 'var(--accent)';

  const textColor =
    variant === 'ghost' ? 'var(--ink-2)' : '#fff';

  const border =
    variant === 'ghost' ? '1px solid var(--border)' : 'none';

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy || !isConnected || wrongChain}
      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-semibold
        transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed
        ${className}`}
      style={{ background: bg, color: textColor, border }}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {busy ? (loadingLabel ?? 'Confirming...') : label}
    </button>
  );
}

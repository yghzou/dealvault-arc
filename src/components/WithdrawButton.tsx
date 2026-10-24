import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { EQUIPMENT_ESCROW, ARC_CHAIN_ID } from '@/contract';
import { usePendingWithdrawal } from '@/hooks/useDeal';
import { formatUsdc, txUrl } from '@/utils/format';
import { TxButton } from './TxButton';
import { ExternalLink } from 'lucide-react';

interface Props {
  onSuccess?: () => void;
}

export function WithdrawButton({ onSuccess }: Props) {
  const { address } = useAccount();
  const { data: pending, refetch: refetchPending } = usePendingWithdrawal(address);
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess && hash) {
      toast.success(
        <span className="flex items-center gap-2">
          Withdrawal confirmed!
          <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline text-xs">
            View <ExternalLink className="size-3" />
          </a>
        </span>
      );
      void refetchPending();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash]);

  const amount = pending ?? 0n;
  if (amount === 0n) return null;

  return (
    <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: '#1a804714', border: '1px solid #1a804730' }}>
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Funds available to withdraw</div>
        <div className="display text-lg font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>
          {formatUsdc(amount)} <span className="text-xs font-normal" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
      </div>
      <TxButton
        label="Withdraw"
        loadingLabel="Withdrawing..."
        isPending={isPending}
        isConfirming={isConfirming}
        onClick={() => writeContract({
          address: EQUIPMENT_ESCROW.address,
          abi: EQUIPMENT_ESCROW.abi,
          functionName: 'withdraw',
          chainId: ARC_CHAIN_ID,
        })}
      />
    </div>
  );
}

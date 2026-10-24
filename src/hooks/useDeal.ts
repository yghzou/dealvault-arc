import { useReadContract, useReadContracts } from 'wagmi';
import { EQUIPMENT_ESCROW, ARC_CHAIN_ID } from '@/contract';

export const DEAL_STATUS = {
  Proposed: 0,
  Accepted: 1,
  Active: 2,
  Cancelled: 3,
} as const;
export type DealStatusValue = (typeof DEAL_STATUS)[keyof typeof DEAL_STATUS];

export const DEAL_STATUS_LABEL: Record<DealStatusValue, string> = {
  0: 'Proposed',
  1: 'Accepted',
  2: 'Active',
  3: 'Cancelled',
};

export interface MilestoneData {
  amount: bigint;
  completedAt: bigint;
  released: boolean;
}

export interface DealData {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  agent: `0x${string}`;
  arbiter: `0x${string}`;
  usdcToken: `0x${string}`;
  totalAmount: bigint;
  agentBps: bigint;
  deadline: bigint;
  status: DealStatusValue;
  proposedAt: bigint;
  disputeOpen: boolean;
  disputeOpenedAt: bigint;
  disputeOpener: `0x${string}`;
  milestones: [MilestoneData, MilestoneData, MilestoneData];
}

export function useDeal(dealId: bigint | undefined) {
  const enabled = dealId !== undefined && dealId > 0n;

  const contracts = [
    {
      address: EQUIPMENT_ESCROW.address,
      abi: EQUIPMENT_ESCROW.abi,
      functionName: 'deals' as const,
      args: enabled ? [dealId] : undefined,
      chainId: ARC_CHAIN_ID,
    },
    {
      address: EQUIPMENT_ESCROW.address,
      abi: EQUIPMENT_ESCROW.abi,
      functionName: 'getMilestones' as const,
      args: enabled ? [dealId] : undefined,
      chainId: ARC_CHAIN_ID,
    },
  ] as const;

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { enabled },
  });

  let deal: DealData | undefined;
  if (data?.[0].status === 'success' && data?.[1].status === 'success') {
    // deals() returns 13 scalars (milestonePercentages and milestones arrays excluded)
    const d = data[0].result as [
      `0x${string}`, // buyer
      `0x${string}`, // seller
      `0x${string}`, // agent
      `0x${string}`, // arbiter
      `0x${string}`, // usdcToken
      bigint,        // totalAmount
      bigint,        // agentBps
      bigint,        // deadline
      number,        // status (enum → uint8)
      bigint,        // proposedAt
      boolean,       // disputeOpen
      bigint,        // disputeOpenedAt
      `0x${string}`, // disputeOpener
    ];

    // getMilestones() returns three parallel arrays
    const m = data[1].result as [
      [bigint, bigint, bigint],   // amounts[3]
      [bigint, bigint, bigint],   // completedAts[3]
      [boolean, boolean, boolean] // released[3]
    ];

    deal = {
      buyer: d[0],
      seller: d[1],
      agent: d[2],
      arbiter: d[3],
      usdcToken: d[4],
      totalAmount: d[5],
      agentBps: d[6],
      deadline: d[7],
      status: d[8] as DealStatusValue,
      proposedAt: d[9],
      disputeOpen: d[10],
      disputeOpenedAt: d[11],
      disputeOpener: d[12],
      milestones: [
        { amount: m[0][0], completedAt: m[1][0], released: m[2][0] },
        { amount: m[0][1], completedAt: m[1][1], released: m[2][1] },
        { amount: m[0][2], completedAt: m[1][2], released: m[2][2] },
      ],
    };
  }

  return { deal, isLoading, error, refetch };
}

export function useDealCount() {
  return useReadContract({
    address: EQUIPMENT_ESCROW.address,
    abi: EQUIPMENT_ESCROW.abi,
    functionName: 'dealCount',
    chainId: ARC_CHAIN_ID,
  });
}

export function usePendingWithdrawal(address: `0x${string}` | undefined) {
  const result = useReadContract({
    address: EQUIPMENT_ESCROW.address,
    abi: EQUIPMENT_ESCROW.abi,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });
  return { ...result, data: result.data as bigint | undefined };
}

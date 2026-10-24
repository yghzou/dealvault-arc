import artifact from '../contracts/out/EquipmentEscrow.sol/EquipmentEscrow.json';
import { getUsdc, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts';

export const ARC_CHAIN_ID = 5042;

const usdcFact = getUsdc(ARC_CHAIN_ID);
if (!usdcFact) throw new Error('USDC not found on Arc');
export const USDC_ADDRESS = usdcFact.address as `0x${string}`;
export const USDC_DECIMALS = usdcFact.decimals;

export const EQUIPMENT_ESCROW = {
  address: '0x3c76817e5Eca7a11d37ab415bD3CEAdC2C648797' as `0x${string}`,
  abi: artifact.abi,
} as const;

export { buildTxExplorerUrl, buildAddressExplorerUrl };

export const MILESTONE_LABELS = ['Order Confirmed', 'Shipped', 'Delivered'] as const;

export type MilestoneStatus =
  | 'pending'       // not yet completed by seller
  | 'completed'     // seller marked complete, awaiting buyer approval
  | 'timeout'       // seller can claim (7-day timeout elapsed)
  | 'released';     // buyer approved or seller claimed

export type DealStatus =
  | 'active'
  | 'disputed'
  | 'expired'
  | 'completed';

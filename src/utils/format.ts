import { USDC_DECIMALS, buildTxExplorerUrl, buildAddressExplorerUrl, ARC_CHAIN_ID } from '@/contract';

export function formatUsdc(raw: bigint): string {
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, 2);
  return `${whole.toLocaleString('en-US')}.${fracStr}`;
}

export function parseUsdc(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.');
  const fracPadded = frac.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, '0');
  return BigInt(whole || '0') * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded || '0');
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCountdown(ts: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(ts) - now;
  if (diff <= 0) return 'Expired';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h remaining`;
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

export function txUrl(hash: string): string {
  return buildTxExplorerUrl(ARC_CHAIN_ID, hash);
}

export function addrUrl(addr: string): string {
  return buildAddressExplorerUrl(ARC_CHAIN_ID, addr);
}

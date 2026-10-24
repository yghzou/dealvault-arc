/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain, fallback, http } from 'viem'
import { injected } from 'wagmi/connectors'
import { requireChain } from '@/onchain-facts'
import { registerChain } from './tracing'

const arcFact = requireChain(5042)
const arcRpcUrls = [
  'https://rpc.blockdaemon.mainnet.arc.io',
  ...arcFact.rpcUrls.filter((url) => url !== 'https://rpc.blockdaemon.mainnet.arc.io'),
]

export const arc = defineChain({
  id: arcFact.chainId,
  name: arcFact.name,
  nativeCurrency: {
    name: arcFact.nativeCurrency.symbol,
    symbol: arcFact.nativeCurrency.symbol,
    decimals: arcFact.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: arcRpcUrls },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: arcFact.explorerBase },
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arc, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arc.id]: fallback(arcRpcUrls.map((url) => http(url))),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

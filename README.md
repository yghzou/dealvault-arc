# TradeEscrow — B2B Equipment Deal Platform

Milestone-based USDC escrow for equipment trade deals. Buyers lock funds at deal creation; the contract releases them to the seller and agent as each milestone (Order Confirmed, Shipped, Delivered) is completed and approved. Disputes are resolved by a neutral arbiter, with a 14-day buyer fallback if the arbiter is inactive.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Web3**: wagmi v2, viem v2, ConnectKit
- **Contracts**: Solidity 0.8.28, Foundry, OpenZeppelin 5.6.1
- **Chain**: Arc Testnet (Chain ID: 5042002)
- **Token**: USDC (6 decimals)

## Features

- **3-step deal lifecycle**: Buyer proposes terms → Seller accepts within 3 days → Buyer funds escrow → milestones active
- **Buyer**: propose deal terms (no upfront funds), fund after acceptance, approve milestones, cancel any Proposed deal, open disputes, refund expired deals
- **Seller**: review proposed terms, accept within the 3-day window, mark milestones complete, claim after 7-day approval timeout, open disputes
- **Arbiter**: resolve disputes with a configurable seller/buyer split slider; buyer reclaims all after 14-day arbiter inactivity
- **Agent**: earns commission on each milestone release (pull-payment via `withdraw()`)
- **Cancel paths**: buyer cancels before acceptance; anyone cancels after acceptance timeout or deadline while still Proposed
- **Terms immutability**: seller/agent/arbiter/amounts/milestones are set once and never changed
- **Deal timeline**: lifecycle step bar (Terms set → Accepted → Funded), milestone status, roles with explorer links

## Deployed Contract

| Contract | Network | Address |
|---|---|---|
| EquipmentEscrow | Arc Testnet | `0xb7228bd06f99e3cc49401ec97a2997ff06a3d00b` |

## Environment Variables

None required for the frontend. All chain and token facts are read from the generated `src/onchain-facts.ts` module.

## Development

**Prerequisites**: Bun, Foundry

```bash
bun install
bun run dev
```

## Contract Tests

```bash
bun run contracts:test
```

54 tests covering happy paths, edge cases (double release, wrong caller, timeouts), fuzz, and balance invariants.

## Build

```bash
bunx vite build
```

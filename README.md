# TradeEscrow — B2B Equipment Deal Platform

Milestone-based USDC escrow for equipment trade deals. The buyer proposes terms, the seller accepts, then the buyer funds the escrow. The contract releases USDC to the seller and agent as each milestone (Order Confirmed, Shipped, Delivered) is completed and approved. Disputes are resolved by a neutral arbiter, with a 14-day buyer fallback if the arbiter is inactive.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Web3**: wagmi v2, viem v2, ConnectKit
- **Contracts**: Solidity 0.8.28, Foundry, OpenZeppelin 5.6.1
- **Chain**: Arc Mainnet (Chain ID: 5042)
- **Token**: USDC, 6 decimals (`0x3600000000000000000000000000000000000000`)

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
| EquipmentEscrow | Arc Mainnet | [`0x3c76817e5Eca7a11d37ab415bD3CEAdC2C648797`](https://explorer.arc.io/address/0x3c76817e5Eca7a11d37ab415bD3CEAdC2C648797) |

Constructor argument: USDC `0x3600000000000000000000000000000000000000`.

A full deal of **1.000000 USDC** was funded and paid out on 24 Oct 2026. Seller received 0.950000 USDC across three milestone withdrawals. Agent received 0.050000 USDC. Contract balance after the last `withdraw` is 0.

| Step | Tx |
|---|---|
| Deploy | [`0x9c1a8dde…`](https://explorer.arc.io/tx/0x9c1a8ddea3bb5f6a721cc1ffdc4f272f22b156ee78202659ea7bc6a609226b35) |
| `createDeal` | [`0xd27e3995…`](https://explorer.arc.io/tx/0xd27e3995ead7caf29bbe0cf6d173e63c7551d5f8b2ef54b89bf643ac54ade539) |
| `acceptDeal` | [`0x19c804b0…`](https://explorer.arc.io/tx/0x19c804b08ed385d5a537ff512e139cad5937116d2987ea70a03634ae37de059e) |
| `fundDeal` (1 USDC in) | [`0xa78a7399…`](https://explorer.arc.io/tx/0xa78a73995f0b3c0430d74c4eb8af2c6cf00a20df5e6571d54ac3b89b81b5356d) |
| Seller `withdraw` (0.316730) | [`0xc4d4ae1b…`](https://explorer.arc.io/tx/0xc4d4ae1bb50c1cc3560b2c7527115257a6d50734fe614104e86e2c30e3751585) |
| Seller `withdraw` (0.316635) | [`0x74b5b6b2…`](https://explorer.arc.io/tx/0x74b5b6b2c000650eef5770a0ec642d98bc9cdbd1437561b6bc6c455b344b57a9) |
| Seller `withdraw` (0.316635) | [`0xf4c0b3dd…`](https://explorer.arc.io/tx/0xf4c0b3dd334894de5e9cc648170bb927f7bc5834da67be10d70093956a87bb19) |
| Agent `withdraw` (0.050000) | [`0x66db9e6b…`](https://explorer.arc.io/tx/0x66db9e6b1e55a0f1d4c2a6b58849c225c970d7bfef287bbd4ace55d940f7ea0f) |

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

78 tests covering happy paths, edge cases (double release, wrong caller, timeouts), fuzz, and balance invariants.

## Build

```bash
bunx vite build
```

## Disclaimer

This contract has not been audited by a third party. It was tested with Foundry (78 tests) and deployed on Arc Mainnet as an experiment. Use only small amounts.

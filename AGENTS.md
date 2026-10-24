# TradeEscrow — B2B Equipment Deal Platform

> Built with Arc Studio — money-powered apps in minutes

Milestone-based USDC escrow for B2B equipment trade deals. Four roles: buyer, seller, agent, arbiter. Three fixed milestones: Order Confirmed, Shipped, Delivered. Pull-payment accounting (recipients call `withdraw()`). Dispute system with arbiter + 14-day buyer fallback.

---

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| EquipmentEscrow v1 (orig) | Arc Testnet | 0xb7228bd06f99e3cc49401ec97a2997ff06a3d00b | https://explorer.testnet.arc.io/address/0xb7228bd06f99e3cc49401ec97a2997ff06a3d00b |
| EquipmentEscrow v2 (3-step lifecycle) | Arc Testnet | 0x09065ca75de0873929562d158a45e42a44993f85 | https://explorer.testnet.arc.io/address/0x09065ca75de0873929562d158a45e42a44993f85 |

Constructor arg: USDC = `0x3600000000000000000000000000000000000000` (Arc Testnet — same address on Arc Mainnet)
Active frontend address: `0x09065ca75de0873929562d158a45e42a44993f85` (v2)

## Security

Two Critical findings were found and fixed before deploy:
1. **Frozen dispute escape hatch**: added `resolveDisputeDefault()` — buyer can reclaim after 14-day arbiter inactivity.
2. **Blocklisted address brick**: switched to pull-payment model (`pendingWithdrawals` mapping + `withdraw()`).

54/54 Foundry tests pass (happy path, edge cases, fuzz, invariants).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry + OpenZeppelin 5.6.1
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC 6 decimals (0x3600000000000000000000000000000000000000)
- Toasts: Sonner

## Key Files

- `src/App.tsx` — Role switcher + shell
- `src/contract.ts` — Contract address, ABI, USDC address
- `src/hooks/useDeal.ts` — Deal/milestone read hooks
- `src/utils/format.ts` — USDC, address, date formatting
- `src/pages/BuyerPage.tsx` — Create deals, approve milestones, open disputes
- `src/pages/SellerPage.tsx` — Complete milestones, claim on timeout, open disputes
- `src/pages/ArbiterPage.tsx` — Resolve disputes with split slider
- `src/components/DealTimeline.tsx` — Deal timeline with explorer links
- `src/components/WithdrawButton.tsx` — Pending withdrawal drawer
- `contracts/EquipmentEscrow.sol` — Main contract
- `contracts/test/*.t.sol` — 54 Foundry tests

## To Run

```bash
bun install
bun run dev
```

## Test Contracts

```bash
bun run contracts:test
```

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {EquipmentEscrow} from "../EquipmentEscrow.sol";

/// @dev Handler that drives the invariant fuzzer through realistic escrow operations,
///      including the 3-step lifecycle (createDeal → acceptDeal → fundDeal).
contract EscrowHandler is Test {
    MockERC20       public usdc;
    EquipmentEscrow public escrow;

    address internal buyer   = makeAddr("inv_buyer");
    address internal seller  = makeAddr("inv_seller");
    address internal agent   = makeAddr("inv_agent");
    address internal arbiter = makeAddr("inv_arbiter");

    uint256[3] internal MILE_PCT = [uint256(4_000), uint256(3_500), uint256(2_500)];

    // Ghost accounting: total ever deposited minus total ever withdrawn from the contract
    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;

    // Track deal IDs by their lifecycle stage so actions target the right deals.
    uint256[] public proposedIds;    // createDeal done, not yet accepted
    uint256[] public acceptedIds;    // acceptDeal done, not yet funded
    uint256[] public activeIds;      // fundDeal done → Active
    uint256[] public cancelledIds;   // cancelDeal done → Cancelled

    constructor(MockERC20 _usdc, EquipmentEscrow _escrow) {
        usdc   = _usdc;
        escrow = _escrow;

        // Pre-fund and approve the buyer
        usdc.mint(buyer, type(uint128).max);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── Step 1: Create deal (Proposed) ───────────────────────────────────────
    function createDealAction(uint256 amount) external {
        amount = bound(amount, 1_000, 100_000e6);

        usdc.mint(buyer, amount);

        vm.prank(buyer);
        uint256 id = escrow.createDeal(
            seller, agent, arbiter,
            amount, 500,
            MILE_PCT,
            block.timestamp + 30 days
        );
        proposedIds.push(id);
        // Note: no deposit yet — USDC only moves on fundDeal
    }

    // ── Step 2: Accept deal (Accepted) ───────────────────────────────────────
    function acceptDealAction(uint256 idSeed) external {
        if (proposedIds.length == 0) return;
        uint256 dealId = proposedIds[idSeed % proposedIds.length];

        vm.prank(seller);
        try escrow.acceptDeal(dealId) {
            // Move from proposed → accepted tracking
            _removeFromArray(proposedIds, dealId);
            acceptedIds.push(dealId);
        } catch {}
    }

    // ── Step 3: Fund deal (Active) ────────────────────────────────────────────
    function fundDealAction(uint256 idSeed) external {
        if (acceptedIds.length == 0) return;
        uint256 dealId = acceptedIds[idSeed % acceptedIds.length];

        // Look up the amount from storage
        (,,,,,uint256 amount,,,,,,,) = escrow.deals(dealId);
        usdc.mint(buyer, amount); // ensure buyer has enough

        vm.prank(buyer);
        try escrow.fundDeal(dealId) {
            _removeFromArray(acceptedIds, dealId);
            activeIds.push(dealId);
            ghostDeposited += amount;
        } catch {}
    }

    // ── Cancel a Proposed deal (buyer cancels or timeout) ────────────────────
    function cancelDealAction(uint256 idSeed) external {
        if (proposedIds.length == 0) return;
        uint256 dealId = proposedIds[idSeed % proposedIds.length];

        // Buyer cancels directly (always valid on Proposed)
        vm.prank(buyer);
        try escrow.cancelDeal(dealId) {
            _removeFromArray(proposedIds, dealId);
            cancelledIds.push(dealId);
            // No funds were ever deposited for this deal
        } catch {}
    }

    // ── Milestone operations on Active deals ─────────────────────────────────

    function completeMilestoneAction(uint256 idSeed, uint8 idx) external {
        if (activeIds.length == 0) return;
        uint256 dealId = activeIds[idSeed % activeIds.length];
        idx = idx % 3;

        vm.prank(seller);
        try escrow.completeMilestone(dealId, idx) {} catch {}
    }

    function approveMilestoneAction(uint256 idSeed, uint8 idx) external {
        if (activeIds.length == 0) return;
        uint256 dealId = activeIds[idSeed % activeIds.length];
        idx = idx % 3;

        vm.prank(buyer);
        try escrow.approveMilestone(dealId, idx) {} catch {}
    }

    function claimMilestoneAction(uint256 idSeed, uint8 idx, uint256 warpSecs) external {
        if (activeIds.length == 0) return;
        uint256 dealId = activeIds[idSeed % activeIds.length];
        idx = idx % 3;
        warpSecs = bound(warpSecs, 0, 8 days);
        skip(warpSecs);

        vm.prank(seller);
        try escrow.claimMilestone(dealId, idx) {} catch {}
    }

    function withdrawSeller() external {
        if (escrow.pendingWithdrawals(seller) == 0) return;
        uint256 amt = escrow.pendingWithdrawals(seller);
        vm.prank(seller);
        escrow.withdraw();
        ghostWithdrawn += amt;
    }

    function withdrawAgent() external {
        if (escrow.pendingWithdrawals(agent) == 0) return;
        uint256 amt = escrow.pendingWithdrawals(agent);
        vm.prank(agent);
        escrow.withdraw();
        ghostWithdrawn += amt;
    }

    // ── Ghost helpers ─────────────────────────────────────────────────────────

    function cancelledCount() external view returns (uint256) {
        return cancelledIds.length;
    }

    function getCancelledId(uint256 idx) external view returns (uint256) {
        return cancelledIds[idx];
    }

    // ── Internal array helper ─────────────────────────────────────────────────

    /// Remove the first occurrence of `value` from a storage array by swap-and-pop.
    function _removeFromArray(uint256[] storage arr, uint256 value) internal {
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == value) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }
}

/// @dev Invariant test contract.
contract EquipmentEscrowInvariantTest is Test {
    MockERC20       internal usdc;
    EquipmentEscrow internal escrow;
    EscrowHandler   internal handler;

    // Pre-compute addresses once so invariant_* functions stay view-compatible.
    address internal inv_seller;
    address internal inv_agent;
    address internal inv_buyer;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow  = new EquipmentEscrow(address(usdc));
        handler = new EscrowHandler(usdc, escrow);

        inv_seller = makeAddr("inv_seller");
        inv_agent  = makeAddr("inv_agent");
        inv_buyer  = makeAddr("inv_buyer");

        targetContract(address(handler));
    }

    /// @notice PROPERTY: the escrow's USDC balance always covers deposited minus withdrawn.
    ///         No funds disappear: balance + withdrawn == deposited (only from fundDeal).
    function invariant_EscrowBalanceCoversPendingFunds() public view {
        uint256 contractBalance = usdc.balanceOf(address(escrow));
        assertEq(contractBalance + handler.ghostWithdrawn(), handler.ghostDeposited());
    }

    /// @notice PROPERTY: sum of all pendingWithdrawals ≤ escrow USDC balance.
    ///         Pull-payment accounting never over-commits.
    function invariant_PendingWithdrawalsDoNotExceedBalance() public view {
        uint256 totalPending =
            escrow.pendingWithdrawals(inv_seller) +
            escrow.pendingWithdrawals(inv_agent)  +
            escrow.pendingWithdrawals(inv_buyer);

        assertLe(totalPending, usdc.balanceOf(address(escrow)));
    }

    /// @notice PROPERTY: a Cancelled deal always has 0 USDC contribution to escrow.
    ///         Because cancelDeal only works on Proposed deals (before fundDeal),
    ///         no USDC was ever transferred for them — the escrow balance is
    ///         unaffected by cancellations.  We verify by checking that the ghost
    ///         deposit total equals the escrow balance + withdrawals (i.e., the
    ///         balance invariant is maintained regardless of how many deals were
    ///         cancelled).  Additionally we assert all cancelled deal IDs are
    ///         truly in the Cancelled enum state.
    function invariant_CancelledDealHasZeroEscrowContribution() public view {
        // The ghost accounting invariant already covers fund conservation;
        // here we additionally verify every tracked cancelled deal has Cancelled status.
        uint256 count = handler.cancelledCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 dealId = handler.getCancelledId(i);
            // Read the status field (index 8 in the tuple returned by deals())
            (,,,,,,,, EquipmentEscrow.DealStatus status,,,,) = escrow.deals(dealId);
            assertEq(
                uint8(status),
                uint8(EquipmentEscrow.DealStatus.Cancelled),
                "cancelled deal must have Cancelled status"
            );
        }
    }
}

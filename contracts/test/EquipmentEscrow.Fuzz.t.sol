// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EquipmentEscrowTestBase} from "./EquipmentEscrow.Base.t.sol";
import {EquipmentEscrow} from "../EquipmentEscrow.sol";

contract EquipmentEscrowFuzzTest is EquipmentEscrowTestBase {

    // ── Test 25: Fuzz – milestonePercentages summing to 10000 ─────────────────
    /// @notice Any split that sums to exactly 10 000 bps must create a valid deal
    ///         and reach Active status after the 3-step lifecycle.
    function testFuzz_CreateDealWithValidMilestonePct(uint256 pct0, uint256 pct1) public {
        // Clamp pct0 and pct1 so they fit, then derive pct2 as the remainder
        pct0 = bound(pct0, 1, 9_998);
        pct1 = bound(pct1, 1, 10_000 - pct0 - 1);
        uint256 pct2 = 10_000 - pct0 - pct1;
        // pct2 >= 1 by construction

        uint256[3] memory pct = [pct0, pct1, pct2];

        uint256 amount = 1_000e6;
        usdc.mint(buyer, amount);

        vm.prank(buyer);
        uint256 dealId = escrow.createDeal(
            seller, agent, arbiter,
            amount, AGENT_BPS,
            pct,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );

        assertGt(dealId, 0);

        // Verify deal storage
        (,,,,,uint256 total,,,,,,,) = escrow.deals(dealId);
        assertEq(total, amount);

        // Thread through accept + fund to reach Active
        vm.prank(seller);
        escrow.acceptDeal(dealId);
        vm.prank(buyer);
        escrow.fundDeal(dealId);

        // Escrow holds the funds
        assertGe(usdc.balanceOf(address(escrow)), amount);
    }

    // ── Fuzz: total payout invariant across random agentBps ──────────────────
    /// @notice sellerAmt + agentAmt == milestoneAmount for any valid agentBps.
    function testFuzz_MilestoneSplitIsConservative(uint256 agentBps) public {
        agentBps = bound(agentBps, 0, 10_000);

        vm.prank(buyer);
        uint256 dealId = escrow.createDeal(
            seller, agent, arbiter,
            TOTAL, agentBps,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );

        // Accept and fund
        vm.prank(seller);
        escrow.acceptDeal(dealId);
        vm.prank(buyer);
        escrow.fundDeal(dealId);

        uint256 sellerBefore = escrow.pendingWithdrawals(seller);
        uint256 agentBefore  = escrow.pendingWithdrawals(agent);

        _cycleApprove(dealId, 0);

        uint256 sellerGain = escrow.pendingWithdrawals(seller) - sellerBefore;
        uint256 agentGain  = escrow.pendingWithdrawals(agent)  - agentBefore;

        // PROPERTY: splits sum to the milestone amount
        assertEq(sellerGain + agentGain, M0);
    }

    // ── Fuzz: random amount, full lifecycle sums to zero dust ────────────────
    /// @notice No USDC lost or gained: totalAmount equals what all parties receive.
    function testFuzz_FullLifecycleNoFundsLost(uint256 amount) public {
        // Use multiples of 10 000 to avoid integer-division dust across 3 milestones
        amount = bound(amount, 10_000, 1_000_000e6);

        usdc.mint(buyer, amount);

        uint256[3] memory pct = [uint256(4_000), uint256(3_500), uint256(2_500)];
        vm.prank(buyer);
        uint256 dealId = escrow.createDeal(
            seller, agent, arbiter,
            amount, AGENT_BPS,
            pct,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );

        // Accept and fund
        vm.prank(seller);
        escrow.acceptDeal(dealId);
        vm.prank(buyer);
        escrow.fundDeal(dealId);

        _cycleApprove(dealId, 0);
        _cycleApprove(dealId, 1);
        _cycleApprove(dealId, 2);

        uint256 sellerPw = escrow.pendingWithdrawals(seller);
        uint256 agentPw  = escrow.pendingWithdrawals(agent);

        // PROPERTY: all funds sit in pendingWithdrawals
        assertEq(sellerPw + agentPw, amount);
    }

    // ── Fuzz: claimMilestone timing boundary ─────────────────────────────────
    /// @notice Any warp ≥ AUTO_RELEASE_TIMEOUT must allow claim; any warp < must revert.
    function testFuzz_ClaimTimingBoundary(uint256 elapsed) public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        uint256 AUTO = escrow.AUTO_RELEASE_TIMEOUT();
        elapsed = bound(elapsed, 0, AUTO * 2);

        skip(elapsed);

        if (elapsed >= AUTO) {
            vm.prank(seller);
            escrow.claimMilestone(dealId, 0); // must succeed
        } else {
            vm.prank(seller);
            vm.expectRevert(EquipmentEscrow.TimeoutNotElapsed.selector);
            escrow.claimMilestone(dealId, 0);
        }
    }

    // ── Fuzz: dispute resolution conserves funds ─────────────────────────────
    /// @notice sellerAmt + agentAmt + refundAmt == remaining for any sellerShare.
    function testFuzz_DisputeResolutionConservative(uint256 sellerShare) public {
        sellerShare = bound(sellerShare, 0, 10_000);

        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        uint256 sellerBefore = escrow.pendingWithdrawals(seller);
        uint256 agentBefore  = escrow.pendingWithdrawals(agent);
        uint256 buyerBefore  = escrow.pendingWithdrawals(buyer);

        vm.prank(arbiter);
        escrow.resolveDispute(dealId, sellerShare);

        uint256 totalOut =
            (escrow.pendingWithdrawals(seller) - sellerBefore) +
            (escrow.pendingWithdrawals(agent)  - agentBefore)  +
            (escrow.pendingWithdrawals(buyer)  - buyerBefore);

        // PROPERTY: all remaining funds distributed (= TOTAL since no milestone approved yet)
        assertEq(totalOut, TOTAL);
    }
}

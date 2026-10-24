// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EquipmentEscrowTestBase} from "./EquipmentEscrow.Base.t.sol";
import {EquipmentEscrow} from "../EquipmentEscrow.sol";

contract EquipmentEscrowHappyTest is EquipmentEscrowTestBase {

    // ── Test 1: Full lifecycle ────────────────────────────────────────────────
    function test_FullLifecycleThreeMilestones() public {
        uint256 dealId = _createAcceptFund();

        // Escrow received funds
        assertEq(usdc.balanceOf(address(escrow)), TOTAL);

        // Milestone 0 cycle
        _cycleApprove(dealId, 0);
        assertEq(escrow.pendingWithdrawals(seller), _sellerAmt(M0));
        assertEq(escrow.pendingWithdrawals(agent),  _agentAmt(M0));

        // Milestone 1 cycle
        _cycleApprove(dealId, 1);
        assertEq(escrow.pendingWithdrawals(seller), _sellerAmt(M0) + _sellerAmt(M1));
        assertEq(escrow.pendingWithdrawals(agent),  _agentAmt(M0)  + _agentAmt(M1));

        // Milestone 2 cycle
        _cycleApprove(dealId, 2);
        assertEq(escrow.pendingWithdrawals(seller), _sellerAmt(M0) + _sellerAmt(M1) + _sellerAmt(M2));
        assertEq(escrow.pendingWithdrawals(agent),  _agentAmt(M0)  + _agentAmt(M1)  + _agentAmt(M2));

        uint256 sellerExpected = _sellerAmt(M0) + _sellerAmt(M1) + _sellerAmt(M2);
        uint256 agentExpected  = _agentAmt(M0)  + _agentAmt(M1)  + _agentAmt(M2);
        assertEq(sellerExpected + agentExpected, TOTAL);

        // All parties withdraw
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(seller);
        escrow.withdraw();
        assertEq(usdc.balanceOf(seller), sellerBefore + sellerExpected);
        assertEq(escrow.pendingWithdrawals(seller), 0);

        uint256 agentBefore = usdc.balanceOf(agent);
        vm.prank(agent);
        escrow.withdraw();
        assertEq(usdc.balanceOf(agent), agentBefore + agentExpected);

        // Escrow fully drained
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ── Test 2: Seller claims after AUTO_RELEASE_TIMEOUT ─────────────────────
    function test_SellerClaimsAfterAutoReleaseTimeout() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        // Warp past 7-day timeout
        skip(7 days + 1);

        vm.prank(seller);
        escrow.claimMilestone(dealId, 0);

        assertEq(escrow.pendingWithdrawals(seller), _sellerAmt(M0));
        assertEq(escrow.pendingWithdrawals(agent),  _agentAmt(M0));
    }

    // ── Test 3: Buyer opens dispute, arbiter resolves 50/50 ──────────────────
    function test_DisputeResolve50_50() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        // 50 % to seller → 5000 bps
        // remaining = TOTAL (all 3 milestones unreleased)
        uint256 remaining = TOTAL;
        uint256 agentAmt  = (remaining * 5_000 * AGENT_BPS) / (10_000 * 10_000);
        uint256 sellerAmt = (remaining * 5_000) / 10_000 - agentAmt;
        uint256 refund    = remaining - sellerAmt - agentAmt;

        vm.prank(arbiter);
        escrow.resolveDispute(dealId, 5_000);

        assertEq(escrow.pendingWithdrawals(seller), sellerAmt);
        assertEq(escrow.pendingWithdrawals(agent),  agentAmt);
        assertEq(escrow.pendingWithdrawals(buyer),  refund);
        assertEq(sellerAmt + agentAmt + refund, TOTAL);
    }

    // ── Test 4: Arbiter resolves 100 % to seller ─────────────────────────────
    function test_DisputeResolve100ToSeller() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        uint256 remaining = TOTAL;
        uint256 agentAmt  = (remaining * 10_000 * AGENT_BPS) / (10_000 * 10_000);
        uint256 sellerAmt = remaining - agentAmt; // refund = 0

        vm.prank(arbiter);
        escrow.resolveDispute(dealId, 10_000);

        assertEq(escrow.pendingWithdrawals(seller), sellerAmt);
        assertEq(escrow.pendingWithdrawals(agent),  agentAmt);
        assertEq(escrow.pendingWithdrawals(buyer),  0);
    }

    // ── Test 5: Arbiter resolves 100 % to buyer (full refund) ────────────────
    function test_DisputeResolve100ToBuyer() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(arbiter);
        escrow.resolveDispute(dealId, 0); // 0 % to seller

        assertEq(escrow.pendingWithdrawals(seller), 0);
        assertEq(escrow.pendingWithdrawals(agent),  0);
        assertEq(escrow.pendingWithdrawals(buyer),  TOTAL);
    }

    // ── Test 6: Buyer triggers resolveDisputeDefault after 14 days ───────────
    function test_ResolveDisputeDefaultAfter14Days() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        // Warp 14 days past dispute opened (deadline is 30 days so still within)
        skip(14 days + 1);

        vm.prank(buyer);
        escrow.resolveDisputeDefault(dealId);

        assertEq(escrow.pendingWithdrawals(buyer), TOTAL);
        assertEq(escrow.pendingWithdrawals(seller), 0);
        assertEq(escrow.pendingWithdrawals(agent),  0);
    }

    // ── Test 7: refundExpired after deadline ──────────────────────────────────
    function test_RefundExpiredAfterDeadline() public {
        uint256 dealId = _createAcceptFund();
        // Only release milestone 0; 1 and 2 remain
        _cycleApprove(dealId, 0);

        // Warp past the 30-day deadline
        skip(31 days);

        vm.prank(stranger);
        escrow.refundExpired(dealId);

        // Buyer receives remaining (M1 + M2)
        assertEq(escrow.pendingWithdrawals(buyer), M1 + M2);
    }

    // ── Test 8: Multiple pendingWithdrawals accumulate then single withdraw ───
    function test_AccumulateMultipleDealsWithdrawOnce() public {
        // Deal 1
        uint256 dealId1 = _createAcceptFund();
        _cycleApprove(dealId1, 0);

        // Deal 2 — buyer still has approval from setUp; mint extra to cover 2nd deal
        usdc.mint(buyer, TOTAL);
        uint256 dealId2 = _createAcceptFund();
        _cycleApprove(dealId2, 0);

        uint256 expectedSeller = _sellerAmt(M0) * 2;
        uint256 expectedAgent  = _agentAmt(M0) * 2;

        assertEq(escrow.pendingWithdrawals(seller), expectedSeller);
        assertEq(escrow.pendingWithdrawals(agent),  expectedAgent);

        // Single withdraw for seller covers both deals
        uint256 balBefore = usdc.balanceOf(seller);
        vm.prank(seller);
        escrow.withdraw();
        assertEq(usdc.balanceOf(seller), balBefore + expectedSeller);
        assertEq(escrow.pendingWithdrawals(seller), 0);

        // Single withdraw for agent covers both deals
        balBefore = usdc.balanceOf(agent);
        vm.prank(agent);
        escrow.withdraw();
        assertEq(usdc.balanceOf(agent), balBefore + expectedAgent);
        assertEq(escrow.pendingWithdrawals(agent), 0);
    }

    // ── Deployment & Initialization ───────────────────────────────────────────
    function test_Deploy_UsdcAddressStoredCorrectly() public view {
        assertEq(address(escrow.usdc()), address(usdc));
    }

    function test_CreateDeal_StorageFields() public {
        uint256 dealId = _createDeal();
        _assertStorageAddresses(dealId);
        _assertStorageAmounts(dealId);
    }

    function _assertStorageAddresses(uint256 dealId) internal view {
        (address b, address s, address ag, address ar, address tok, , , , , , , , ) =
            escrow.deals(dealId);
        assertEq(b,   buyer);
        assertEq(s,   seller);
        assertEq(ag,  agent);
        assertEq(ar,  arbiter);
        assertEq(tok, address(usdc));
    }

    function _assertStorageAmounts(uint256 dealId) internal view {
        (, , , , , uint256 tot, uint256 abps, uint256 dl, , , , , ) =
            escrow.deals(dealId);
        assertEq(tot,  TOTAL);
        assertEq(abps, AGENT_BPS);
        assertGt(dl,   block.timestamp);
    }

    function test_CreateDeal_EmitsDealCreated() public {
        uint256 expectedId = escrow.dealCount() + 1;
        uint256 deadline = block.timestamp + DEAL_DEADLINE_OFFSET;

        vm.expectEmit(true, true, true, true, address(escrow));
        emit EquipmentEscrow.DealCreated(
            expectedId, buyer, seller, agent, arbiter,
            TOTAL, AGENT_BPS, deadline
        );
        vm.prank(buyer);
        escrow.createDeal(seller, agent, arbiter, TOTAL, AGENT_BPS, MILE_PCT, deadline);
    }

    // ── Test: acceptDeal emits DealAccepted ───────────────────────────────────
    function test_AcceptDeal_EmitsDealAccepted() public {
        uint256 dealId = _createDeal();

        vm.expectEmit(true, true, false, false, address(escrow));
        emit EquipmentEscrow.DealAccepted(dealId, seller);
        vm.prank(seller);
        escrow.acceptDeal(dealId);
    }

    // ── Test: fundDeal emits DealFunded ──────────────────────────────────────
    function test_FundDeal_EmitsDealFunded() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit EquipmentEscrow.DealFunded(dealId, buyer, TOTAL);
        vm.prank(buyer);
        escrow.fundDeal(dealId);
    }

    // ── Test: cancelDeal (buyer cancels Proposed) emits DealCancelled ─────────
    function test_CancelDeal_BuyerCancelsProposed_EmitsDealCancelled() public {
        uint256 dealId = _createDeal();

        vm.expectEmit(true, true, false, false, address(escrow));
        emit EquipmentEscrow.DealCancelled(dealId, buyer);
        vm.prank(buyer);
        escrow.cancelDeal(dealId);
    }

    // ── Test: cancelDeal after ACCEPTANCE_TIMEOUT by stranger ─────────────────
    function test_CancelDeal_AfterAcceptanceTimeout_AnyoneCancels() public {
        uint256 dealId = _createDeal();

        skip(escrow.ACCEPTANCE_TIMEOUT() + 1);

        vm.prank(stranger);
        escrow.cancelDeal(dealId);

        // Verify status is Cancelled (no funds involved — just status check via DealNotActive)
        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealAlreadyCancelled.selector);
        escrow.acceptDeal(dealId);
    }

    // ── Test: cancelDeal after deadline (still Proposed) ─────────────────────
    function test_CancelDeal_AfterDeadlinePassed_AnyoneCancels() public {
        uint256 dealId = _createDeal();

        skip(31 days); // past the 30-day deadline

        vm.prank(stranger);
        escrow.cancelDeal(dealId);

        // Confirm cancelled: acceptDeal must revert with DealAlreadyCancelled
        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealAlreadyCancelled.selector);
        escrow.acceptDeal(dealId);
    }

    function test_CompleteMilestone_EmitsMilestoneCompleted() public {
        uint256 dealId = _createAcceptFund();
        uint256 expectedTs = block.timestamp;

        vm.expectEmit(true, true, false, true, address(escrow));
        emit EquipmentEscrow.MilestoneCompleted(dealId, 0, expectedTs);
        vm.prank(seller);
        escrow.completeMilestone(dealId, 0);
    }

    function test_ApproveMilestone_EmitsMilestoneReleased() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        uint256 expectedSeller = _sellerAmt(M0);
        uint256 expectedAgent  = _agentAmt(M0);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit EquipmentEscrow.MilestoneReleased(dealId, 0, expectedSeller, expectedAgent);
        vm.prank(buyer);
        escrow.approveMilestone(dealId, 0);
    }

    function test_Withdraw_EmitsWithdrawn() public {
        uint256 dealId = _createAcceptFund();
        _cycleApprove(dealId, 0);

        uint256 expectedSeller = _sellerAmt(M0);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit EquipmentEscrow.Withdrawn(seller, expectedSeller);
        vm.prank(seller);
        escrow.withdraw();
    }

    function test_OpenDispute_EmitsDisputeOpened() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.expectEmit(true, true, false, false, address(escrow));
        emit EquipmentEscrow.DisputeOpened(dealId, buyer);
        vm.prank(buyer);
        escrow.openDispute(dealId);
    }

    function test_SellerCanOpenDispute() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.expectEmit(true, true, false, false, address(escrow));
        emit EquipmentEscrow.DisputeOpened(dealId, seller);
        vm.prank(seller);
        escrow.openDispute(dealId);
    }

    // ── Test: terms immutability — storage unchanged after fundDeal ───────────
    // Verify buyer/seller/total are the same before and after funding.
    function test_TermsUnchangedAfterFundDeal() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId);
        _assertAddressTerms(dealId);  // own stack frame
        _assertAmountTerms(dealId);   // own stack frame
        _fundDeal(dealId);
        _assertAddressTerms(dealId);
        _assertAmountTerms(dealId);
    }

    /// @dev Verify buyer/seller/agent/arbiter — each gets its own call frame (avoids stack-too-deep).
    function _assertAddressTerms(uint256 dealId) internal view {
        (address b, address s, address ag, address ar, , , , , , , , , ) =
            escrow.deals(dealId);
        assertEq(b,  buyer,   "buyer mismatch");
        assertEq(s,  seller,  "seller mismatch");
        assertEq(ag, agent,   "agent mismatch");
        assertEq(ar, arbiter, "arbiter mismatch");
    }

    /// @dev Verify totalAmount/agentBps — own call frame.
    function _assertAmountTerms(uint256 dealId) internal view {
        (, , , , , uint256 tot, uint256 abps, , , , , , ) = escrow.deals(dealId);
        assertEq(tot,  TOTAL,     "total mismatch");
        assertEq(abps, AGENT_BPS, "agentBps mismatch");
    }
}

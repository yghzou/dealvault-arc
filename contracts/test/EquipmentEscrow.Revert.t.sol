// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EquipmentEscrowTestBase} from "./EquipmentEscrow.Base.t.sol";
import {EquipmentEscrow} from "../EquipmentEscrow.sol";

contract EquipmentEscrowRevertTest is EquipmentEscrowTestBase {

    // ════════════════════════════════════════════════════════════════════════
    // EXISTING REVERT TESTS (updated to use _createAcceptFund)
    // ════════════════════════════════════════════════════════════════════════

    // ── Test 9: Double release ────────────────────────────────────────────────
    function test_Revert_ApproveMilestoneTwice_AlreadyReleased() public {
        uint256 dealId = _createAcceptFund();
        _cycleApprove(dealId, 0);

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.AlreadyReleased.selector);
        escrow.approveMilestone(dealId, 0);
    }

    // ── Test 10: Wrong caller – seller calls approveMilestone ─────────────────
    function test_Revert_SellerCallsApproveMilestone_Unauthorized() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.approveMilestone(dealId, 0);
    }

    // ── Test 11: Wrong caller – buyer calls completeMilestone ─────────────────
    function test_Revert_BuyerCallsCompleteMilestone_Unauthorized() public {
        uint256 dealId = _createAcceptFund();

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.completeMilestone(dealId, 0);
    }

    // ── Test 12: Out-of-order completion ──────────────────────────────────────
    function test_Revert_OutOfOrderCompletion_MilestoneNotComplete() public {
        uint256 dealId = _createAcceptFund();
        // Milestone 0 is marked complete but NOT yet released
        _complete(dealId, 0);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.MilestoneNotComplete.selector);
        escrow.completeMilestone(dealId, 1);
    }

    // ── Test 13: Claim before timeout ────────────────────────────────────────
    function test_Revert_ClaimMilestoneBeforeTimeout_TimeoutNotElapsed() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        // Only 3 days elapsed, 7 required
        skip(3 days);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.TimeoutNotElapsed.selector);
        escrow.claimMilestone(dealId, 0);
    }

    // ── Test 14: Open dispute on uncompleted milestone ────────────────────────
    function test_Revert_OpenDisputeOnUncompletedMilestone_MilestoneNotComplete() public {
        uint256 dealId = _createAcceptFund();
        // No milestone has been marked complete

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.MilestoneNotComplete.selector);
        escrow.openDispute(dealId);
    }

    // ── Test 15: Duplicate dispute ────────────────────────────────────────────
    function test_Revert_DuplicateDispute_DisputeAlreadyOpen() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.DisputeAlreadyOpen.selector);
        escrow.openDispute(dealId);
    }

    // ── Test 16: resolveDispute from non-arbiter ──────────────────────────────
    function test_Revert_ResolveDisputeNonArbiter_Unauthorized() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.resolveDispute(dealId, 5_000);
    }

    // ── Test 17: resolveDisputeDefault before 14 days ─────────────────────────
    function test_Revert_ResolveDisputeDefaultTooEarly_TimeoutNotElapsed() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        skip(7 days); // Only 7 days, need 14

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.TimeoutNotElapsed.selector);
        escrow.resolveDisputeDefault(dealId);
    }

    // ── Test 18: resolveDisputeDefault by non-buyer ───────────────────────────
    function test_Revert_ResolveDisputeDefaultNonBuyer_Unauthorized() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        skip(14 days + 1);

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.resolveDisputeDefault(dealId);
    }

    // ── Test 19: refundExpired before deadline ────────────────────────────────
    function test_Revert_RefundExpiredBeforeDeadline_DealNotExpired() public {
        uint256 dealId = _createAcceptFund();

        // Deal deadline is 30 days out; only 1 day has passed
        skip(1 days);

        vm.expectRevert(EquipmentEscrow.DealNotExpired.selector);
        escrow.refundExpired(dealId);
    }

    // ── Test 20: createDeal with milestonePercentages not summing to 10000 ───
    function test_Revert_CreateDealBadMilestonePct_InvalidPercentages() public {
        uint256[3] memory badPct = [uint256(3_000), uint256(3_000), uint256(3_000)]; // sums to 9000

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.InvalidPercentages.selector);
        escrow.createDeal(
            seller, agent, arbiter,
            TOTAL, AGENT_BPS,
            badPct,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // ── Test 21: createDeal with agentBps > 10000 ─────────────────────────────
    function test_Revert_CreateDealAgentBpsOverMax_InvalidPercentages() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.InvalidPercentages.selector);
        escrow.createDeal(
            seller, agent, arbiter,
            TOTAL, 10_001, // > 10 000
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // ── Test 22: createDeal with zero totalAmount ─────────────────────────────
    function test_Revert_CreateDealZeroAmount_InvalidAmount() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.InvalidAmount.selector);
        escrow.createDeal(
            seller, agent, arbiter,
            0, AGENT_BPS,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // ── Test 23: createDeal with zero-address seller ──────────────────────────
    function test_Revert_CreateDealZeroSeller_ZeroAddress() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.ZeroAddress.selector);
        escrow.createDeal(
            address(0), agent, arbiter,
            TOTAL, AGENT_BPS,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // ── Test 24: getDeal with invalid dealId ──────────────────────────────────
    function test_Revert_GetDealInvalidId_DealNotFound() public {
        // No deals created yet; dealId 999 doesn't exist
        vm.expectRevert(EquipmentEscrow.DealNotFound.selector);
        escrow.completeMilestone(999, 0);
    }

    // ── Extra existing revert coverage ───────────────────────────────────────

    // Stranger cannot open dispute
    function test_Revert_StrangerOpensDispute_Unauthorized() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.openDispute(dealId);
    }

    // completeMilestone after deadline → DealExpired
    function test_Revert_CompleteMilestoneAfterDeadline_DealExpired() public {
        uint256 dealId = _createAcceptFund();
        skip(31 days);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealExpired.selector);
        escrow.completeMilestone(dealId, 0);
    }

    // approveMilestone when dispute is open → ActiveDispute
    function test_Revert_ApproveMilestoneDuringDispute_ActiveDispute() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.ActiveDispute.selector);
        escrow.approveMilestone(dealId, 0);
    }

    // claimMilestone when dispute is open → ActiveDispute
    function test_Revert_ClaimMilestoneDuringDispute_ActiveDispute() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);
        skip(7 days + 1);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.ActiveDispute.selector);
        escrow.claimMilestone(dealId, 0);
    }

    // withdraw() with zero balance → InvalidAmount
    function test_Revert_WithdrawZeroBalance_InvalidAmount() public {
        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.InvalidAmount.selector);
        escrow.withdraw();
    }

    // completeMilestone with index > 2 → InvalidMilestone
    function test_Revert_InvalidMilestoneIndex() public {
        uint256 dealId = _createAcceptFund();
        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.InvalidMilestone.selector);
        escrow.completeMilestone(dealId, 3);
    }

    // completeMilestone twice → MilestoneAlreadyCompleted
    function test_Revert_CompleteMilestoneTwice_AlreadyCompleted() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.MilestoneAlreadyCompleted.selector);
        escrow.completeMilestone(dealId, 0);
    }

    // createDeal with past deadline → DealExpired
    function test_Revert_CreateDealPastDeadline_DealExpired() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.DealExpired.selector);
        escrow.createDeal(
            seller, agent, arbiter,
            TOTAL, AGENT_BPS,
            MILE_PCT,
            block.timestamp // must be strictly > current ts
        );
    }

    // constructor with zero USDC address → ZeroAddress
    function test_Revert_ConstructorZeroUsdc_ZeroAddress() public {
        vm.expectRevert(EquipmentEscrow.ZeroAddress.selector);
        new EquipmentEscrow(address(0));
    }

    // resolveDispute with sellerShare > 10000 → InvalidPercentages
    function test_Revert_ResolveDisputeInvalidShare_InvalidPercentages() public {
        uint256 dealId = _createAcceptFund();
        _complete(dealId, 0);

        vm.prank(buyer);
        escrow.openDispute(dealId);

        vm.prank(arbiter);
        vm.expectRevert(EquipmentEscrow.InvalidPercentages.selector);
        escrow.resolveDispute(dealId, 10_001);
    }

    // resolveDispute with no active dispute → NoActiveDispute
    function test_Revert_ResolveDisputeNoDispute_NoActiveDispute() public {
        uint256 dealId = _createAcceptFund();

        vm.prank(arbiter);
        vm.expectRevert(EquipmentEscrow.NoActiveDispute.selector);
        escrow.resolveDispute(dealId, 5_000);
    }

    // resolveDisputeDefault with no active dispute → NoActiveDispute
    function test_Revert_ResolveDisputeDefaultNoDispute_NoActiveDispute() public {
        uint256 dealId = _createAcceptFund();

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.NoActiveDispute.selector);
        escrow.resolveDisputeDefault(dealId);
    }

    // refundExpired when already fully released → AlreadyReleased
    function test_Revert_RefundExpiredAlreadyReleased_AlreadyReleased() public {
        uint256 dealId = _createAcceptFund();
        _cycleApprove(dealId, 0);
        _cycleApprove(dealId, 1);
        _cycleApprove(dealId, 2);

        skip(31 days);

        vm.expectRevert(EquipmentEscrow.AlreadyReleased.selector);
        escrow.refundExpired(dealId);
    }

    // createDeal with zero-address agent → ZeroAddress
    function test_Revert_CreateDealZeroAgent_ZeroAddress() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.ZeroAddress.selector);
        escrow.createDeal(
            seller, address(0), arbiter,
            TOTAL, AGENT_BPS,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // createDeal with zero-address arbiter → ZeroAddress
    function test_Revert_CreateDealZeroArbiter_ZeroAddress() public {
        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.ZeroAddress.selector);
        escrow.createDeal(
            seller, agent, address(0),
            TOTAL, AGENT_BPS,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // NEW REVERT TESTS for the 3-step lifecycle
    // ════════════════════════════════════════════════════════════════════════

    // ── fundDeal before acceptDeal → Unauthorized (status != Accepted) ────────
    function test_Revert_FundDealBeforeAccept_Unauthorized() public {
        uint256 dealId = _createDeal(); // Proposed, not Accepted

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.fundDeal(dealId);
    }

    // ── completeMilestone on a Proposed deal → DealNotActive ─────────────────
    function test_Revert_CompleteMilestoneOnProposed_DealNotActive() public {
        uint256 dealId = _createDeal(); // Proposed

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealNotActive.selector);
        escrow.completeMilestone(dealId, 0);
    }

    // ── completeMilestone on an Accepted (unfunded) deal → DealNotActive ─────
    function test_Revert_CompleteMilestoneOnAccepted_DealNotActive() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId); // Accepted, not funded

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealNotActive.selector);
        escrow.completeMilestone(dealId, 0);
    }

    // ── Wrong caller on acceptDeal: buyer calling → Unauthorized ─────────────
    function test_Revert_BuyerCallsAcceptDeal_Unauthorized() public {
        uint256 dealId = _createDeal();

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.acceptDeal(dealId);
    }

    // ── Stranger calling acceptDeal → Unauthorized ────────────────────────────
    function test_Revert_StrangerCallsAcceptDeal_Unauthorized() public {
        uint256 dealId = _createDeal();

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.acceptDeal(dealId);
    }

    // ── acceptDeal after cancel → DealAlreadyCancelled ───────────────────────
    function test_Revert_AcceptDealAfterCancel_DealAlreadyCancelled() public {
        uint256 dealId = _createDeal();

        vm.prank(buyer);
        escrow.cancelDeal(dealId);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealAlreadyCancelled.selector);
        escrow.acceptDeal(dealId);
    }

    // ── acceptDeal after ACCEPTANCE_TIMEOUT elapsed → AcceptanceTimeoutElapsed
    function test_Revert_AcceptDealAfterTimeout_AcceptanceTimeoutElapsed() public {
        uint256 dealId = _createDeal();

        skip(escrow.ACCEPTANCE_TIMEOUT() + 1);

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.AcceptanceTimeoutElapsed.selector);
        escrow.acceptDeal(dealId);
    }

    // ── cancelDeal on an Active (funded) deal → Unauthorized ─────────────────
    function test_Revert_CancelDealWhenActive_Unauthorized() public {
        uint256 dealId = _createAcceptFund(); // Active

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.cancelDeal(dealId);
    }

    // ── cancelDeal on an Active deal as stranger → Unauthorized ──────────────
    function test_Revert_CancelDealActiveAsStranger_Unauthorized() public {
        uint256 dealId = _createAcceptFund(); // Active

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.cancelDeal(dealId);
    }

    // ── Double accept → DealAlreadyAccepted ──────────────────────────────────
    function test_Revert_AcceptDealTwice_DealAlreadyAccepted() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId); // Accepted

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealAlreadyAccepted.selector);
        escrow.acceptDeal(dealId);
    }

    // ── fundDeal twice → DealAlreadyFunded ───────────────────────────────────
    function test_Revert_FundDealTwice_DealAlreadyFunded() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId);
        _fundDeal(dealId); // Active (funded)

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.DealAlreadyFunded.selector);
        escrow.fundDeal(dealId);
    }

    // ── acceptDeal after deadline passed (still Proposed) → DealExpired ───────
    function test_Revert_AcceptDealAfterDeadline_DealExpired() public {
        uint256 dealId = _createDeal();

        skip(31 days); // past 30-day deadline

        vm.prank(seller);
        vm.expectRevert(EquipmentEscrow.DealExpired.selector);
        escrow.acceptDeal(dealId);
    }

    // ── fundDeal by non-buyer → Unauthorized ─────────────────────────────────
    function test_Revert_FundDealByNonBuyer_Unauthorized() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId);

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.fundDeal(dealId);
    }

    // ── cancelDeal on Accepted deal (no timeout) by stranger → Unauthorized ──
    function test_Revert_CancelAcceptedDealByStranger_Unauthorized() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId); // Accepted, within timeout

        vm.prank(stranger);
        vm.expectRevert(EquipmentEscrow.Unauthorized.selector);
        escrow.cancelDeal(dealId);
    }

    // ── openDispute on Proposed deal → DealNotActive ─────────────────────────
    function test_Revert_OpenDisputeOnProposed_DealNotActive() public {
        uint256 dealId = _createDeal();

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.DealNotActive.selector);
        escrow.openDispute(dealId);
    }

    // ── openDispute on Accepted deal → DealNotActive ─────────────────────────
    function test_Revert_OpenDisputeOnAccepted_DealNotActive() public {
        uint256 dealId = _createDeal();
        _acceptDeal(dealId);

        vm.prank(buyer);
        vm.expectRevert(EquipmentEscrow.DealNotActive.selector);
        escrow.openDispute(dealId);
    }

    // ── refundExpired on Proposed deal → DealNotActive ───────────────────────
    function test_Revert_RefundExpiredOnProposed_DealNotActive() public {
        uint256 dealId = _createDeal();
        skip(31 days);

        vm.expectRevert(EquipmentEscrow.DealNotActive.selector);
        escrow.refundExpired(dealId);
    }
}

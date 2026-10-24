// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {EquipmentEscrow} from "../EquipmentEscrow.sol";

/// @dev Shared fixture for all EquipmentEscrow test categories.
abstract contract EquipmentEscrowTestBase is Test {
    // ── Actors ────────────────────────────────────────────────────────────────
    address internal buyer   = makeAddr("buyer");
    address internal seller  = makeAddr("seller");
    address internal agent   = makeAddr("agent");
    address internal arbiter = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockERC20         internal usdc;
    EquipmentEscrow   internal escrow;

    // ── Common deal parameters ────────────────────────────────────────────────
    uint256 internal constant TOTAL   = 1_000e6;   // 1 000 USDC (6-dec)
    uint256 internal constant AGENT_BPS = 500;     // 5 %
    // 40 / 35 / 25 → sums to 10 000
    uint256[3] internal MILE_PCT = [uint256(4_000), uint256(3_500), uint256(2_500)];
    uint256 internal constant DEAL_DEADLINE_OFFSET = 30 days;

    // Pre-computed milestone amounts
    // m0 = TOTAL * 4000 / 10000 = 400e6
    // m1 = TOTAL * 3500 / 10000 = 350e6
    // m2 = TOTAL - m0 - m1      = 250e6
    uint256 internal constant M0 = 400e6;
    uint256 internal constant M1 = 350e6;
    uint256 internal constant M2 = 250e6;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new EquipmentEscrow(address(usdc));

        // Fund buyer with enough for many deals
        usdc.mint(buyer, TOTAL * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Create a standard deal (Proposed status). Returns dealId.
    function _createDeal() internal returns (uint256 dealId) {
        vm.prank(buyer);
        dealId = escrow.createDeal(
            seller, agent, arbiter,
            TOTAL, AGENT_BPS,
            MILE_PCT,
            block.timestamp + DEAL_DEADLINE_OFFSET
        );
    }

    /// Accept the deal as seller (Accepted status).
    function _acceptDeal(uint256 dealId) internal {
        vm.prank(seller);
        escrow.acceptDeal(dealId);
    }

    /// Fund the deal as buyer (Active status). Escrow receives USDC.
    function _fundDeal(uint256 dealId) internal {
        vm.prank(buyer);
        escrow.fundDeal(dealId);
    }

    /// One-liner: createDeal → acceptDeal → fundDeal. Returns dealId in Active status.
    function _createAcceptFund() internal returns (uint256 dealId) {
        dealId = _createDeal();
        _acceptDeal(dealId);
        _fundDeal(dealId);
    }

    /// Complete milestone `idx` as seller.
    function _complete(uint256 dealId, uint8 idx) internal {
        vm.prank(seller);
        escrow.completeMilestone(dealId, idx);
    }

    /// Approve milestone `idx` as buyer.
    function _approve(uint256 dealId, uint8 idx) internal {
        vm.prank(buyer);
        escrow.approveMilestone(dealId, idx);
    }

    /// Full single-milestone cycle: complete + approve.
    function _cycleApprove(uint256 dealId, uint8 idx) internal {
        _complete(dealId, idx);
        _approve(dealId, idx);
    }

    /// Expected seller amount for a given milestone amount after agent cut.
    function _sellerAmt(uint256 mileAmt) internal pure returns (uint256) {
        return mileAmt - (mileAmt * AGENT_BPS) / 10_000;
    }

    /// Expected agent amount for a given milestone amount.
    function _agentAmt(uint256 mileAmt) internal pure returns (uint256) {
        return (mileAmt * AGENT_BPS) / 10_000;
    }
}

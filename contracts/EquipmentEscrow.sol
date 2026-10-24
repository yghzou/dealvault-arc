// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EquipmentEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant AUTO_RELEASE_TIMEOUT = 7 days;
    uint256 public constant DISPUTE_TIMEOUT = 14 days;
    uint256 public constant ACCEPTANCE_TIMEOUT = 3 days;

    error DealNotFound();
    error Unauthorized();
    error AlreadyReleased();
    error MilestoneNotComplete();
    error TimeoutNotElapsed();
    error DisputeAlreadyOpen();
    error NoActiveDispute();
    error DealExpired();
    error DealNotExpired();
    error InvalidPercentages();
    error InvalidAmount();
    error ZeroAddress();
    error InvalidMilestone();
    error MilestoneAlreadyCompleted();
    error ActiveDispute();
    error DealNotActive();
    error DealAlreadyAccepted();
    error AcceptanceTimeoutElapsed();
    error DealAlreadyCancelled();
    error DealAlreadyFunded();

    enum DealStatus {
        Proposed,
        Accepted,
        Active,
        Cancelled
    }

    struct Milestone {
        uint256 amount;
        uint256 completedAt;
        bool released;
    }

    struct Deal {
        address buyer;
        address seller;
        address agent;
        address arbiter;
        address usdcToken;
        uint256 totalAmount;
        uint256 agentBps;
        uint256 deadline;
        DealStatus status;
        uint256 proposedAt;
        uint256[3] milestonePercentages;
        bool disputeOpen;
        uint256 disputeOpenedAt;
        address disputeOpener;
        Milestone[3] milestones;
    }

    IERC20 public immutable usdc;
    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;
    mapping(address => uint256) public pendingWithdrawals;

    event DealCreated(
        uint256 indexed dealId,
        address indexed buyer,
        address indexed seller,
        address agent,
        address arbiter,
        uint256 totalAmount,
        uint256 agentBps,
        uint256 deadline
    );
    event DealAccepted(uint256 indexed dealId, address indexed seller);
    event DealFunded(uint256 indexed dealId, address indexed buyer, uint256 amount);
    event DealCancelled(uint256 indexed dealId, address indexed canceller);
    event MilestoneCompleted(uint256 indexed dealId, uint8 indexed milestoneIndex, uint256 completedAt);
    event MilestoneReleased(uint256 indexed dealId, uint8 indexed milestoneIndex, uint256 sellerAmount, uint256 agentAmount);
    event DisputeOpened(uint256 indexed dealId, address indexed opener);
    event DisputeResolved(
        uint256 indexed dealId,
        uint256 sellerShare,
        uint256 sellerAmount,
        uint256 agentAmount,
        uint256 refundAmount
    );
    event DealRefunded(uint256 indexed dealId, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    function createDeal(
        address seller,
        address agent,
        address arbiter,
        uint256 totalAmount,
        uint256 agentBps,
        uint256[3] calldata milestonePercentages,
        uint256 deadline
    ) external nonReentrant returns (uint256 dealId) {
        if (seller == address(0) || agent == address(0) || arbiter == address(0)) revert ZeroAddress();
        if (totalAmount == 0) revert InvalidAmount();
        if (agentBps > 10_000) revert InvalidPercentages();
        if (deadline <= block.timestamp) revert DealExpired();

        uint256 bpsSum = milestonePercentages[0] + milestonePercentages[1] + milestonePercentages[2];
        if (bpsSum != 10_000) revert InvalidPercentages();

        dealId = ++dealCount;
        Deal storage deal = deals[dealId];
        deal.buyer = msg.sender;
        deal.seller = seller;
        deal.agent = agent;
        deal.arbiter = arbiter;
        deal.usdcToken = address(usdc);
        deal.totalAmount = totalAmount;
        deal.agentBps = agentBps;
        deal.deadline = deadline;
        deal.status = DealStatus.Proposed;
        deal.proposedAt = block.timestamp;
        deal.milestonePercentages = milestonePercentages;

        uint256 milestone0Amount = (totalAmount * milestonePercentages[0]) / 10_000;
        uint256 milestone1Amount = (totalAmount * milestonePercentages[1]) / 10_000;
        uint256 milestone2Amount = totalAmount - milestone0Amount - milestone1Amount;

        deal.milestones[0].amount = milestone0Amount;
        deal.milestones[1].amount = milestone1Amount;
        deal.milestones[2].amount = milestone2Amount;

        emit DealCreated(dealId, msg.sender, seller, agent, arbiter, totalAmount, agentBps, deadline);
    }

    function acceptDeal(uint256 dealId) external {
        Deal storage deal = _getDeal(dealId);
        if (msg.sender != deal.seller) revert Unauthorized();
        if (deal.status == DealStatus.Accepted) revert DealAlreadyAccepted();
        if (deal.status == DealStatus.Active) revert DealAlreadyFunded();
        if (deal.status == DealStatus.Cancelled) revert DealAlreadyCancelled();
        if (deal.status != DealStatus.Proposed) revert Unauthorized();
        if (block.timestamp > deal.deadline) revert DealExpired();
        if (block.timestamp > deal.proposedAt + ACCEPTANCE_TIMEOUT) revert AcceptanceTimeoutElapsed();

        deal.status = DealStatus.Accepted;

        emit DealAccepted(dealId, msg.sender);
    }

    function fundDeal(uint256 dealId) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (msg.sender != deal.buyer) revert Unauthorized();
        if (deal.status == DealStatus.Active) revert DealAlreadyFunded();
        if (deal.status == DealStatus.Cancelled) revert DealAlreadyCancelled();
        if (deal.status != DealStatus.Accepted) revert Unauthorized();

        usdc.safeTransferFrom(msg.sender, address(this), deal.totalAmount);
        deal.status = DealStatus.Active;

        emit DealFunded(dealId, msg.sender, deal.totalAmount);
    }

    function cancelDeal(uint256 dealId) external nonReentrant {
        Deal storage deal = _getDeal(dealId);

        if (msg.sender == deal.buyer && deal.status == DealStatus.Proposed) {
            deal.status = DealStatus.Cancelled;
            emit DealCancelled(dealId, msg.sender);
            return;
        }

        if (deal.status == DealStatus.Proposed && block.timestamp > deal.proposedAt + ACCEPTANCE_TIMEOUT) {
            deal.status = DealStatus.Cancelled;
            emit DealCancelled(dealId, msg.sender);
            return;
        }

        if (deal.status == DealStatus.Proposed && block.timestamp > deal.deadline) {
            deal.status = DealStatus.Cancelled;
            emit DealCancelled(dealId, msg.sender);
            return;
        }

        revert Unauthorized();
    }

    function completeMilestone(uint256 dealId, uint8 milestoneIndex) external {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.seller) revert Unauthorized();
        if (block.timestamp > deal.deadline) revert DealExpired();
        if (milestoneIndex > 2) revert InvalidMilestone();

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.released) revert AlreadyReleased();
        if (milestone.completedAt != 0) revert MilestoneAlreadyCompleted();

        if (milestoneIndex > 0 && !deal.milestones[milestoneIndex - 1].released) revert MilestoneNotComplete();

        milestone.completedAt = block.timestamp;

        emit MilestoneCompleted(dealId, milestoneIndex, milestone.completedAt);
    }

    function approveMilestone(uint256 dealId, uint8 milestoneIndex) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.buyer) revert Unauthorized();
        if (deal.disputeOpen) revert ActiveDispute();
        if (milestoneIndex > 2) revert InvalidMilestone();

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.released) revert AlreadyReleased();
        if (milestone.completedAt == 0) revert MilestoneNotComplete();

        _releaseMilestone(dealId, deal, milestoneIndex, milestone.amount);
    }

    function claimMilestone(uint256 dealId, uint8 milestoneIndex) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.seller) revert Unauthorized();
        if (deal.disputeOpen) revert ActiveDispute();
        if (milestoneIndex > 2) revert InvalidMilestone();

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.released) revert AlreadyReleased();
        if (milestone.completedAt == 0) revert MilestoneNotComplete();
        if (block.timestamp < milestone.completedAt + AUTO_RELEASE_TIMEOUT) revert TimeoutNotElapsed();

        _releaseMilestone(dealId, deal, milestoneIndex, milestone.amount);
    }

    function openDispute(uint256 dealId) external {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.buyer && msg.sender != deal.seller) revert Unauthorized();
        if (block.timestamp > deal.deadline) revert DealExpired();
        if (deal.disputeOpen) revert DisputeAlreadyOpen();
        if (!_hasCompletedUnreleasedMilestone(deal)) revert MilestoneNotComplete();

        deal.disputeOpen = true;
        deal.disputeOpenedAt = block.timestamp;
        deal.disputeOpener = msg.sender;

        emit DisputeOpened(dealId, msg.sender);
    }

    function resolveDispute(uint256 dealId, uint256 sellerShare) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.arbiter) revert Unauthorized();
        if (!deal.disputeOpen) revert NoActiveDispute();
        if (sellerShare > 10_000) revert InvalidPercentages();

        uint256 remaining = _remainingEscrow(deal);
        if (remaining == 0) revert InvalidAmount();

        // Multiply before divide to avoid precision loss (no divide-before-multiply)
        uint256 agentAmount = (remaining * sellerShare * deal.agentBps) / (10_000 * 10_000);
        uint256 sellerAmount = (remaining * sellerShare) / 10_000 - agentAmount;
        uint256 refundAmount = remaining - sellerAmount - agentAmount;

        for (uint8 i = 0; i < 3; i++) {
            if (!deal.milestones[i].released) {
                deal.milestones[i].released = true;
            }
        }

        deal.disputeOpen = false;
        deal.disputeOpenedAt = 0;
        deal.disputeOpener = address(0);

        if (sellerAmount > 0) pendingWithdrawals[deal.seller] += sellerAmount;
        if (agentAmount > 0) pendingWithdrawals[deal.agent] += agentAmount;
        if (refundAmount > 0) pendingWithdrawals[deal.buyer] += refundAmount;

        emit DisputeResolved(dealId, sellerShare, sellerAmount, agentAmount, refundAmount);
    }

    function resolveDisputeDefault(uint256 dealId) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (msg.sender != deal.buyer) revert Unauthorized();
        if (!deal.disputeOpen) revert NoActiveDispute();
        if (block.timestamp < deal.disputeOpenedAt + DISPUTE_TIMEOUT) revert TimeoutNotElapsed();

        uint256 remaining = _remainingEscrow(deal);
        if (remaining == 0) revert InvalidAmount();

        for (uint8 i = 0; i < 3; i++) {
            if (!deal.milestones[i].released) {
                deal.milestones[i].released = true;
            }
        }

        deal.disputeOpen = false;
        deal.disputeOpenedAt = 0;
        deal.disputeOpener = address(0);

        pendingWithdrawals[deal.buyer] += remaining;

        emit DisputeResolved(dealId, 0, 0, 0, remaining);
    }

    function refundExpired(uint256 dealId) external nonReentrant {
        Deal storage deal = _getDeal(dealId);
        if (deal.status != DealStatus.Active) revert DealNotActive();
        if (block.timestamp <= deal.deadline) revert DealNotExpired();
        if (deal.disputeOpen && block.timestamp < deal.disputeOpenedAt + DISPUTE_TIMEOUT) revert DisputeAlreadyOpen();

        uint256 remaining = _remainingEscrow(deal);
        if (remaining == 0) revert AlreadyReleased();

        for (uint8 i = 0; i < 3; i++) {
            if (!deal.milestones[i].released) {
                deal.milestones[i].released = true;
            }
        }

        deal.disputeOpen = false;
        deal.disputeOpenedAt = 0;
        deal.disputeOpener = address(0);

        pendingWithdrawals[deal.buyer] += remaining;

        emit DealRefunded(dealId, remaining);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert InvalidAmount();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function _releaseMilestone(uint256 dealId, Deal storage deal, uint8 milestoneIndex, uint256 milestoneAmount) internal {
        Milestone storage milestone = deal.milestones[milestoneIndex];
        milestone.released = true;

        uint256 agentAmount = (milestoneAmount * deal.agentBps) / 10_000;
        uint256 sellerAmount = milestoneAmount - agentAmount;

        if (sellerAmount > 0) pendingWithdrawals[deal.seller] += sellerAmount;
        if (agentAmount > 0) pendingWithdrawals[deal.agent] += agentAmount;

        emit MilestoneReleased(dealId, milestoneIndex, sellerAmount, agentAmount);
    }

    function _remainingEscrow(Deal storage deal) internal view returns (uint256 remaining) {
        for (uint8 i = 0; i < 3; i++) {
            if (!deal.milestones[i].released) {
                remaining += deal.milestones[i].amount;
            }
        }
    }

    function _hasCompletedUnreleasedMilestone(Deal storage deal) internal view returns (bool) {
        for (uint8 i = 0; i < 3; i++) {
            if (!deal.milestones[i].released && deal.milestones[i].completedAt != 0) {
                return true;
            }
        }
        return false;
    }

    function _getDeal(uint256 dealId) internal view returns (Deal storage deal) {
        if (dealId == 0 || dealId > dealCount) revert DealNotFound();
        deal = deals[dealId];
    }

    /// @notice Returns the three milestone tuples for a deal (not accessible via the auto-getter).
    function getMilestones(uint256 dealId)
        external
        view
        returns (
            uint256[3] memory amounts,
            uint256[3] memory completedAts,
            bool[3] memory released
        )
    {
        Deal storage deal = _getDeal(dealId);
        for (uint8 i = 0; i < 3; i++) {
            amounts[i] = deal.milestones[i].amount;
            completedAts[i] = deal.milestones[i].completedAt;
            released[i] = deal.milestones[i].released;
        }
    }

    /// @notice Returns the stored milestone percentages (bps) for a deal.
    function getMilestonePercentages(uint256 dealId)
        external
        view
        returns (uint256[3] memory percentages)
    {
        Deal storage deal = _getDeal(dealId);
        percentages = deal.milestonePercentages;
    }
}

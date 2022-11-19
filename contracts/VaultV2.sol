// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ERC20.sol";

// Differences respect V1
// - anyone can create a vault
// - vaults have a purpose
// - anyone can fund a grant
// - users can withdraw any amount before collection

contract VaultV2 {

  address public owner;

  struct GrantStruct {
      uint256 id;
      string name;
      string purpose;
      address token;
      uint256 amount;
      address recipient;
      uint256 start;
      uint256 end;
  }

  // first grant created will have id = 0
  uint256 public currentGrantId;

  // a mapping which tracks all the grants by id
  mapping(uint256 => GrantStruct) public grants;

  // a mapping to track funders based on grantId
  mapping(uint256 => mapping(address => uint)) public funders;

  event Creation(
      uint256 id,
      string name,
      string purpose,
      address token,
      address recipient,
      uint256 start,
      uint256 end
  );

  event Fund(uint256 id, address token, uint256 amount, address user);
  event Withdraw(uint256 id, address token, uint256 amount, address user);
  event Claim(uint256 grantId, address token, uint256 amount, address recipient);

  modifier onlyOwner() {
      require(owner == msg.sender || msg.sender != tx.origin, "caller is not the owner");
      _;
  }

  constructor () {
      owner = msg.sender;
  }

  /// @notice Any user can create a new Grant
  /// @param token the erc20 token address
  /// @param name the name of the new Grant
  /// @param purpose the purpose of the new Grant
  /// @param recipient the address of the recipient who will claim the grant
  /// @return returns true on success, reverts on failure so cannot return false
  function createGrant(address token, string memory name, string memory purpose, address recipient) public returns (bool) {
      uint256 start = block.timestamp;
      // increase time by one week (60 * 60 * 24 * 7)
      uint256 end = start + 604800;
      // map new Grant by currentGrantId
      grants[currentGrantId] = GrantStruct(currentGrantId, name, purpose, token, 0, recipient, start, end);

      // emit Event
      emit Creation(currentGrantId, name, purpose, token, recipient, start, end);

      // increase id for next grant
      currentGrantId++;

      return true;
  }

  /// @notice Any user can fund an existing Grant
  /// @param grantId the Grant id to fund
  /// @param amount the amount to fund
  /// @return returns true on success, reverts on failure so cannot return false
  function fundGrant(uint256 grantId, uint256 amount) public returns (bool) {
      require((grants[grantId]).id == grantId, "grant id does not exist");
      require(block.timestamp < grants[grantId].end, "grant is ready for collection");
      require(amount > 0, "amount must be more than 0");

      address token = grants[grantId].token;
      address user = msg.sender;

      // check allowances
      uint256 allowance = ERC20(token).allowance(user, address(this));
      require(allowance >= amount, "token allowance must be more than amount");

      // transfer tokens to this contract
      ERC20(token).transferFrom(user, address(this), amount);

      // update Grant balances
      grants[grantId].amount += amount;

      // update user balance
      funders[grantId][user] += amount;

      // emit Event
      emit Fund(grantId, token, amount, user);

      return true;
  }

  /// @notice Any funder can withdraw from an existing Grant unless is ready for collection
  /// @param grantId the Grant id to fund
  /// @param amount the amount to withdraw
  /// @return returns true on success, reverts on failure so cannot return false
  function withdrawGrant(uint256 grantId, uint256 amount) public returns (bool) {
      require((grants[grantId]).id == grantId, "grant id does not exist");
      require(block.timestamp < grants[grantId].end, "grant is ready for collection");

      address user = msg.sender;
      require((funders[grantId][user] > 0), "user has nothing to withdraw");
      require((funders[grantId][user] > amount), "user amount is too high");

      address token = grants[grantId].token;

      // update Grant balances
      grants[grantId].amount -= amount;

      // update user balance
      funders[grantId][user] -= amount;

      // transfer tokens to user
      ERC20(token).transfer(user, amount);

      // emit Event
      emit Withdraw(grantId, token, amount, user);

      return true;
  }

  /// @notice Recipient claims a Grant, receiving all the tokens assigned to the Grant
  /// @param grantId the Grant id to be claimed
  /// @return returns true on success, reverts on failure so cannot return false
  function claimGrant(uint256 grantId) public returns (bool) {
      require((grants[grantId]).id == grantId, "grant id does not exist");
      require(block.timestamp >= grants[grantId].end, "grant is still locked");
      require((grants[grantId]).amount > 0, "grant has been removed");

      address recipient = (grants[grantId]).recipient;
      require(msg.sender == recipient, "caller is not the recipient");

      address token = grants[grantId].token;
      uint256 amount = grants[grantId].amount;
      grants[grantId].amount = 0;

      // transfer tokens to recipient
      ERC20(token).transfer(recipient, amount);

      // emit Event
      emit Claim(grantId, token, amount, recipient);
      
      return true;
  }

  // to support receiving ETH by default
  receive() external payable {}
  fallback() external payable {}
}

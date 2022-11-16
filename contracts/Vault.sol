// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./ERC20.sol";

contract Vault {

    address public owner;

    struct GrantStruct {
        uint256 id;
        string name;
        address token;
        uint256 amount;
        address recipient;
        uint256 start;
        uint256 end; // recipients will be able to claim a grant after 7 days of its creation
    }

    // first grant created will have id = 0
    uint256 public currentGrantId;

    // a mapping which tracks all the grants by id
    mapping(uint256 => GrantStruct) public grants;

    event Creation(
        uint256 id,
        string name,
        address token,
        uint256 amount,
        address recipient,
        uint256 start,
        uint256 end
    );

    event Removal(uint256 id, address token, uint256 amount);
    event Claim(uint256 grantId, address token, uint256 amount, address recipient);

    modifier onlyOwner() {
        require(owner == msg.sender || msg.sender != tx.origin, "caller is not the owner");
        _;
    }
    
    constructor () {
        owner = msg.sender;
    }
    
    /// @notice Creates a new Grant
    /// @param token the erc20 token address
    /// @param name the name of the new Grant
    /// @param amount the amount of tokens assigned to the new Grant
    /// @param recipient the address of the recipient who will claim the grant
    /// @return returns true on success, reverts on failure so cannot return false
    function createGrant(address token, string memory name, uint256 amount, address recipient) public onlyOwner returns (bool) {
        require(amount > 0, "amount must be more than 0");

        // check allowances
        uint256 allowance = ERC20(token).allowance(msg.sender, address(this));
        require(allowance >= amount, "token allowance must be more than amount");

        // transfer tokens to this contract
        ERC20(token).transferFrom(msg.sender, address(this), amount);

        uint256 start = block.timestamp;
        // increase time by one week (60 * 60 * 24 * 7)
        uint256 end = start + 604800;
        // map new Grant by currentGrantId
        grants[currentGrantId] = GrantStruct(currentGrantId, name, token, amount, recipient, start, end);

        // emit Event
        emit Creation(currentGrantId, name, token, amount, recipient, start, end);

        // increase id for next grant
        currentGrantId++;

        return true;
    }

    /// @notice Owner removes a Grant, receiving all the tokens assigned to the Grant
    /// @param grantId the Grant id to be removed
    /// @return returns true on success, reverts on failure so cannot return false
    /// @dev in this first version, there is only one funder per grant, the contract owner
    function removeGrant(uint256 grantId) public onlyOwner returns (bool) {
        require((grants[grantId]).id == grantId, "grant id does not exist");
        require(block.timestamp < grants[grantId].end, "grant is ready for collection");
        require((grants[grantId]).amount > 0, "grant amount is zero");

        address token = grants[grantId].token;
        uint256 amount = grants[grantId].amount;
        grants[grantId].amount = 0;

        // transfer tokens to owner
        ERC20(token).transfer(owner, amount);

        // emit Event
        emit Removal(grantId, token, amount);

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
}

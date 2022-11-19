pragma solidity ^0.8.0;

import "./ERC20.sol";

// This yield farm accepts token deposits for integrators
// and takes a small fee which is claimable from farming profits


/**
1. I would rather have the Market smart contract isolated instead of being an extension of an ERC20
So, first I would deploy the ERC20 token with the corresponding name and symbol ("Market token", "MT")
And then, I would pass it in the constructor of the Market contract: 
ERC20 public immutable token;
constructor(address _token) {
    token = ERC20(_token);
}
*/
contract Market is ERC20 {

    address owner;

    mapping(address => bool) poolRegistration;
    mapping(bytes32 => bool) usedSignatures;

    // 2. Event definitions are missing

    constructor () ERC20("Market token", "MT") {
        owner = msg.sender;
    }

    function deposit(address pool, address token, uint256 amount) external payable {
        // Only registered safe pools
        // 3. An error description is missing e.g. "pool is not registered"
        require(poolRegistration[pool]);

        /**
        4. It is not a good practice to use decimals, msg.value == 10**17 would be better
        It also does not make sense in my opinion to charge a fee in ether
        Also, it is good to have an error description, e.g. "not enough ether sent"
        */
        require(msg.value == 0.1 ether);
        // A fee for our managed yield farm
    
        /**
        5. This fee should not be a fixed amount. Otherwise, a user that deposits 10 DAI would receive the same MT tokens than a user that deposits 1,000 DAI
        Any user could divide their deposit into multiple deposits to receive many more MT tokens.
        If the goal is to create MT tokens that represent the user participation in the pool, I would calculate
        the user share of the pool and mint the tokens that represent given share. Something like:
        userShares = (amount * totalSupply) / balanceOf(address(this));
        _mint(msg.sender, userShares);
        */
        _mint(msg.sender, 0.1 ether);

        // 6. Before transfering tokens I would check the allowances from the depositor
        // Transfer the tokens to this contract
        ERC20(token).transferFrom(msg.sender, address(this), amount);
        
        // 7. I would make this call before the _mint and transferFrom, because we do not want to continue in case it fails
        // Call the fund management contract to enact the strategy
        (bool success, ) = pool.delegatecall(abi.encodeWithSignature(
            "tokenDeposit(address, address, uint256)", 
            msg.sender,
            token,
            amount));
        require(success, "deposit fail");

        // 8. An Event emission is missing here
    }

    // 9. It does not make sense to ask for the amount because the lpTokens is what is needed
    function withdraw(uint256 lpTokens, address pool, address token, uint256 amount) external {
        /**
        10. Some requirements are missing. The pool should be registered and the user must have enough lptokens
        require(poolRegistration[pool], "pool is not registered");
        uint256 balance = balanceOf[msg.sender];
        require(balance >= lpTokens, "user has not enough lpTokens");
        */

        // We call the pool to collect profits for us
        (bool success, ) = pool.delegatecall(abi.encodeWithSignature(
            "withdraw(address, address)", msg.sender, token));
        require(success, "withdraw failed");

        /**
        11. The rest of the steps in this function are in an incorrect order. Also, the calculations are wrong.
        
        First, I would calculate the amount to be transferred based on the lpTokens:
        uint amount = (lpTokens * balanceOf(address(this))) / totalSupply;

        Then, if the goal is to send a share of the contract ether balance to the user, without including
        the fees paid from all users deposit, there is no need to divide the totalSupply by 10, which
        is the result of (totalSupply*0.1 ether)/1e18. The totalSupply matches with the eth paid as fees when depositing.
        So, I would calculate the distributable like this:
        uint256 distributable = address(this).balance - totalSupply;
        uint256 ethUserShare = (lpTokens * distributable) / totalSupply;
        
        Then burn the tokens:
        _burn(msg.sender, lpTokens);
        
        Then safely transfer the tokens:
        ERC20(token).transfer(msg.sender, amount);

        And finally send the ether:
        payable(msg.sender).transfer(ethUserShare);
        */

        ERC20(token).transfer(msg.sender, amount);

        // Transfer them the contract excess value
        uint256 distributable = address(this).balance - (totalSupply*0.1 ether)/1e18;
        uint256 userShare = (distributable*lpTokens)/totalSupply;
        // Burn the LP tokens
        _burn(msg.sender, lpTokens);

        payable(msg.sender).transfer(userShare);

        // 12. An Event emission is missing here
    }

    // This extends our erc20 to allow signed lp token transfers
    function signedTransfer(address src, address dest, uint256 amount, bytes32 extraData, bytes32 r, bytes32 s, uint8 v) external {
        bytes32 sigHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", uint256(32), keccak256(abi.encodePacked(src, dest, amount, extraData))));
        require(src == ecrecover(sigHash, v, r, s), "invalid sig");
        require(!usedSignatures[sigHash], "replayed");
        balanceOf[src] -= amount;
        balanceOf[dest] += amount;

        // 13. An Event emission is missing here
    }

    // 14. Usually modifiers are defined before the functions.
    // It is a good practice to follow coding conventions.
    // Prevents anyone who is not the owner and contracts from
    // calling this contract
    modifier onlyOwner(){
        require(msg.sender == owner || msg.sender != tx.origin);
        _;
    }

    function registerPool(address pool) external onlyOwner() {
        // We want to scan pool's code for self destruct to ensure the
        // contract can't be destroyed
        bytes memory o_code;
        uint256 size;
        // From solidity docs
        assembly {
            // retrieve the size of the code, this needs assembly
            size := extcodesize(pool)
            // allocate output byte array - this could also be done without assembly
            // by using o_code = new bytes(size)
            o_code := mload(0x40)
            // new "memory end" including padding
            mstore(0x40, add(o_code, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            // store length in memory
            mstore(o_code, size)
            // actually retrieve the code, this needs assembly
            extcodecopy(pool, add(o_code, 0x20), 0, size)
        }

        require(size != 0, "un-deployed contract");

        for (uint256 i; i < o_code.length; i ++) {
            uint8 opcode = uint8(o_code[i]);
            require(
                // self destruct
                opcode != 0xff,

            "Forbidden code");
        }

        poolRegistration[pool] = true;

        // 15. An Event emission is missing here
    }

    function claimProfits() onlyOwner external {
        // 16. the transfer method is no longer recommended for sending Ether, .call is preferred instead
        payable(msg.sender).transfer(address(this).balance);
    }
}

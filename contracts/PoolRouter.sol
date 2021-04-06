// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;
pragma abicoder v2;

import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./IPoolRouter.sol";
import "./PoolTokenTypes.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "@yield-protocol/utils/contracts/token/IERC2612.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "dss-interfaces/src/dss/DaiAbstract.sol";
import "./helpers/RevertMsgExtractor.sol";
import "./helpers/TransferFromHelper.sol";
import "./IWETH9.sol";


contract PoolRouter /*is IPoolRouter*/ {
    using TransferFromHelper for IERC20;

    enum Operation {
        ROUTE, // 0
        TRANSFER_TO_POOL, // 1
        FORWARD_PERMIT, // 2
        FORWARD_DAI_PERMIT, // 3
        JOIN_ETHER, // 4
        EXIT_ETHER // 5
    }

    IPoolFactory public immutable factory;

    constructor(address _factory) {
        factory = IPoolFactory(_factory);
    }

    struct PoolAddresses {
        address base;
        address fyToken;
        address pool;
    }

    /// @dev Submit a series of calls for execution
    /// The `bases` and `fyTokens` parameters define the pools that will be target for operations
    /// Each trio of `target`, `operation` and `data` define one call:
    ///  - `target` is an index in the `bases` and `fyTokens` arrays, from which contract addresses the target will be determined.
    ///  - `operation` is a numerical identifier for the call to be executed, from the enum `Operation`
    ///  - `data` is an abi-encoded group of parameters, to be consumed by the function encoded in `operation`.
    function batch(
        address[] calldata bases,
        address[] calldata fyTokens,
        uint8[] calldata targets,
        Operation[] calldata operations,
        bytes[] calldata data
    ) external payable {    // TODO: I think we need `payable` to receive ether which we will deposit through `joinEther`
        require(bases.length == fyTokens.length, "Unmatched bases and fyTokens");
        require(targets.length == operations.length && operations.length == data.length, "Unmatched operation data");
        PoolAddresses[] memory pools = new PoolAddresses[](bases.length);
        for (uint256 i = 0; i < bases.length; i += 1) {
            pools[i] = PoolAddresses(bases[i], fyTokens[i], _findPool(bases[i], fyTokens[i]));
        }

        for (uint256 i = 0; i < operations.length; i += 1) {
            Operation operation = operations[i];
            PoolAddresses memory addresses = pools[targets[i]];
            
            if (operation == Operation.ROUTE) {
                route(addresses, data[i]);
            } else if (operation == Operation.TRANSFER_TO_POOL) {
                transferToPool(addresses, data[i]);
            } else if (operation == Operation.FORWARD_PERMIT) {
                forwardPermit(addresses, data[i]);
            } else if (operation == Operation.FORWARD_DAI_PERMIT) {
                forwardDaiPermit(addresses, data[i]);
            } else if (operation == Operation.JOIN_ETHER) {
                joinEther(addresses);
            } else if (operation == Operation.EXIT_ETHER) {
                exitEther(addresses, data[i]);
            } else {
                revert("Invalid operation");
            }
        }
    }

    /// @dev Return which pool contract matches the base and fyToken
    function _findPool(address base, address fyToken)
        internal view returns (address pool)
    {
        pool = factory.getPool(base, fyToken);
        require (pool != address(0), "Pool not found");
    }

    /// @dev Allow users to route calls to a pool, to be used with multicall
    function route(PoolAddresses memory addresses, bytes memory data)
        private
        returns (bool success, bytes memory result)
    {
        (success, result) = addresses.pool.call{ value: msg.value }(data);
        require(success, RevertMsgExtractor.getRevertMsg(result));
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with multicall
    function transferToPool(PoolAddresses memory addresses, bytes memory data)
        private
        returns (bool)
    {
        (uint128 wad, address token) = abi.decode(data, (uint128, address));
        require(token == addresses.base || token == addresses.fyToken || token == addresses.pool);

        IERC20(token).safeTransferFrom(msg.sender, address(addresses.pool), wad);
        return true;
    }

    // ---- Permit management ----

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken
    function forwardPermit(PoolAddresses memory addresses, bytes memory data)
        private
    {
        (
            address token,
            address spender,
            uint256 amount,
            uint256 deadline,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) = abi.decode(data, (address, address, uint256, uint256, uint8, bytes32, bytes32));
        
        require(token == addresses.base || token == addresses.fyToken || token == addresses.pool);
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken
    function forwardDaiPermit(PoolAddresses memory addresses, bytes memory data)
        private
    {
        (
            address spender,
            uint256 nonce,
            uint256 deadline,
            bool allowed,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) = abi.decode(data, (address, uint256, uint256, bool, uint8, bytes32, bytes32));

        // Only the base token would ever be Dai
        DaiAbstract(addresses.base).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }

    // ---- Ether management ----

    /// @dev The WETH9 contract will send ether to the PoolRouter on `weth.withdraw` using this function.
    receive() external payable { }

    /// @dev Accept Ether, wrap it and forward it to the WethJoin
    /// This function should be called first in a multicall, and the Join should keep track of stored reserves
    /// Passing the id for a join that doesn't link to a contract implemnting IWETH9 will fail
    function joinEther(PoolAddresses memory addresses)
        private
        returns (uint256 ethTransferred)
    {
        IWETH9 weth = IWETH9(addresses.base);
        ethTransferred = address(this).balance;

        weth.deposit{ value: ethTransferred }();   // TODO: Test gas savings using WETH10 `depositTo`
        weth.transfer(addresses.pool, ethTransferred);
    }

    /// @dev Unwrap Wrapped Ether held by this Ladle, and send the Ether
    /// This function should be called last in a multicall, and the Ladle should have no reason to keep an WETH balance
    function exitEther(PoolAddresses memory addresses, bytes memory data)
        private
        returns (uint256 ethTransferred)
    {
        IWETH9 weth = IWETH9(addresses.base);
        (address payable to) = abi.decode(data, (address));
        // TODO: Set the WETH contract on constructor or as governance, to avoid calls to unknown contracts
        ethTransferred = weth.balanceOf(address(this));

        weth.withdraw(ethTransferred);   // TODO: Test gas savings using WETH10 `withdrawTo`
        to.transfer(ethTransferred); /// TODO: Consider reentrancy and safe transfers
    }
}
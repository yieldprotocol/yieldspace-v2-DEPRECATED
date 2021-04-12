// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >= 0.8.0;
pragma abicoder v2;

import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolRouter.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "@yield-protocol/yieldspace-interfaces/PoolDataTypes.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "@yield-protocol/utils/contracts/token/IERC2612.sol";
import "dss-interfaces/src/dss/DaiAbstract.sol";
import "@yield-protocol/utils-v2/contracts/AllTransferHelper.sol";
import "@yield-protocol/utils-v2/contracts/Multicall.sol";
import "@yield-protocol/utils-v2/contracts/RevertMsgExtractor.sol";
import "@yield-protocol/utils-v2/contracts/IWETH9.sol";


contract PoolRouter is IPoolRouter, Multicall {
    using AllTransferHelper for IERC20;
    using AllTransferHelper for address payable;

    IPoolFactory public immutable factory;
    IWETH9 public immutable weth;

    constructor(IPoolFactory factory_, IWETH9 weth_) {
        factory = factory_;
        weth = weth_;
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
        PoolDataTypes.Operation[] calldata operations,
        bytes[] calldata data
    ) external payable override {
        require(bases.length == fyTokens.length, "Unmatched bases and fyTokens");
        require(targets.length == operations.length && operations.length == data.length, "Unmatched operation data");
        PoolAddresses[] memory pools = new PoolAddresses[](bases.length);
        for (uint256 i = 0; i < bases.length; i += 1) {
            pools[i] = PoolAddresses(bases[i], fyTokens[i], findPool(bases[i], fyTokens[i]));
        }

        for (uint256 i = 0; i < operations.length; i += 1) {
            PoolDataTypes.Operation operation = operations[i];
            PoolAddresses memory addresses = pools[targets[i]];
            
            if (operation == PoolDataTypes.Operation.ROUTE) {
                _route(addresses, data[i]);
            } else if (operation == PoolDataTypes.Operation.TRANSFER_TO_POOL) {
                (address token, uint128 wad) = abi.decode(data[i], (address, uint128));
                _transferToPool(addresses, token, wad);
            } else if (operation == PoolDataTypes.Operation.FORWARD_PERMIT) {
                (address token, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) = 
                    abi.decode(data[i], (address, address, uint256, uint256, uint8, bytes32, bytes32));
                _forwardPermit(addresses, token, spender, amount, deadline, v, r, s);
            } else if (operation == PoolDataTypes.Operation.FORWARD_DAI_PERMIT) {
                        (address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s) = 
                    abi.decode(data[i], (address, uint256, uint256, bool, uint8, bytes32, bytes32));
                _forwardDaiPermit(addresses, spender, nonce, deadline, allowed, v, r, s);
            } else if (operation == PoolDataTypes.Operation.JOIN_ETHER) {
                _joinEther(addresses.pool);
            } else if (operation == PoolDataTypes.Operation.EXIT_ETHER) {
                (address to) = abi.decode(data[i], (address));
                _exitEther(to);
            } else {
                revert("Invalid operation");
            }
        }
    }

    /// @dev Return which pool contract matches the base and fyToken
    function findPool(address base, address fyToken)
        private view returns (address pool)
    {
        pool = factory.getPool(base, fyToken);
        require (pool != address(0), "Pool not found");
    }

    /// @dev Allow users to route calls to a pool, to be used with multicall
    function route(address base, address fyToken, bytes memory data)
        external payable override
        returns (bool success, bytes memory result)
    {
        return _route(
            PoolAddresses(base, fyToken, findPool(base, fyToken)),
            data
        );
    }    

    /// @dev Allow users to trigger a token transfer to a pool, to be used with multicall
    function transferToPool(address base, address fyToken, address token, uint128 wad)
        external payable
        returns (bool)
    {
        return _transferToPool(
            PoolAddresses(base, fyToken, findPool(base, fyToken)),
            token, wad
        );
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with batch
    function _transferToPool(PoolAddresses memory addresses, address token, uint128 wad)
        private
        returns (bool)
    {
        require(token == addresses.base || token == addresses.fyToken || token == addresses.pool);
        IERC20(token).safeTransferFrom(msg.sender, address(addresses.pool), wad);
        return true;
    }

    /// @dev Allow users to route calls to a pool, to be used with batch
    function _route(PoolAddresses memory addresses, bytes memory data)
        private
        returns (bool success, bytes memory result)
    {
        (success, result) = addresses.pool.call(data);
        if (!success) revert(RevertMsgExtractor.getRevertMsg(result));
    }

    // ---- Permit management ----

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken, to be used with multicall
    function forwardPermit(address base, address fyToken, address token, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external payable
    {
        _forwardPermit(
            PoolAddresses(base, fyToken, findPool(base, fyToken)),
            token, spender, amount, deadline, v, r, s
        );
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken, to be used with multicall
    function forwardDaiPermit(address base, address fyToken, address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s)
        external payable
    {
        _forwardDaiPermit(
            PoolAddresses(base, fyToken, findPool(base, fyToken)),
            spender, nonce, deadline, allowed, v, r, s
        );
    }

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken, to be used with batch
    function _forwardPermit(PoolAddresses memory addresses, address token, address spender, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        private
    {
        require(token == addresses.base || token == addresses.fyToken || token == addresses.pool, "Mismatched token");
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken, to be used with batch
    function _forwardDaiPermit(PoolAddresses memory addresses, address spender, uint256 nonce, uint256 deadline, bool allowed, uint8 v, bytes32 r, bytes32 s)
        private
    {
        // Only the base token would ever be Dai
        DaiAbstract(addresses.base).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }

    // ---- Ether management ----

    /// @dev The WETH9 contract will send ether to the PoolRouter on `weth.withdraw` using this function.
    receive() external payable {
        require (msg.sender == address(weth), "Only Weth contract allowed");
    }

    /// @dev Accept Ether, wrap it and forward it to a pool
    function joinEther(address base, address fyToken)
        external payable
        returns (uint256 ethTransferred)
    {
        return _joinEther(findPool(base, fyToken));
    }

    /// @dev Unwrap Wrapped Ether held by this Router, and send the Ether
    function exitEther(address to)
        external payable
        returns (uint256 ethTransferred)
    {
        return _exitEther(to);
    }

    /// @dev Accept Ether, wrap it and forward it to the to a pool
    function _joinEther(address pool)
        private
        returns (uint256 ethTransferred)
    {
        ethTransferred = address(this).balance;

        weth.deposit{ value: ethTransferred }();   // TODO: Test gas savings using WETH10 `depositTo`
        IERC20(weth).safeTransfer(pool, ethTransferred);
    }

    /// @dev Unwrap Wrapped Ether held by this Router, and send the Ether
    function _exitEther(address to)
        private
        returns (uint256 ethTransferred)
    {
        ethTransferred = weth.balanceOf(address(this));

        weth.withdraw(ethTransferred);   // TODO: Test gas savings using WETH10 `withdrawTo`
        payable(to).safeTransferETH(ethTransferred); /// TODO: Consider reentrancy and safe transfers
    }
}
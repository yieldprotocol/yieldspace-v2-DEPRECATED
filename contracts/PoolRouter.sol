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

    struct PairAndPool {
        address base;
        address fyToken;
        address pool;
    }

    function execute(
        address[] calldata bases,
        address[] calldata fyTokens,
        uint8[] calldata pair,
        Operation[] calldata operations,
        bytes[] calldata data
    ) external {
        require(bases.length == fyTokens.length);
        PairAndPool[] memory pairs = new PairAndPool[](bases.length);
        for (uint256 i = 0; i < bases.length; i += 1) {
            pairs[i] = PairAndPool(bases[i], fyTokens[i], _findPool(bases[i], fyTokens[i]));
        }

        for (uint256 i = 0; i < operations.length; i += 1) {
            Operation operation = operations[i];
            PairAndPool memory selectedPair = pairs[pair[i]];
            
            if (operation == Operation.ROUTE) {
                route(selectedPair.pool, data[i]);
            } else if (operation == Operation.TRANSFER_TO_POOL) {
                transferToPool(selectedPair, data[i]);
            } else if (operation == Operation.FORWARD_PERMIT) {
                forwardPermit(selectedPair, data[i]);
            } else if (operation == Operation.FORWARD_DAI_PERMIT) {
                forwardDaiPermit(selectedPair, data[i]);
            } else if (operation == Operation.JOIN_ETHER) {
                joinEther(selectedPair);
            } else if (operation == Operation.EXIT_ETHER) {
                exitEther(IWETH9(selectedPair.base), data[i]);
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
    function route(address pool, bytes memory data)
        private
        returns (bool success, bytes memory result)
    {
        (success, result) = pool.call{ value: msg.value }(data);
        require(success, RevertMsgExtractor.getRevertMsg(result));
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with multicall
    function transferToPool(PairAndPool memory pair, bytes memory data)
        private
        returns (bool)
    {
        (uint128 wad, address token) = abi.decode(data, (uint128, address));
        require(token == pair.base || token == pair.fyToken || token == pair.pool);

        IERC20(token).safeTransferFrom(msg.sender, address(pair.pool), wad);
        return true;
    }

    // ---- Permit management ----

    /// @dev Execute an ERC2612 permit for the selected asset or fyToken
    function forwardPermit(PairAndPool memory pair, bytes memory data)
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
        
        require(token == pair.base || token == pair.fyToken || token == pair.pool);
        IERC2612(token).permit(msg.sender, spender, amount, deadline, v, r, s);
    }

    /// @dev Execute a Dai-style permit for the selected asset or fyToken
    function forwardDaiPermit(PairAndPool memory pair, bytes memory data)
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
        DaiAbstract(pair.base).permit(msg.sender, spender, nonce, deadline, allowed, v, r, s);
    }

    // ---- Ether management ----

    /// @dev The WETH9 contract will send ether to the PoolRouter on `weth.withdraw` using this function.
    receive() external payable { }

    /// @dev Accept Ether, wrap it and forward it to the WethJoin
    /// This function should be called first in a multicall, and the Join should keep track of stored reserves
    /// Passing the id for a join that doesn't link to a contract implemnting IWETH9 will fail
    function joinEther(PairAndPool memory pair)
        private
        returns (uint256 ethTransferred)
    {
        ethTransferred = address(this).balance;

        IWETH9 weth = IWETH9(pair.base);

        weth.deposit{ value: ethTransferred }();   // TODO: Test gas savings using WETH10 `depositTo`
        weth.transfer(address(pair.pool), ethTransferred);
    }

    /// @dev Unwrap Wrapped Ether held by this Ladle, and send the Ether
    /// This function should be called last in a multicall, and the Ladle should have no reason to keep an WETH balance
    function exitEther(IWETH9 weth, bytes memory data)
        private
        returns (uint256 ethTransferred)
    {
        (address payable to) = abi.decode(data, (address));
        // TODO: Set the WETH contract on constructor or as governance, to avoid calls to unknown contracts
        ethTransferred = weth.balanceOf(address(this));

        weth.withdraw(ethTransferred);   // TODO: Test gas savings using WETH10 `withdrawTo`
        to.transfer(ethTransferred); /// TODO: Consider reentrancy and safe transfers
    }
}
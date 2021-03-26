// SPDX-License-Identifier: GPL-3.0-or-later
// Taken from https://github.com/sushiswap/BoringSolidity/blob/441e51c0544cf2451e6116fe00515e71d7c42e2c/contracts/BoringBatchable.sol

pragma solidity ^0.8.0;
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./IPoolRouter.sol";
import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "./helpers/Batchable.sol";
import "./helpers/Ownable.sol";
import "./helpers/RevertMsgExtractor.sol";
import "./helpers/TransferFromHelper.sol";

contract PoolRouter is IPoolRouter, Ownable, Batchable {
    using TransferFromHelper for IERC20;

    mapping(address => mapping(address => IPool)) public pools;

    /// @dev Allow owner to register pools
    function setPool(address base, address fyToken, IPool pool)
        public override
        onlyOwner
    {
        pools[base][fyToken] = pool;
        emit PoolRegistered(base, fyToken, address(pool));
    }

    /// @dev Allow users to route calls to a pool, to be used with multicall
    function route(address base, address fyToken, bytes calldata data, bool revertOnFail)
        public payable override
        returns (bool success, bytes memory result)
    {
        IPool pool = pools[base][fyToken];
        require (pool != IPool(address(0)), "Pool not found");
        (success, result) = address(pool).call{ value: msg.value }(data);
        require(success || !revertOnFail, RevertMsgExtractor.getRevertMsg(result));
    }

    /// @dev Allow users to trigger a token transfer to a pool, to be used with multicall
    function transferToPool(address base, address fyToken, bool transferBase, uint128 wad)
        public payable override
        returns (bool)
    {
        IPool pool = pools[base][fyToken];
        require (pool != IPool(address(0)), "Pool not found");
        IERC20 token = transferBase ? pool.baseToken() : pool.fyToken();
        token.safeTransferFrom(msg.sender, address(pool), wad);
        return true;
    }
}
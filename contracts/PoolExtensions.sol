// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "./Pool.sol";

library PoolExtensions {

    /// @dev max amount of fyTokens that can be bought from the pool
    function maxFYTokenOut(Pool pool) external view returns (uint128) {
        (uint112 _baseCached, uint112 _fyTokenCached,) = pool.getCache();
        uint96 scaleFactor = pool.scaleFactor();
        return YieldMath.maxFYTokenOut(
            _baseCached * scaleFactor,
            _fyTokenCached * scaleFactor,
            pool.maturity() - uint32(block.timestamp),
            pool.ts(),
            pool.g1()
        ) / scaleFactor;
    }

    /// @dev max amount of fyTokens that can be sold into the pool
    function maxFYTokenIn(Pool pool) external view returns (uint128) {
        (uint112 _baseCached, uint112 _fyTokenCached,) = pool.getCache();
        uint96 scaleFactor = pool.scaleFactor();
        return YieldMath.maxFYTokenIn(
            _baseCached * scaleFactor,
            _fyTokenCached * scaleFactor,
            pool.maturity() - uint32(block.timestamp),
            pool.ts(),
            pool.g2()
        ) / scaleFactor;
    }

    /// @dev max amount of Base that can be sold to the pool
    function maxBaseIn(Pool pool) external view returns (uint128) {
        (uint112 _baseCached, uint112 _fyTokenCached,) = pool.getCache();
        uint96 scaleFactor = pool.scaleFactor();
        return YieldMath.maxBaseIn(
            _baseCached * scaleFactor,
            _fyTokenCached * scaleFactor,
            pool.maturity() - uint32(block.timestamp),
            pool.ts(),
            pool.g1()
        ) / scaleFactor;
    }

    /// @dev max amount of Base that can be bought from the pool
    function maxBaseOut(Pool pool) external view returns (uint128) {
        (uint112 _baseCached, uint112 _fyTokenCached,) = pool.getCache();
        uint96 scaleFactor = pool.scaleFactor();
        return YieldMath.maxBaseOut(
            _baseCached * scaleFactor,
            _fyTokenCached * scaleFactor,
            pool.maturity() - uint32(block.timestamp),
            pool.ts(),
            pool.g2()
        ) / scaleFactor;
    }
}

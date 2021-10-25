// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "./YieldMathExtensions.sol";


contract PoolView {
    using YieldMathExtensions for IPool;

    /// @dev Calculate the invariant for this pool
    function invariant(IPool pool) external view returns (uint128) {
        return pool.invariant();
    }

    function maxFYTokenOut(IPool pool) external view returns (uint128) {
        return pool.maxFYTokenOut();
    }

    function maxFYTokenIn(IPool pool) external view returns (uint128) {
        return pool.maxFYTokenIn();
    }

    function maxBaseIn(IPool pool) external view returns (uint128) {
        return pool.maxBaseIn();
    }

    function maxBaseOut(IPool pool) external view returns (uint128) {
        return pool.maxBaseOut();
    }

    function retrievableBase(IPool pool) external view returns (uint256) {
        (uint112 baseCached,,) = pool.getCache();
        return pool.base().balanceOf(address(pool)) - baseCached;
    }

    function retrievableFYToken(IPool pool) external view returns (uint256) {
        (, uint112 fyTokenCached,) = pool.getCache();
        return pool.fyToken().balanceOf(address(pool)) + pool.totalSupply() - fyTokenCached;
    }
}

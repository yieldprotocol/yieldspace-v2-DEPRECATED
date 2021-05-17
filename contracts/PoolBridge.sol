// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >= 0.8.0;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./PoolRouter.sol";


contract PoolBridge {

    PoolRouter public poolRouter;

    constructor(PoolRouter _poolRouter) {
        poolRouter = _poolRouter;
    }

    /// @dev Receive liquidity tokens from the pool found by the pool router according to the provided base token and fyToken
    /// The trader needs to have called `baseToken.approve` and `fyToken.approve`
    /// @param baseToken Base token
    /// @param fyToken fyToken
    /// @param minLiquid Minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function liquidize(address baseToken, address fyToken, uint256 baseLiquidity, uint256 fyLiquidity, uint256 minLiquid)
        external
        returns (uint256, uint256, uint256)
    {
        address pool = poolRouter.findPool(baseToken, fyToken);
        IERC20(baseToken).transferFrom(msg.sender, pool, baseLiquidity);
        IERC20(fyToken).transferFrom(msg.sender, pool, fyLiquidity);
        return IPool(pool).mint(msg.sender, false, minLiquid);
    }

    /// @dev Burn liquidity tokens and receive base tokens and fyTokens.
    /// The trader needs to have called `liquidToken.approve`
    /// @param liquidToken Pool
    /// @param liquidity Amount of pool tokens
    /// @param minBaseLiquidity The minimum amount of base tokens returned.
    /// @param minFyLiquidity The minimum amount of fyTokens returned.
    /// @return The amount of reserve tokens burned and returned (tokensBurned, baseTokens, fyTokens).
    function liquidate(address liquidToken, uint256 liquidity, uint256 minBaseLiquidity, uint256 minFyLiquidity)
        external
        returns (uint256, uint256, uint256)
    {
        IERC20(liquidToken).transferFrom(msg.sender, liquidToken, liquidity);
        return IPool(liquidToken).burn(msg.sender, minBaseLiquidity, minFyLiquidity);
    }

    /// @dev Transfer all liquidity from an expired pool to the target `liquifyingToken` pool
    /// The trader needs to have called `liquidToken.approve`
    /// @param liquifiedToken Pool
    /// @param liquidity The amount of pool tokens
    /// @param liquifyingToken Target pool
    /// @param fyLiquidity The amount of fyTokens liquified in the target pool
    /// @param minLiquid Minimum amount of target liquidity tokens received.
    /// @return The amount of target liquidity tokens minted.
    function liquify(address liquifiedToken, uint256 liquidity, address liquifyingToken, uint256 fyLiquidity, uint256 minLiquid)
        external
        returns (uint256, uint256, uint256)
    {
        IERC20(liquifiedToken).transferFrom(msg.sender, liquifiedToken, liquidity);
        (, uint256 baseLiquidity) = IPool(liquifiedToken).burnForBaseToken(address(this), 0);
        IERC20(IPool(liquifiedToken).baseToken()).transfer(liquifyingToken, baseLiquidity);
        return IPool(liquifyingToken).mintWithBaseToken(msg.sender, fyLiquidity, minLiquid);
    }

}
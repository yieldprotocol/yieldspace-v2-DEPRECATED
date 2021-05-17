// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >= 0.8.0;

import "@yield-protocol/utils-v2/contracts/token/IERC20.sol";
import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";


contract PoolBridge {

    IPoolFactory public factory;

    constructor(IPoolFactory _factory) {
        factory = _factory;
    }

    /// @dev Receive liquidity tokens from the pool found by the pool router according to the provided base token and fyToken
    /// The trader needs to have called `baseToken.approve` and `fyToken.approve`
    /// @param baseToken Base token
    /// @param fyToken fyToken
    /// @param baseTokenIn The amount of base token to be supplied as liquidity to the pool.
    /// @param fyTokenIn The amount of base token to be supplied as liquidity to the pool.
    /// @param minTokensMinted The minimum amount of liquidity tokens received.
    /// @return The amount of liquidity tokens minted.
    function mint(address baseToken, address fyToken, uint256 baseTokenIn, uint256 fyTokenIn, uint256 minTokensMinted)
        external
        returns (uint256, uint256, uint256)
    {
        address pool = factory.getPool(baseToken, fyToken);
        IERC20(baseToken).transferFrom(msg.sender, pool, baseTokenIn);
        IERC20(fyToken).transferFrom(msg.sender, pool, fyTokenIn);
        return IPool(pool).mint(msg.sender, false, minTokensMinted);
    }

    /// @dev Burn liquidity tokens and receive base tokens and fyTokens.
    /// The trader needs to have called `src.approve`
    /// @param src Pool
    /// @param amount Amount of pool tokens
    /// @param minBaseTokenOut The minimum amount of base tokens returned.
    /// @param minFYTokenOut The minimum amount of fyTokens returned.
    /// @return The amount of reserve tokens burned and returned (tokensBurned, baseTokens, fyTokens).
    function burn(address src, uint256 amount, uint256 minBaseTokenOut, uint256 minFYTokenOut)
        external
        returns (uint256, uint256, uint256)
    {
        IERC20(src).transferFrom(msg.sender, src, amount);
        return IPool(src).burn(msg.sender, minBaseTokenOut, minFYTokenOut);
    }

    /// @dev Transfer all liquidity from an expired pool to the target `dst` pool
    /// The trader needs to have called `src.approve`
    /// @param src Pool
    /// @param amount The amount of pool tokens
    /// @param dst Target pool
    /// @param fyTokenToBuy The amount of fyTokens liquified in the target pool
    /// @param minTokensMinted Minimum amount of target liquidity tokens received.
    /// @return The amount of target liquidity tokens minted.
    function bridge(address src, address dst, uint256 amount, uint256 fyTokenToBuy, uint256 minTokensMinted)
        external
        returns (uint256, uint256, uint256)
    {
        IERC20(src).transferFrom(msg.sender, src, amount);
        (, uint256 baseTokenOut) = IPool(src).burnForBaseToken(address(this), 0);
        IERC20(IPool(src).baseToken()).transfer(dst, baseTokenOut);
        return IPool(dst).mintWithBaseToken(msg.sender, fyTokenToBuy, minTokensMinted);
    }

}
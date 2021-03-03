// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "./IERC20.sol";
import "./IDelegable.sol";
import "./IERC2612.sol";
import "./IFYToken.sol";

interface IPool is IDelegable, IERC20, IERC2612 {
    function base() external view returns(IERC20);
    function fyToken() external view returns(IFYToken);
    function getBaseReserves() external view returns(uint128);
    function getFYTokenReserves() external view returns(uint128);
    function sellBase(address from, address to, uint128 baseIn) external returns(uint128);
    function buyBase(address from, address to, uint128 baseOut) external returns(uint128);
    function sellFYToken(address from, address to, uint128 fyTokenIn) external returns(uint128);
    function buyFYToken(address from, address to, uint128 fyTokenOut) external returns(uint128);
    function sellBasePreview(uint128 baseIn) external view returns(uint128);
    function buyBasePreview(uint128 baseOut) external view returns(uint128);
    function sellFYTokenPreview(uint128 fyTokenIn) external view returns(uint128);
    function buyFYTokenPreview(uint128 fyTokenOut) external view returns(uint128);
    function mint(address from, address to, uint256 fyTokenIn) external returns (uint256, uint256);
    function tradeAndMint(address from, address to, uint256 fyTokenIn, int256 baseToSell, uint256 maxBaseIn, uint256 minLpOut) external returns (uint256, uint256);
    function burn(address from, address to, uint256 tokensBurned) external returns (uint256, uint256);
    function burnAndTrade(address from, address to, uint256 tokensBurned, uint256 fyTokenToSell, uint256 minBaseOut, uint256 minFYTokenOut) external returns (uint256, uint256);
}
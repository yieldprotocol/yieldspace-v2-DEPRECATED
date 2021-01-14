// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "../YieldMath.sol";

/**
 * Wrapper for the  Yield Math Smart Contract Library.
 */
contract YieldMathWrapper {
  /**
   * Calculate the amount of fyDai a user would get for given amount of Dai.
   *
   * @param daiReserves Dai reserves amount
   * @param fyDaiReserves fyDai reserves amount
   * @param daiAmount Dai amount to be traded
   * @param timeTillMaturity time till maturity in seconds
   * @param k time till maturity coefficient, multiplied by 2^64
   * @param g fee coefficient, multiplied by 2^64
   * @return the amount of fyDai a user would get for given amount of Dai
   */
  function fyDaiOutForDaiIn(
    uint128 daiReserves, uint128 fyDaiReserves, uint128 daiAmount,
    uint128 timeTillMaturity, int128 k, int128 g)
  public pure returns(uint128) {
    return YieldMath.fyDaiOutForDaiIn(
      daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g
    );
  }

  /**
   * Calculate the amount of Dai a user would get for certain amount of fyDai.
   *
   * @param daiReserves Dai reserves amount
   * @param fyDaiReserves fyDai reserves amount
   * @param fyDaiAmount fyDai amount to be traded
   * @param timeTillMaturity time till maturity in seconds
   * @param k time till maturity coefficient, multiplied by 2^64
   * @param g fee coefficient, multiplied by 2^64
   * @return the amount of Dai a user would get for given amount of fyDai
   */
  function daiOutForFYDaiIn(
    uint128 daiReserves, uint128 fyDaiReserves, uint128 fyDaiAmount,
    uint128 timeTillMaturity, int128 k, int128 g)
  public pure returns(uint128) {
    return YieldMath.daiOutForFYDaiIn(
      daiReserves, fyDaiReserves, fyDaiAmount, timeTillMaturity, k, g
    );
  }

  /**
   * Calculate the amount of fyDai a user could sell for given amount of Dai.
   *
   * @param daiReserves Dai reserves amount
   * @param fyDaiReserves fyDai reserves amount
   * @param daiAmount Dai amount to be traded
   * @param timeTillMaturity time till maturity in seconds
   * @param k time till maturity coefficient, multiplied by 2^64
   * @param g fee coefficient, multiplied by 2^64
   * @return the amount of fyDai a user could sell for given amount of Dai
   */
  function fyDaiInForDaiOut(
    uint128 daiReserves, uint128 fyDaiReserves, uint128 daiAmount,
    uint128 timeTillMaturity, int128 k, int128 g)
  public pure returns(uint128) {
    return YieldMath.fyDaiInForDaiOut(
      daiReserves, fyDaiReserves, daiAmount, timeTillMaturity, k, g
    );
  }

  /**
   * Calculate the amount of Dai a user would have to pay for certain amount of
   * fyDai.
   *
   * @param daiReserves Dai reserves amount
   * @param fyDaiReserves fyDai reserves amount
   * @param fyDaiAmount fyDai amount to be traded
   * @param timeTillMaturity time till maturity in seconds
   * @param k time till maturity coefficient, multiplied by 2^64
   * @param g fee coefficient, multiplied by 2^64
   * @return the amount of Dai a user would have to pay for given amount of
   *         fyDai
   */
  function daiInForFYDaiOut(
    uint128 daiReserves, uint128 fyDaiReserves, uint128 fyDaiAmount,
    uint128 timeTillMaturity, int128 k, int128 g)
  public pure returns(uint128) {
    return YieldMath.daiInForFYDaiOut(
      daiReserves, fyDaiReserves, fyDaiAmount, timeTillMaturity, k, g
    );
  }

  /**
   * Raise given number x into power specified as a simple fraction y/z and then
   * multiply the result by the normalization factor 2^(128 *(1 - y/z)).
   * Revert if z is zero, or if both x and y are zeros.
   *
   * @param x number to raise into given power y/z
   * @param y numerator of the power to raise x into
   * @param z denominator of the power to raise x into
   * @return x raised into power y/z and then multiplied by 2^(128 *(1 - y/z))
   */
  function pow(uint128 x, uint128 y, uint128 z)
  public pure returns(bool, uint256) {
    return(
      true,
      Exp64x64.pow(x, y, z));
  }

  /**
   * Calculate base 2 logarithm of an unsigned 128-bit integer number.  Revert
   * in case x is zero.
   *
   * @param x number to calculate 2-base logarithm of
   * @return 2-base logarithm of x, multiplied by 2^121
   */
  function log_2(uint128 x)
  public pure returns(bool, uint128) {
    return(
      true,
      Exp64x64.log_2(x));
  }

  /**
   * Calculate 2 raised into given power.
   *
   * @param x power to raise 2 into, multiplied by 2^121
   * @return 2 raised into given power
   */
  function pow_2(uint128 x)
  public pure returns(bool, uint128) {
    return(
      true,
      Exp64x64.pow_2(x));
  }
}
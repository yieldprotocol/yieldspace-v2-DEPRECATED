// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;


library SafeCast {
    /// @dev Safe casting from uint256 to uint128
    function uint256ToUint128(uint256 x) internal pure returns(uint128) {
        require(
            x <= type(uint128).max,
            "SafeCast: Cast overflow"
        );
        return uint128(x);
    }
    /// @dev Safe casting from int256 to uint128
    function int256ToUint128(int256 x) internal pure returns(uint128) {
        require(
            x >= 0,
            "Pool: Cast underflow"
        );
        return uint128(x);
    }
    /// @dev Safe casting from uint256 to int256
    function uint256ToInt256(uint256 x) internal pure returns(int256) {
        require(
            x <= uint256(type(int256).max),
            "Pool: Cast overflow"
        );
        return int256(x);
    }
    /// @dev Safe casting from uint128 to int256
    function uint128ToInt256(uint128 x) internal pure returns(int256) {
        require(
            x >= 0,
            "Pool: Cast underflow"
        );
        return int256(x);
    }
}
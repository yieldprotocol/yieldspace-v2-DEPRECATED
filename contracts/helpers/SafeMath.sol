// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;


library SafeMath {
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x + y) >= x, "ds-math-add-overflow");
    }
    function add2(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require((z = x + y) >= x, "ds-math-add-overflow");
    }
    /// @dev Taken from vat.sol. x + y where y can be negative. Reverts if result is negative.
    function add3(uint256 x, int256 y) internal pure returns (uint256 z) {
        z = x + uint(y);
        require(y >= 0 || z <= x, "ds-math-add-underflow");
        require(y <= 0 || z >= x, "ds-math-add-overflow");
    }

    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x - y) <= x, "ds-math-sub-underflow");
    }
    /// @dev Overflow-protected substraction, from OpenZeppelin
    function sub2(uint128 a, uint128 b) internal pure returns (uint128) {
        require(b <= a, "Pool: fyToken reserves too low");
        uint128 c = a - b;

        return c;
    }
    /// @dev x - y where y can be negative. Reverts if result is negative.
    function sub3(uint256 x, int256 y) internal pure returns (uint256 z) {
        z = x - uint256(y);
        require(y <= 0 || z <= x, "ds-math-sub-overflow");
        require(y >= 0 || z >= x, "ds-math-sub-underflow");
    }
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y == 0 || (z = x * y) / y == x, "ds-math-mul-overflow");
    }
    function div(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y != 0, "ds-math-div-by-zero");
        z = x / y;
    }
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, "ds-math-mod-by-zero");
        return a % b;
    }
}

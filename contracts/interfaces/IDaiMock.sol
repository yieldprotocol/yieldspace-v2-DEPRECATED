// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "./IDai.sol";

interface IDaiMock is IDai {
    function mint(address to, uint256 amount) external;
}

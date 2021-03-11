// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "../helpers/ERC20Permit.sol";


contract BaseMock is ERC20Permit("Base", "BASE") {
  function mint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
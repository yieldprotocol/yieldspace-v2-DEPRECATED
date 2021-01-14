// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "../helpers/ERC20Permit.sol";


contract DaiMock is ERC20Permit("Dai", "DAI") {
  function mint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
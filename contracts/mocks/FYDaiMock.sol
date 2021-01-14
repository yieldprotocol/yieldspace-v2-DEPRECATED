// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "../helpers/ERC20Permit.sol";

contract FYDaiMock is ERC20Permit {
    uint256 public maturity;

    constructor (uint256 maturity_) ERC20Permit("Test", "TST") {
        maturity = maturity_;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }
}

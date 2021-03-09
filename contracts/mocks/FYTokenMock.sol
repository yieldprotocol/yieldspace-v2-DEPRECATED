// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "./BaseMock.sol";
import "../helpers/ERC20Permit.sol";

contract FYTokenMock is ERC20Permit {
    BaseMock public base;
    uint256 public maturity;

    constructor (BaseMock base_, uint256 maturity_) ERC20Permit("Test", "TST") {
        base = base_;
        maturity = maturity_;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }

    function redeem(address from, address to, uint256 amount) public {
        _burn(from, amount);
        base.mint(to, amount);
    }
}

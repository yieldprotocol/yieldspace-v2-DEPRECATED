// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;

import "../interfaces/IDaiMock.sol";
import "../helpers/ERC20Permit.sol";

contract FYDaiMock is ERC20Permit {
    IDaiMock public dai;
    uint256 public maturity;

    constructor (IDaiMock dai_, uint256 maturity_) ERC20Permit("Test", "TST") {
        dai = dai_;
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
        dai.mint(to, amount);
    }
}

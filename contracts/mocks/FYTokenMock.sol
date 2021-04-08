// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.1;

import "./BaseMock.sol";
import "@yield-protocol/utils/contracts/token/ERC20Permit.sol";

contract FYTokenMock is ERC20Permit {
    BaseMock public asset;
    uint32 public maturity;

    constructor (BaseMock asset_, uint32 maturity_) ERC20Permit("Test", "TST") {
        asset = asset_;
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
        asset.mint(to, amount);
    }

}

// SPDX-License-Identifier: BUSL-1.1
pragma solidity >= 0.8.0;

import "./BaseMock.sol";
import "@yield-protocol/utils-v2/contracts/token/ERC20Permit.sol";

contract FYTokenMock is ERC20Permit {
    BaseMock public base;
    uint32 public maturity;

    constructor (BaseMock base_, uint32 maturity_) 
        ERC20Permit(
            "Test",
            "TST",
            IERC20Metadata(address(base_)).decimals()
    ) {
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

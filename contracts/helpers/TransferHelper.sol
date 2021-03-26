// SPDX-License-Identifier: GPL-3.0-or-later
// Taken from https://github.com/Uniswap/uniswap-lib/blob/master/contracts/libraries/TransferHelper.sol

pragma solidity >=0.6.0;

import "@yield-protocol/utils/contracts/token/IERC20.sol";
import "./RevertMsgExtractor.sol";


// helper methods for interacting with ERC20 tokens and sending ETH that do not consistently return true/false
library TransferHelper {
    function safeTransfer(
        IERC20 token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            RevertMsgExtractor.getRevertMsg(data)
        );
    }
}
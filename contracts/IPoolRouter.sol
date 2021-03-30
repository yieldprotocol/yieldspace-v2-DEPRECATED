// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.1;

import "@yield-protocol/yieldspace-interfaces/IPool.sol";
import "./PoolTokenTypes.sol";

interface IPoolRouter {
  function route(address base, address fyToken, bytes calldata data, bool revertOnFail)
    external payable returns (bool success, bytes memory result);
  function transferToPool(address base, address fyToken, PoolTokenTypes.TokenType tokenType, uint128 wad)
    external payable returns (bool);
}
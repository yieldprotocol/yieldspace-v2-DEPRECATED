// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.1;

import "@yield-protocol/yieldspace-interfaces/IPool.sol";


interface IPoolRouter {
  event PoolRegistered(address indexed base, address indexed fyToken, address indexed pool);

  function setPool(address base, address fyToken, IPool pool) external;
  function route(address base, address fyToken, bytes calldata data, bool revertOnFail)
    external payable returns (bool success, bytes memory result);
  function transferToPool(address base, address fyToken, bool transferBase, uint128 wad)
    external payable returns (bool);
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.1;

interface IPoolFactory {
  event PoolCreated(address indexed baseToken, address indexed fyToken, address pool);

  function POOL_BYTECODE_HASH() external pure returns (bytes32);
  function calculatePoolAddress(address token, address fyToken) external view returns (address);
  function getPool(address token, address fyToken) external view returns (address);
  function createPool(address token, address fyToken) external returns (address);
  function nextToken() external view returns (address);
  function nextFYToken() external view returns (address);
}

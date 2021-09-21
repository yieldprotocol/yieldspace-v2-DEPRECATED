// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "@yield-protocol/utils-v2/contracts/access/AccessControl.sol";
import "@yield-protocol/utils-v2/contracts/utils/IsContract.sol";
import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "./Pool.sol";


/// @dev The PoolFactory can deterministically create new pool instances.
contract PoolFactory is IPoolFactory, AccessControl {
  event ParameterSet(bytes32 parameter, int128 value);

  /// Pre-hashing the bytecode allows calculatePoolAddress to be cheaper, and
  /// makes client-side address calculation easier
  bytes32 public constant override POOL_BYTECODE_HASH = keccak256(type(Pool).creationCode);

  address public override nextBase;
  address public override nextFYToken;
  int128 public override ts = int128(uint128(uint256((1 << 64))) / 315576000); // 1 / Seconds in 10 years, in 64.64
  int128 public override g1 = int128(uint128(uint256((950 << 64))) / 1000); // To be used when selling base to the pool. All constants are `ufixed`, to divide them they must be converted to uint256
  int128 public override g2 = int128(uint128(uint256((1000 << 64))) / 950); // To be used when selling fyToken to the pool. All constants are `ufixed`, to divide them they must be converted to uint256

  /// @dev Calculate the deterministic addreess of a pool, based on the base token & fy token.
  /// @param base Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return The calculated pool address.
  function calculatePoolAddress(address base, address fyToken) external view override returns (address) {
    return _calculatePoolAddress(base, fyToken);
  }

  /// @dev Create2 calculation
  function _calculatePoolAddress(address base, address fyToken)
    private view returns (address calculatedAddress)
  {
    calculatedAddress = address(uint160(uint256(keccak256(abi.encodePacked(
      bytes1(0xff),
      address(this),
      keccak256(abi.encodePacked(base, fyToken)),
      POOL_BYTECODE_HASH
    )))));
  }

  /// @dev Calculate the addreess of a pool, and return address(0) if not deployed.
  /// @param base Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return pool The deployed pool address.
  function getPool(address base, address fyToken) external view override returns (address pool) {
    pool = _calculatePoolAddress(base, fyToken);

    if(!IsContract.isContract(pool)) {
      pool = address(0);
    }
  }

  /// @dev Deploys a new pool.
  /// base & fyToken are written to temporary storage slots to allow for simpler
  /// address calculation, while still allowing the Pool contract to store the values as
  /// immutable.
  /// @param base Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return pool The pool address.
  function createPool(address base, address fyToken)
    external override
    auth
    returns (address)
  {
    nextBase = base;
    nextFYToken = fyToken;
    Pool pool = new Pool{salt: keccak256(abi.encodePacked(base, fyToken))}();
    nextBase = address(0);
    nextFYToken = address(0);
    
    emit PoolCreated(base, fyToken, address(pool));

    return address(pool);
  }

  /// @dev Set the ts, g1 or g2 parameters
  function setParameter(bytes32 parameter, int128 value)
      external
      auth
  {
      if (parameter == "ts") ts = value;
      else if (parameter == "g1") g1 = value;
      else if (parameter == "g2") g2 = value;
      else revert("Pool: Unrecognized parameter");
      emit ParameterSet(parameter, value);
  }
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >= 0.8.0;

import "@yield-protocol/yieldspace-interfaces/IPoolFactory.sol";
import "./Pool.sol";


/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly { size := extcodesize(account) }
        return size > 0;
    }
}

/// @dev The PoolFactory can deterministically create new pool instances.
contract PoolFactory is IPoolFactory {
  using Address for address;

  /// Pre-hashing the bytecode allows calculatePoolAddress to be cheaper, and
  /// makes client-side address calculation easier
  bytes32 public constant override POOL_BYTECODE_HASH = keccak256(type(Pool).creationCode);

  address private _nextBaseToken;
  address private _nextFYToken;

  /// @dev Calculate the deterministic addreess of a pool, based on the base token & fy token.
  /// @param baseToken Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return The calculated pool address.
  function calculatePoolAddress(address baseToken, address fyToken) external view override returns (address) {
    return _calculatePoolAddress(baseToken, fyToken);
  }

  /// @dev Create2 calculation
  function _calculatePoolAddress(address baseToken, address fyToken)
    private view returns (address calculatedAddress)
  {
    calculatedAddress = address(uint160(uint256(keccak256(abi.encodePacked(
      bytes1(0xff),
      address(this),
      keccak256(abi.encodePacked(baseToken, fyToken)),
      POOL_BYTECODE_HASH
    )))));
  }

  /// @dev Calculate the addreess of a pool, and return address(0) if not deployed.
  /// @param baseToken Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return pool The deployed pool address.
  function getPool(address baseToken, address fyToken) external view override returns (address pool) {
    pool = _calculatePoolAddress(baseToken, fyToken);

    if(!pool.isContract()) {
      pool = address(0);
    }
  }

  /// @dev Deploys a new pool.
  /// baseToken & fyToken are written to temporary storage slots to allow for simpler
  /// address calculation, while still allowing the Pool contract to store the values as
  /// immutable.
  /// @param baseToken Address of the base token (such as Base).
  /// @param fyToken Address of the fixed yield token (such as fyToken).
  /// @return pool The pool address.
  function createPool(address baseToken, address fyToken) external override returns (address) {
      _nextBaseToken = baseToken;
    _nextFYToken = fyToken;
    Pool pool = new Pool{salt: keccak256(abi.encodePacked(baseToken, fyToken))}();
    _nextBaseToken = address(0);
    _nextFYToken = address(0);

    pool.transferOwnership(msg.sender);
    
    emit PoolCreated(baseToken, fyToken, address(pool));

    return address(pool);
  }

  /// @dev Only used by the Pool constructor.
  /// @return The base token for the currently-constructing pool.
  function nextToken() external view override returns (address) {
    return _nextBaseToken;
  }

  /// @dev Only used by the Pool constructor.
  /// @return The fytoken for the currently-constructing pool.
  function nextFYToken() external view override returns (address) {
    return _nextFYToken;
  }
}

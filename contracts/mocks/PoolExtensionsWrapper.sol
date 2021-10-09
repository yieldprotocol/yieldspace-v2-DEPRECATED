// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.6;

import "../PoolExtensions.sol";

contract PoolExtensionsWrapper {

    function maxFYTokenOut(Pool pool) external view returns (uint128) {
        return PoolExtensions.maxFYTokenOut(pool);
    }

    function maxFYTokenIn(Pool pool) external view returns (uint128) {
        return PoolExtensions.maxFYTokenIn(pool);
    }

    function maxBaseIn(Pool pool) external view returns (uint128) {
        return PoolExtensions.maxBaseIn(pool);
    }

    function maxBaseOut(Pool pool) external view returns (uint128) {
        return PoolExtensions.maxBaseOut(pool);
    }
}
